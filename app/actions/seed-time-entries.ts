"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SeedTimeEntriesResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + mondayOffset);
  m.setHours(0, 0, 0, 0);
  return m;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function gateManageTime(): Promise<SeedTimeEntriesResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return {
      ok: false,
      error: "You need time clock management permission to add sample punches.",
    };
  }
  return null;
}

/**
 * Inserts closed `time_entries` for **previous calendar week + current calendar week** (Mon–Sun × 2)
 * for every active employee at the location, only on weekdays, only for employee-days that do not
 * already have a punch. Matches the default Timesheets week view so green cells appear without
 * navigating weeks.
 */
export async function seedSampleTimesheetPunches(
  timeClockId: string,
  locationId: string,
): Promise<SeedTimeEntriesResult> {
  const g = await gateManageTime();
  if (g) return g;

  const tcId = timeClockId?.trim();
  const locId = locationId?.trim();
  if (!tcId || !locId) return { ok: false, error: "Missing time clock or location." };

  const supabase = await createSupabaseServerClient();

  const now = new Date();
  const thisMon = startOfWeekMonday(now);
  const lastMon = addDays(thisMon, -7);
  /** End of current week (exclusive): Monday after this week */
  const rangeEnd = addDays(thisMon, 7);

  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("id")
    .eq("location_id", locId)
    .eq("status", "active");

  if (empErr) return { ok: false, error: empErr.message };
  const empIds = (employees ?? []).map((e) => (e as { id: string }).id);
  if (empIds.length === 0) return { ok: false, error: "No active employees found." };

  const { data: existing, error: exErr } = await supabase
    .from("time_entries")
    .select("id, employee_id, clock_in_at")
    .eq("time_clock_id", tcId)
    .eq("location_id", locId)
    .gte("clock_in_at", lastMon.toISOString())
    .lt("clock_in_at", rangeEnd.toISOString())
    .limit(4000);

  if (exErr) return { ok: false, error: exErr.message };

  const taken = new Map<string, Set<string>>();
  for (const row of existing ?? []) {
    const r = row as { employee_id: string; clock_in_at: string };
    const dk = localDayKey(new Date(r.clock_in_at));
    if (!taken.has(r.employee_id)) taken.set(r.employee_id, new Set());
    taken.get(r.employee_id)!.add(dk);
  }

  const inserts: Record<string, unknown>[] = [];
  for (let ei = 0; ei < empIds.length; ei++) {
    const employeeId = empIds[ei]!;
    const used = taken.get(employeeId) ?? new Set<string>();
    for (let di = 0; di < 14; di++) {
      const day = addDays(lastMon, di);
      const dk = localDayKey(day);
      if (used.has(dk)) continue;

      const dow = day.getDay();
      const isWeekend = dow === 0 || dow === 6;
      if (isWeekend && (ei + di) % 3 !== 0) continue;

      const varianceMin = ((ei * 17 + di * 13) % 91) - 45;
      const minutes = Math.max(450, Math.min(540, 480 + varianceMin));

      const start = new Date(day);
      start.setHours(9, 0, 0, 0);
      start.setMinutes(start.getMinutes() + (((ei + di) % 31) - 10));

      const end = new Date(start);
      end.setMinutes(end.getMinutes() + minutes);

      inserts.push({
        employee_id: employeeId,
        location_id: locId,
        time_clock_id: tcId,
        clock_in_at: start.toISOString(),
        clock_out_at: end.toISOString(),
        status: "closed",
      });
    }
  }

  if (inserts.length === 0) {
    return { ok: true, inserted: 0 };
  }

  const { error: insErr } = await supabase.from("time_entries").insert(inserts);
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${tcId}`);
  revalidatePath("/reports/labor");
  return { ok: true, inserted: inserts.length };
}

/** @deprecated Use seedSampleTimesheetPunches */
export async function seedLastWeekTimeEntries(
  timeClockId: string,
  locationId: string,
): Promise<SeedTimeEntriesResult> {
  return seedSampleTimesheetPunches(timeClockId, locationId);
}
