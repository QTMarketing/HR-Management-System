"use server";

/**
 * Track C — server action behind the "Download Payroll CSV" button.
 *
 * Fetches everything needed for a Gusto-ready unified CSV (employees, punches,
 * breaks, holidays, approved PTO, hourly rates, and the active OT policy),
 * runs the same `calculatePayableHours` helper the timesheet panel uses, then
 * builds the CSV via `lib/csv/unified-payroll-csv`. RBAC: caller must hold
 * `time_clock.view`; ownership of the underlying time clock is enforced by RLS.
 */

import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildUnifiedPayrollCsv,
  unifiedPayrollCsvFilename,
  type UnifiedPayrollCsvRow,
} from "@/lib/csv/unified-payroll-csv";
import {
  calculatePayableHours,
  DEFAULT_PAYROLL_POLICY,
} from "@/lib/payroll/payable-hours";
import { getActivePayrollPolicy } from "@/lib/payroll/policy";
import { rollupBreakMinutes, type TimeEntryBreakRow } from "@/lib/time-clock/breaks";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GenerateUnifiedPayrollCsvInput = {
  timeClockId: string;
  startDateYmd: string;
  endDateYmd: string;
};

export type GenerateUnifiedPayrollCsvResult =
  | { ok: true; csv: string; filename: string; rowCount: number }
  | { ok: false; error: string };

/** Convert local YMD → local-midnight Date. */
function ymdToLocalDate(ymd: string, addDays = 0): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]) + addDays;
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

/** Coerce a Postgres `numeric` (string or number or null) to a finite number or null. */
function toNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Same paid-vs-unpaid PTO logic the UI already uses. */
function isPaidTimeOffType(type: string): boolean {
  return (type ?? "").trim().toLowerCase() !== "unpaid leave";
}

/** Overlap of two [a,b] intervals in milliseconds. */
function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return e > s ? e - s : 0;
}

/**
 * Build the Gusto-ready unified payroll CSV for a single time clock + window.
 *
 * The function name in the spec was `buildUnifiedPayrollCsv(timeClockId, startDate, endDate)`;
 * that pure builder lives in `lib/csv/unified-payroll-csv.ts`. This server
 * action wraps it with the data layer + RBAC.
 */
