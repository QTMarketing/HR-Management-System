"use server";

import { demoDashboardDrillRows } from "@/lib/mock/dashboard-drill-demo";
import type {
  DashboardDrillKind,
  DashboardDrillResult,
  DashboardDrillRow,
} from "@/lib/dashboard/drill-down-types";
import { ALL_LOCATIONS_ID } from "@/lib/dashboard/resolve-location";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type { DashboardDrillKind, DashboardDrillResult, DashboardDrillRow } from "@/lib/dashboard/drill-down-types";

const LATE_GRACE_MS = 30 * 60 * 1000;

function utcDayBoundsIso(): { startIso: string; endIso: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

type ShiftRow = {
  employee_id: string;
  location_id: string;
  shift_start: string;
  shift_end: string;
};

export async function getDashboardDrillDown(input: {
  kind: DashboardDrillKind;
  locationId: string;
  scopeAll: boolean;
  /** When the dashboard fell back to synthetic KPIs, return matching demo rows. */
  useDemoFallback: boolean;
  /** Shown in demo subtitles (e.g. location name). */
  scopeLabel: string;
}): Promise<DashboardDrillResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW)) {
    return { ok: false, error: "You don’t have permission to view this." };
  }

  if (input.useDemoFallback) {
    return { ok: true, rows: demoDashboardDrillRows(input.kind, input.scopeLabel) };
  }

  const locScoped =
    !input.scopeAll &&
    input.locationId.length > 0 &&
    input.locationId !== ALL_LOCATIONS_ID;

  try {
    if (input.kind === "avg_weekly_hours") {
      return { ok: true, rows: [] };
    }

    if (input.kind === "total_employees") {
      let q = supabase
        .from("employees")
        .select("id, full_name, location_id, locations:location_id ( name )")
        .eq("status", "active")
        .order("full_name", { ascending: true });
      if (locScoped) q = q.eq("location_id", input.locationId);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };
      const rows: DashboardDrillRow[] = (data ?? []).map((r: Record<string, unknown>) => {
        const loc = r.locations as { name?: string } | null;
        return {
          id: String(r.id),
          fullName: String(r.full_name ?? "Employee"),
          subtitle: loc?.name ?? "—",
        };
      });
      return { ok: true, rows };
    }

    const { startIso, endIso } = utcDayBoundsIso();

    if (input.kind === "scheduled_today") {
      let q = supabase
        .from("shifts")
        .select(
          "id, shift_start, employee_id, employees:employee_id ( id, full_name ), locations:location_id ( name )",
        )
        .gte("shift_start", startIso)
        .lt("shift_start", endIso)
        .order("shift_start", { ascending: true });
      if (locScoped) q = q.eq("location_id", input.locationId);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };
      const seen = new Set<string>();
      const rows: DashboardDrillRow[] = [];
      for (const s of data ?? []) {
        const row = s as Record<string, unknown>;
        const emp = row.employees as { id?: string; full_name?: string } | null;
        const loc = row.locations as { name?: string } | null;
        const eid = emp?.id;
        if (!eid || seen.has(eid)) continue;
        seen.add(eid);
        const t = new Date(String(row.shift_start ?? "")).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });
        rows.push({
          id: eid,
          fullName: String(emp?.full_name ?? "Employee"),
          subtitle: `${loc?.name ?? "Store"} · Shift ${t}`,
        });
      }
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
      return { ok: true, rows };
    }

    if (input.kind === "clocked_in_now") {
      let q = supabase
        .from("time_entries")
        .select(
          "id, clock_in_at, employee_id, employees:employee_id ( id, full_name ), locations:location_id ( name )",
        )
        .eq("status", "open")
        .is("archived_at", null)
        .order("clock_in_at", { ascending: false });
      if (locScoped) q = q.eq("location_id", input.locationId);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };
      const rows: DashboardDrillRow[] = (data ?? []).map((r: Record<string, unknown>) => {
        const emp = r.employees as { id?: string; full_name?: string } | null;
        const loc = r.locations as { name?: string } | null;
        const since = new Date(String(r.clock_in_at ?? "")).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });
        return {
          id: String(emp?.id ?? r.id),
          fullName: String(emp?.full_name ?? "Employee"),
          subtitle: `${loc?.name ?? "Store"} · Since ${since}`,
        };
      });
      return { ok: true, rows };
    }

    if (input.kind === "late_clock_ins" || input.kind === "late_clock_outs") {
      let shiftQ = supabase
        .from("shifts")
        .select("id, employee_id, location_id, shift_start, shift_end")
        .gte("shift_start", startIso)
        .lt("shift_start", endIso);
      if (locScoped) shiftQ = shiftQ.eq("location_id", input.locationId);
      const { data: shiftsRaw, error: shErr } = await shiftQ;
      if (shErr) return { ok: false, error: shErr.message };
      const shifts = (shiftsRaw ?? []) as ShiftRow[];
      if (!shifts.length) return { ok: true, rows: [] };

      const empIds = [...new Set(shifts.map((s) => s.employee_id))];
      let entQ = supabase
        .from("time_entries")
        .select("employee_id, clock_in_at, clock_out_at, status, location_id")
        .gte("clock_in_at", startIso)
        .lt("clock_in_at", endIso)
        .in("employee_id", empIds);
      if (locScoped) entQ = entQ.eq("location_id", input.locationId);
      const { data: entries, error: enErr } = await entQ;
      if (enErr) return { ok: false, error: enErr.message };

      const firstInByEmp = new Map<string, { clock_in_at: string; location_id: string }>();
      for (const e of entries ?? []) {
        const row = e as { employee_id: string; clock_in_at: string; location_id: string };
        const prev = firstInByEmp.get(row.employee_id);
        if (!prev || row.clock_in_at < prev.clock_in_at) {
          firstInByEmp.set(row.employee_id, {
            clock_in_at: row.clock_in_at,
            location_id: row.location_id,
          });
        }
      }

      const primaryShiftByEmp = new Map<string, ShiftRow>();
      for (const s of shifts) {
        const cur = primaryShiftByEmp.get(s.employee_id);
        if (!cur || new Date(s.shift_start) < new Date(cur.shift_start)) {
          primaryShiftByEmp.set(s.employee_id, s);
        }
      }

      const locIds = [...new Set(shifts.map((s) => s.location_id))];
      const { data: locRows } = await supabase.from("locations").select("id, name").in("id", locIds);
      const locName = new Map<string, string>();
      for (const l of locRows ?? []) {
        locName.set((l as { id: string }).id, String((l as { name: string }).name));
      }

      const { data: empRows } = await supabase
        .from("employees")
        .select("id, full_name")
        .in("id", empIds);
      const empName = new Map<string, string>();
      for (const e of empRows ?? []) {
        empName.set((e as { id: string }).id, String((e as { full_name: string }).full_name));
      }

      const byEmpEntry = new Map<
        string,
        { clock_in_at: string; clock_out_at: string | null; status: string; location_id: string }
      >();
      for (const e of entries ?? []) {
        const row = e as {
          employee_id: string;
          clock_in_at: string;
          clock_out_at: string | null;
          status: string;
          location_id: string;
        };
        const prev = byEmpEntry.get(row.employee_id);
        if (!prev || row.clock_in_at < prev.clock_in_at) {
          byEmpEntry.set(row.employee_id, {
            clock_in_at: row.clock_in_at,
            clock_out_at: row.clock_out_at,
            status: row.status,
            location_id: row.location_id,
          });
        }
      }

      const now = Date.now();

      if (input.kind === "late_clock_ins") {
        const lateIds: string[] = [];
        for (const [empId, sh] of primaryShiftByEmp) {
          const first = firstInByEmp.get(empId);
          if (!first) continue;
          const startMs = new Date(sh.shift_start).getTime();
          if (new Date(first.clock_in_at).getTime() > startMs + LATE_GRACE_MS) {
            lateIds.push(empId);
          }
        }
        const rows: DashboardDrillRow[] = lateIds.map((id) => {
          const sh = primaryShiftByEmp.get(id)!;
          const first = firstInByEmp.get(id)!;
          const store = locName.get(first.location_id) ?? locName.get(sh.location_id) ?? "Store";
          const minsLate = Math.max(
            0,
            Math.round(
              (new Date(first.clock_in_at).getTime() - new Date(sh.shift_start).getTime()) / 60000,
            ),
          );
          return {
            id,
            fullName: empName.get(id) ?? "Employee",
            subtitle: `${store} · ${minsLate} min past shift start`,
          };
        });
        rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
        return { ok: true, rows };
      }

      const lateOutIds: string[] = [];
      for (const [empId, sh] of primaryShiftByEmp) {
        const ent = byEmpEntry.get(empId);
        if (!ent) continue;
        const endMs = new Date(sh.shift_end).getTime();
        const graceEnd = endMs + LATE_GRACE_MS;
        if (ent.status === "open" && now > graceEnd) {
          lateOutIds.push(empId);
        } else if (ent.clock_out_at) {
          const outMs = new Date(ent.clock_out_at).getTime();
          if (outMs > graceEnd) {
            lateOutIds.push(empId);
          }
        }
      }
      const rows: DashboardDrillRow[] = lateOutIds.map((id) => {
        const sh = primaryShiftByEmp.get(id)!;
        const ent = byEmpEntry.get(id)!;
        const store = locName.get(ent.location_id) ?? locName.get(sh.location_id) ?? "Store";
        let subtitle = `${store} · Still clocked in past end`;
        if (ent.clock_out_at) {
          const minsAfter = Math.round(
            (new Date(ent.clock_out_at).getTime() - new Date(sh.shift_end).getTime()) / 60000,
          );
          subtitle = `${store} · ${minsAfter} min after shift end`;
        }
        return {
          id,
          fullName: empName.get(id) ?? "Employee",
          subtitle,
        };
      });
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
      return { ok: true, rows };
    }

    return { ok: true, rows: [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
