"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getTimeClockSmartGate,
  isEmployeeAllowedOnTimeClock,
} from "@/lib/time-clock/smart-group-gate";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function clockIn(
  employeeId: string,
  locationId: string,
  timeClockId: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();

  if (process.env.RBAC_ENABLED === "true") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const ctx = await getRbacContext(supabase, user);
    if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_VIEW)) {
      return { ok: false, error: "You don’t have permission to use the time clock." };
    }
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, location_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (empErr || !emp) {
    return { ok: false, error: empErr?.message ?? "Employee not found." };
  }
  if (emp.location_id !== locationId) {
    return { ok: false, error: "That employee is not assigned to this location." };
  }

  const { data: clock, error: clockErr } = await supabase
    .from("time_clocks")
    .select("id, location_id, status")
    .eq("id", timeClockId)
    .maybeSingle();

  if (clockErr || !clock) {
    return { ok: false, error: clockErr?.message ?? "Time clock not found." };
  }
  const c = clock as { location_id: string; status: string };
  if (c.location_id !== locationId) {
    return { ok: false, error: "Time clock does not belong to this store." };
  }
  if (c.status !== "active") {
    return { ok: false, error: "This time clock is archived." };
  }

  const gate = await getTimeClockSmartGate(supabase, timeClockId);
  if (gate.kind === "error") {
    return { ok: false, error: gate.message };
  }
  if (!isEmployeeAllowedOnTimeClock(gate, employeeId)) {
    return {
      ok: false,
      error:
        "This time clock is limited to smart groups. This employee is not in any group assigned to this clock. Add them under Users → Smart groups (members + Assignments), or remove the clock assignment.",
    };
  }

  const { data: open } = await supabase
    .from("time_entries")
    .select("id")
    .eq("employee_id", employeeId)
    .is("clock_out_at", null)
    .maybeSingle();

  if (open) {
    return { ok: false, error: "Already clocked in — clock out first." };
  }

  const { error: insErr } = await supabase.from("time_entries").insert({
    employee_id: employeeId,
    location_id: locationId,
    time_clock_id: timeClockId,
    clock_in_at: new Date().toISOString(),
    status: "open",
  });

  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  await supabase.from("activity_events").insert({
    employee_label: emp.full_name,
    action: "Clock in",
    status: "ok",
    location_id: locationId,
    occurred_at: new Date().toISOString(),
  });

  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  return { ok: true };
}

export async function clockOut(entryId: string, locationId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();

  if (process.env.RBAC_ENABLED === "true") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const ctx = await getRbacContext(supabase, user);
    if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_VIEW)) {
      return { ok: false, error: "You don’t have permission to use the time clock." };
    }
  }

  const { data: row, error: fetchErr } = await supabase
    .from("time_entries")
    .select("id, location_id, employee_id, clock_out_at, time_clock_id")
    .eq("id", entryId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? "Entry not found." };
  }
  if (row.location_id !== locationId) {
    return { ok: false, error: "Entry does not belong to this location." };
  }
  if (row.clock_out_at) {
    return { ok: false, error: "Already clocked out." };
  }

  const { data: emp } = await supabase
    .from("employees")
    .select("full_name")
    .eq("id", row.employee_id)
    .maybeSingle();

  const { error: upErr } = await supabase
    .from("time_entries")
    .update({
      clock_out_at: new Date().toISOString(),
      status: "closed",
    })
    .eq("id", entryId);

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  const name = emp?.full_name ?? "Employee";

  await supabase.from("activity_events").insert({
    employee_label: name,
    action: "Clock out",
    status: "ok",
    location_id: locationId,
    occurred_at: new Date().toISOString(),
  });

  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath("/time-clock");
  const tcId = (row as { time_clock_id?: string }).time_clock_id;
  if (tcId) {
    revalidatePath(`/time-clock/${tcId}`);
  }
  return { ok: true };
}
