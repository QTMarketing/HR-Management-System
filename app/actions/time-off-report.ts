"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { HrTimeOffLedgerCsvRow } from "@/lib/csv/hr-ledger-csv";

type Result = { ok: true; rows: HrTimeOffLedgerCsvRow[] } | { ok: false; error: string };

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function hoursFromTimeOffRecord(r: {
  total_hours?: unknown;
  start_at?: unknown;
  end_at?: unknown;
}): number {
  const th = toNum(r.total_hours);
  if (th != null) return Math.max(0, th);
  const s = typeof r.start_at === "string" ? Date.parse(r.start_at) : NaN;
  const e = typeof r.end_at === "string" ? Date.parse(r.end_at) : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.max(0, (e - s) / 3600000);
}

/**
 * Time-off ledger export rows for the current store scope.
 * `locationId` may be a single location UUID or the sentinel `"all"`.
 */
export async function getTimeOffLedgerExportRows(params: {
  locationId: string;
  year?: number;
}): Promise<Result> {
  const locationId = params.locationId?.trim();
  const year = params.year ?? new Date().getFullYear();
  if (!locationId) return { ok: false, error: "Missing location filter." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);
  if (rbac.enabled && !hasPermission(rbac, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return { ok: false, error: "You don't have permission to export time off." };
  }

  const scopeAll = locationId === "all";
  const ytdStart = new Date(year, 0, 1, 0, 0, 0, 0).toISOString();
  const ytdEndExclusive = new Date(year + 1, 0, 1, 0, 0, 0, 0).toISOString();

  // Employees in scope.
  // employment_start_date / rehired_at fuel the UI-only "Active Since" column;
  // they're carried on each row but excluded from the CSV writer.
  let empQuery = supabase
    .from("employees")
    .select("id, full_name, first_name, last_name, location_id, employment_start_date, rehired_at")
    .eq("status", "active");
  if (!scopeAll) empQuery = empQuery.eq("location_id", locationId);
  const { data: empRows, error: empErr } = await empQuery;
  if (empErr) return { ok: false, error: empErr.message };

  const employees = (empRows ?? []) as {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    location_id: string | null;
    employment_start_date: string | null;
    rehired_at: string | null;
  }[];
  const employeeIds = employees.map((e) => e.id);

  // Locations map.
  const { data: locRows, error: locErr } = await supabase
    .from("locations")
    .select("id, name")
    .neq("status", "archived");
  if (locErr) return { ok: false, error: locErr.message };
  const locNameById = new Map((locRows ?? []).map((l) => [String(l.id), String(l.name ?? "")] as const));

  // PTO balances (remaining) for both buckets.
  const { data: balRows, error: balErr } = await supabase
    .from("pto_employee_balances")
    .select("employee_id, bucket, balance_hours")
    .in("employee_id", employeeIds.length > 0 ? employeeIds : ["00000000-0000-0000-0000-000000000000"])
    .in("bucket", ["vacation", "sick"]);
  if (balErr) return { ok: false, error: balErr.message };

  const remainingVac = new Map<string, number>();
  const remainingSick = new Map<string, number>();
  for (const row of (balRows ?? []) as { employee_id: string; bucket: string; balance_hours: unknown }[]) {
    const hrs = toNum(row.balance_hours) ?? 0;
    if (row.bucket === "vacation") remainingVac.set(row.employee_id, hrs);
    if (row.bucket === "sick") remainingSick.set(row.employee_id, hrs);
  }

  // YTD used from approved time_off_records (source of truth for "used" in this export).
  let torQuery = supabase
    .from("time_off_records")
    .select("employee_id, time_off_type, start_at, end_at, total_hours, location_id")
    .eq("status", "approved")
    .gte("start_at", ytdStart)
    .lt("start_at", ytdEndExclusive);
  if (!scopeAll) torQuery = torQuery.eq("location_id", locationId);

  const { data: torRows, error: torErr } = await torQuery;
  if (torErr) return { ok: false, error: torErr.message };

  const usedVac = new Map<string, number>();
  const usedSick = new Map<string, number>();
  for (const row of (torRows ?? []) as {
    employee_id: string;
    time_off_type: string;
    start_at: string;
    end_at: string;
    total_hours: unknown;
  }[]) {
    const t = String(row.time_off_type ?? "");
    const h = hoursFromTimeOffRecord(row);
    if (h <= 0) continue;
    if (t === "PTO") usedVac.set(row.employee_id, (usedVac.get(row.employee_id) ?? 0) + h);
    if (t === "Sick leave") usedSick.set(row.employee_id, (usedSick.get(row.employee_id) ?? 0) + h);
  }

  const rows: HrTimeOffLedgerCsvRow[] = employees
    .map((e) => {
      const employeeName =
        (e.full_name && e.full_name.trim()) ||
        [e.first_name?.trim() ?? "", e.last_name?.trim() ?? ""].filter(Boolean).join(" ") ||
        "Employee";
      const locName = e.location_id ? locNameById.get(e.location_id) ?? "Store" : "Store";
      const remV = remainingVac.get(e.id) ?? 0;
      const remS = remainingSick.get(e.id) ?? 0;
      const usedV = usedVac.get(e.id) ?? 0;
      const usedS = usedSick.get(e.id) ?? 0;
      return {
        employeeId: e.id,
        locationId: e.location_id ?? undefined,
        storeLocation: locName,
        employeeName,
        employmentStartDate: e.employment_start_date ?? null,
        rehiredAt: e.rehired_at ?? null,
        totalVacationHrs: remV + usedV,
        totalSickHrs: remS + usedS,
        usedVacationHrs: usedV,
        remainingVacationHrs: remV,
        usedSickHrs: usedS,
        remainingSickHrs: remS,
        remarks: "",
      };
    })
    .sort((a, b) =>
      a.storeLocation === b.storeLocation
        ? a.employeeName.localeCompare(b.employeeName)
        : a.storeLocation.localeCompare(b.storeLocation),
    );

  return { ok: true, rows };
}