export async function generateUnifiedPayrollCsv(
  input: GenerateUnifiedPayrollCsvInput,
): Promise<GenerateUnifiedPayrollCsvResult> {
  if (!input.timeClockId?.trim()) return { ok: false, error: "Missing time clock." };
  if (!YMD_RE.test(input.startDateYmd)) return { ok: false, error: "Invalid start date." };
  if (!YMD_RE.test(input.endDateYmd)) return { ok: false, error: "Invalid end date." };
  if (input.endDateYmd < input.startDateYmd) {
    return { ok: false, error: "End date must be on or after start date." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);
  if (rbac.enabled && !hasPermission(rbac, PERMISSIONS.TIME_CLOCK_VIEW)) {
    return { ok: false, error: "You don't have permission to export payroll." };
  }

  const { data: clockRow, error: clockErr } = await supabase
    .from("time_clocks")
    .select("id, name, location_id, locations(name)")
    .eq("id", input.timeClockId)
    .maybeSingle();
  if (clockErr) return { ok: false, error: clockErr.message };
  if (!clockRow) return { ok: false, error: "Time clock not found." };

  type LocNested = { name?: string | null } | { name?: string | null }[] | null;
  const locNested = (clockRow as { locations?: LocNested }).locations ?? null;
  const locationName = Array.isArray(locNested)
    ? locNested[0]?.name ?? null
    : locNested?.name ?? null;
  const clockName = (clockRow as { name?: string | null }).name ?? null;
  const locationId = (clockRow as { location_id?: string | null }).location_id ?? null;

  // Local-day window: [start 00:00, end+1 00:00).
  const startLocal = ymdToLocalDate(input.startDateYmd, 0);
  const endExclusiveLocal = ymdToLocalDate(input.endDateYmd, 1);
  if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endExclusiveLocal.getTime())) {
    return { ok: false, error: "Invalid date range." };
  }
  const startIso = startLocal.toISOString();
  const endExclusiveIso = endExclusiveLocal.toISOString();

  // Resolve OT policy for this clock's location (store override → global).
  let policy = DEFAULT_PAYROLL_POLICY;
  try {
    const r = await getActivePayrollPolicy(supabase, locationId);
    policy = r.policy;
  } catch {
    policy = DEFAULT_PAYROLL_POLICY;
  }

  // Employees in scope: active + at this clock's location. (`location_id` is
  // null for org-wide clocks; in that case we'd need a different scoping rule
  // — out of scope for this export.)
  if (!locationId) {
    return {
      ok: false,
      error: "This time clock isn't bound to a store, so we can't produce a payroll CSV for it.",
    };
  }

  const { data: empRows, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, first_name, last_name, hourly_rate")
    .eq("location_id", locationId)
    .eq("status", "active")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (empErr) return { ok: false, error: empErr.message };

  type EmployeeRow = {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    hourly_rate: number | string | null;
  };
  const employees = (empRows ?? []) as EmployeeRow[];
  if (employees.length === 0) {
    // Still emit a valid (header-only) CSV so the download UX is consistent.
    const meta = {
      startDateYmd: input.startDateYmd,
      endDateYmd: input.endDateYmd,
      clockName,
      locationName,
    };
    return {
      ok: true,
      csv: buildUnifiedPayrollCsv(meta, []),
      filename: unifiedPayrollCsvFilename(meta),
      rowCount: 0,
    };
  }

  // Time entries within the window.
  const { data: entryRows, error: entryErr } = await supabase
    .from("time_entries")
    .select("id, employee_id, clock_in_at, clock_out_at, archived_at")
    .eq("time_clock_id", input.timeClockId)
    .is("archived_at", null)
    .gte("clock_in_at", startIso)
    .lt("clock_in_at", endExclusiveIso);
  if (entryErr) return { ok: false, error: entryErr.message };

  type EntryRow = {
    id: string;
    employee_id: string;
    clock_in_at: string;
    clock_out_at: string | null;
  };
  const entries = (entryRows ?? []) as EntryRow[];

  // Breaks for those entries (chunked .in() to keep URLs tame).
  const breaksByEntryId = new Map<string, TimeEntryBreakRow[]>();
  if (entries.length > 0) {
    const ids = entries.map((e) => e.id);
    const CHUNK = 400;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data: brRows, error: brErr } = await supabase
        .from("time_entry_breaks")
        .select("id, time_entry_id, started_at, ended_at, is_paid")
        .in("time_entry_id", slice);
      if (brErr) return { ok: false, error: brErr.message };
      for (const r of (brRows ?? []) as TimeEntryBreakRow[]) {
        const list = breaksByEntryId.get(r.time_entry_id) ?? [];
        list.push(r);
        breaksByEntryId.set(r.time_entry_id, list);
      }
    }
  }

  // Approved PTO overlapping the window. Pull a generous range so multi-day
  // requests bracketing the period get clipped correctly below.
  const { data: ptoRows, error: ptoErr } = await supabase
    .from("time_off_records")
    .select("id, employee_id, time_off_type, start_at, end_at")
    .eq("location_id", locationId)
    .eq("status", "approved")
    .lt("start_at", endExclusiveIso)
    .gt("end_at", startIso);
  if (ptoErr) return { ok: false, error: ptoErr.message };
  type PtoRow = {
    id: string;
    employee_id: string;
    time_off_type: string;
    start_at: string;
    end_at: string;
  };
  const ptos = (ptoRows ?? []) as PtoRow[];

  // Holidays inside the window.
  const { data: holidayRowsRaw } = await supabase
    .from("company_holidays")
    .select("holiday_date, is_paid, paid_hours")
    .gte("holiday_date", input.startDateYmd)
    .lte("holiday_date", input.endDateYmd);
  type HolidayRow = {
    holiday_date: string;
    is_paid: boolean | null;
    paid_hours: number | string | null;
  };
  const holidays = (holidayRowsRaw ?? []) as HolidayRow[];

  // Index: employees with any worked minutes per local day, so we can credit
  // holiday hours only when no one was clocked in (matches the panel UI).
  const workedMinutesByEmpDay = new Map<string, Set<string>>(); // empId -> set<dayKey>
  const workedMinutesByEmp = new Map<string, number>();
  const asOf = new Date();

  function localDayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function entryNetMinutes(entry: EntryRow): number {
    const start = Date.parse(entry.clock_in_at);
    const end = entry.clock_out_at ? Date.parse(entry.clock_out_at) : null;
    if (!Number.isFinite(start) || end === null || !Number.isFinite(end) || end <= start) {
      return 0;
    }
    const grossMins = Math.round((end - start) / 60000);
    const breaks = breaksByEntryId.get(entry.id) ?? [];
    const rollup = rollupBreakMinutes(breaks, asOf, entry.clock_out_at);
    return Math.max(0, grossMins - rollup.unpaidMinutes);
  }

  for (const entry of entries) {
    const mins = entryNetMinutes(entry);
    if (mins <= 0) continue;
    workedMinutesByEmp.set(
      entry.employee_id,
      (workedMinutesByEmp.get(entry.employee_id) ?? 0) + mins,
    );
    const dayKey = localDayKey(new Date(entry.clock_in_at));
    let set = workedMinutesByEmpDay.get(entry.employee_id);
    if (!set) {
      set = new Set<string>();
      workedMinutesByEmpDay.set(entry.employee_id, set);
    }
    set.add(dayKey);
  }

  // Per-employee holiday hours: for each paid holiday in the window, every
  // employee who didn't clock in that day gets `paid_hours ?? 8`.
  const paidHolidayHoursByEmp = new Map<string, number>();
  for (const h of holidays) {
    if (!h.is_paid) continue;
    const hours = toNumberOrNull(h.paid_hours) ?? 8;
    if (hours <= 0) continue;
    for (const emp of employees) {
      const workedDays = workedMinutesByEmpDay.get(emp.id);
      if (workedDays?.has(h.holiday_date)) continue;
      paidHolidayHoursByEmp.set(
        emp.id,
        (paidHolidayHoursByEmp.get(emp.id) ?? 0) + hours,
      );
    }
  }

  // Paid PTO overlap minutes per employee, clipped to the [start, endExclusive) window.
  const paidPtoMinutesByEmp = new Map<string, number>();
  const winStart = startLocal.getTime();
  const winEnd = endExclusiveLocal.getTime();
  for (const r of ptos) {
    if (!isPaidTimeOffType(r.time_off_type)) continue;
    const a = Date.parse(r.start_at);
    const b = Date.parse(r.end_at);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const mins = overlapMs(a, b, winStart, winEnd) / 60000;
    if (mins <= 0) continue;
    paidPtoMinutesByEmp.set(
      r.employee_id,
      (paidPtoMinutesByEmp.get(r.employee_id) ?? 0) + mins,
    );
  }

  // Build CSV rows.
  const csvRows: UnifiedPayrollCsvRow[] = employees.map((emp) => {
    const workedMinutes = workedMinutesByEmp.get(emp.id) ?? 0;
    const approvedPtoHours = (paidPtoMinutesByEmp.get(emp.id) ?? 0) / 60;
    const paidHolidayHours = paidHolidayHoursByEmp.get(emp.id) ?? 0;
    const hourlyRate = toNumberOrNull(emp.hourly_rate);
    const payable = calculatePayableHours({
      workedMinutes,
      approvedPtoHours,
      paidHolidayHours,
      hourlyRate,
      policy,
    });
    const fullName = emp.full_name?.trim() ?? "";
    const fallbackParts = fullName.split(/\s+/);
    const firstName = (emp.first_name?.trim() || fallbackParts[0] || "").trim();
    const lastName = (
      emp.last_name?.trim() ||
      fallbackParts.slice(1).join(" ") ||
      ""
    ).trim();
    return {
      employeeId: emp.id,
      firstName,
      lastName,
      location: locationName ?? "",
      payable,
    };
  });

  const meta = {
    startDateYmd: input.startDateYmd,
    endDateYmd: input.endDateYmd,
    clockName,
    locationName,
  };

  return {
    ok: true,
    csv: buildUnifiedPayrollCsv(meta, csvRows),
    filename: unifiedPayrollCsvFilename(meta),
    rowCount: csvRows.length,
  };
}
