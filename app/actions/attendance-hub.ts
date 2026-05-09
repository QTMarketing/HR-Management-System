"use server";

import type {
  AttendanceHubLeaveRow,
  AttendanceHubPresentRow,
  AttendanceHubResult,
  AttendanceHubScheduledRow,
} from "@/lib/dashboard/attendance-hub-types";
import { ALL_LOCATIONS_ID } from "@/lib/dashboard/resolve-location";
import { demoAttendanceHub } from "@/lib/mock/attendance-hub-demo";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type {
  AttendanceHubLeaveRow,
  AttendanceHubPresentRow,
  AttendanceHubResult,
  AttendanceHubScheduledRow,
} from "@/lib/dashboard/attendance-hub-types";

function utcDayBoundsIso(): { startIso: string; endIso: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function getAttendanceHub(input: {
  locationId: string;
  scopeAll: boolean;
  /** True when the dashboard is running on synthetic demo KPIs. */
  useDemoFallback: boolean;
  scopeLabel: string;
}): Promise<AttendanceHubResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW)) {
    return { ok: false, error: "You don’t have permission to view this." };
  }

  if (input.useDemoFallback) {
    return { ok: true, ...demoAttendanceHub(input.scopeLabel) };
  }

  const locScoped =
    !input.scopeAll &&
    input.locationId.length > 0 &&
    input.locationId !== ALL_LOCATIONS_ID;

  const { startIso, endIso } = utcDayBoundsIso();

  try {
    // ---------- Scheduled (today's shifts) ----------
    let shiftQ = supabase
      .from("shifts")
      .select("id, employee_id, location_id, shift_start, shift_end")
      .gte("shift_start", startIso)
      .lt("shift_start", endIso)
      .order("shift_start", { ascending: true });
    if (locScoped) shiftQ = shiftQ.eq("location_id", input.locationId);
    const { data: shiftsRaw, error: shErr } = await shiftQ;
    if (shErr) return { ok: false, error: shErr.message };
    type Shift = {
      employee_id: string;
      location_id: string;
      shift_start: string;
      shift_end: string;
    };
    const shifts = (shiftsRaw ?? []) as Shift[];

    // ---------- Present (open punches) ----------
    let openQ = supabase
      .from("time_entries")
      .select(
        "id, employee_id, location_id, clock_in_at, employees:employee_id ( id, full_name ), locations:location_id ( name )",
      )
      .eq("status", "open")
      .is("archived_at", null)
      .order("clock_in_at", { ascending: false });
    if (locScoped) openQ = openQ.eq("location_id", input.locationId);
    const { data: openRaw, error: opErr } = await openQ;
    if (opErr) return { ok: false, error: opErr.message };

    // ---------- First clock-in today per scheduled employee ----------
    const empIds = [...new Set(shifts.map((s) => s.employee_id))];
    let firstInByEmp = new Map<string, string>();
    if (empIds.length > 0) {
      let firstInQ = supabase
        .from("time_entries")
        .select("employee_id, clock_in_at")
        .gte("clock_in_at", startIso)
        .lt("clock_in_at", endIso)
        .in("employee_id", empIds);
      if (locScoped) firstInQ = firstInQ.eq("location_id", input.locationId);
      const { data: punchedRaw, error: pErr } = await firstInQ;
      if (pErr) return { ok: false, error: pErr.message };
      for (const e of punchedRaw ?? []) {
        const row = e as { employee_id: string; clock_in_at: string };
        const prev = firstInByEmp.get(row.employee_id);
        if (!prev || row.clock_in_at < prev) {
          firstInByEmp.set(row.employee_id, row.clock_in_at);
        }
      }
    }

    // Resolve employee + location names for shifts.
    const locIds = [...new Set(shifts.map((s) => s.location_id))];
    const locName = new Map<string, string>();
    if (locIds.length > 0) {
      const { data: locRows } = await supabase
        .from("locations")
        .select("id, name")
        .in("id", locIds);
      for (const l of locRows ?? []) {
        locName.set(
          (l as { id: string }).id,
          String((l as { name: string }).name ?? "Store"),
        );
      }
    }
    const empName = new Map<string, string>();
    if (empIds.length > 0) {
      const { data: empRows } = await supabase
        .from("employees")
        .select("id, full_name")
        .in("id", empIds);
      for (const e of empRows ?? []) {
        empName.set(
          (e as { id: string }).id,
          String((e as { full_name: string }).full_name ?? "Employee"),
        );
      }
    }

    // Pick earliest shift per employee (consistent with drill-down).
    const primaryShift = new Map<string, Shift>();
    for (const s of shifts) {
      const cur = primaryShift.get(s.employee_id);
      if (!cur || new Date(s.shift_start) < new Date(cur.shift_start)) {
        primaryShift.set(s.employee_id, s);
      }
    }

    const scheduled: AttendanceHubScheduledRow[] = [];
    for (const [empId, sh] of primaryShift) {
      scheduled.push({
        id: empId,
        fullName: empName.get(empId) ?? "Employee",
        storeName: locName.get(sh.location_id) ?? "Store",
        shiftStartIso: sh.shift_start,
        shiftEndIso: sh.shift_end,
        clockInAtIso: firstInByEmp.get(empId) ?? null,
      });
    }
    scheduled.sort(
      (a, b) =>
        new Date(a.shiftStartIso).getTime() -
          new Date(b.shiftStartIso).getTime() ||
        a.fullName.localeCompare(b.fullName),
    );

    // ---------- Present ----------
    const present: AttendanceHubPresentRow[] = (openRaw ?? []).map(
      (r: Record<string, unknown>) => {
        const emp = r.employees as { id?: string; full_name?: string } | null;
        const loc = r.locations as { name?: string } | null;
        return {
          id: String(emp?.id ?? r.id),
          fullName: String(emp?.full_name ?? "Employee"),
          storeName: String(loc?.name ?? "Store"),
          clockInAtIso: String(r.clock_in_at ?? ""),
        };
      },
    );

    // ---------- Leave (approved PTO overlapping today) ----------
    let ptoQ = supabase
      .from("time_off_records")
      .select(
        "id, employee_id, location_id, time_off_type, all_day, start_at, end_at, employees:employee_id ( id, full_name ), locations:location_id ( name )",
      )
      .eq("status", "approved")
      .lt("start_at", endIso)
      .gt("end_at", startIso)
      .order("start_at", { ascending: true });
    if (locScoped) ptoQ = ptoQ.eq("location_id", input.locationId);
    const { data: ptoRaw, error: ptoErr } = await ptoQ;
    if (ptoErr) return { ok: false, error: ptoErr.message };

    const onLeave: AttendanceHubLeaveRow[] = (ptoRaw ?? []).map(
      (r: Record<string, unknown>) => {
        const emp = r.employees as { id?: string; full_name?: string } | null;
        const loc = r.locations as { name?: string } | null;
        return {
          id: String(emp?.id ?? r.id),
          fullName: String(emp?.full_name ?? "Employee"),
          storeName: String(loc?.name ?? "Store"),
          leaveType: String(r.time_off_type ?? "Time off"),
          allDay: Boolean(r.all_day ?? false),
          startAtIso: String(r.start_at ?? ""),
          endAtIso: String(r.end_at ?? ""),
        };
      },
    );

    // De-dupe by employee — if someone has multiple overlapping records today
    // (rare), keep the first.
    const seenLeave = new Set<string>();
    const onLeaveDeduped = onLeave.filter((r) => {
      if (seenLeave.has(r.id)) return false;
      seenLeave.add(r.id);
      return true;
    });
    onLeaveDeduped.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return { ok: true, scheduled, present, onLeave: onLeaveDeduped };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
