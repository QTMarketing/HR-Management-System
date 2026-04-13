"use server";

import { revalidatePath } from "next/cache";
import { resolveActorEmployeeId } from "@/lib/audit/security-audit";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ERR_NO_EMPLOYEE_LINK =
  "Your login isn’t linked to an employee profile. Ask HR to add your work email under Users.";
const ERR_SELF_ONLY = "You can only start or end breaks on your own open shift.";

export type StartBreakInput = {
  timeEntryId: string;
  locationId: string;
  /** Default false — typical meal / compliance break is unpaid. */
  isPaid?: boolean;
};

export async function startBreak(input: StartBreakInput): Promise<ActionResult> {
  const timeEntryId = input.timeEntryId?.trim();
  const locationId = input.locationId?.trim();
  if (!timeEntryId || !locationId) {
    return { ok: false, error: "Missing time entry or location." };
  }
  const isPaid = Boolean(input.isPaid);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  if (process.env.RBAC_ENABLED === "true") {
    const ctx = await getRbacContext(supabase, user);
    if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_VIEW)) {
      return { ok: false, error: "You don’t have permission to use the time clock." };
    }
  }

  const actorEmployeeId = await resolveActorEmployeeId(supabase);
  if (!actorEmployeeId) {
    return { ok: false, error: ERR_NO_EMPLOYEE_LINK };
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("time_entries")
    .select("id, employee_id, location_id, clock_out_at, archived_at, time_clock_id")
    .eq("id", timeEntryId)
    .maybeSingle();

  if (fetchErr || !entry) {
    return { ok: false, error: fetchErr?.message ?? "Time entry not found." };
  }
  const e = entry as {
    employee_id: string;
    location_id: string;
    clock_out_at: string | null;
    archived_at: string | null;
    time_clock_id: string | null;
  };
  if (e.archived_at) {
    return { ok: false, error: "This time entry is archived." };
  }
  if (e.location_id !== locationId) {
    return { ok: false, error: "This time entry does not belong to this location." };
  }
  if (e.clock_out_at) {
    return { ok: false, error: "Clock out before starting a break." };
  }
  if (e.employee_id !== actorEmployeeId) {
    return { ok: false, error: ERR_SELF_ONLY };
  }

  const { data: existingOpen } = await supabase
    .from("time_entry_breaks")
    .select("id")
    .eq("time_entry_id", timeEntryId)
    .is("ended_at", null)
    .maybeSingle();

  if (existingOpen) {
    return { ok: false, error: "End your current break before starting another." };
  }

  const { error: insErr } = await supabase.from("time_entry_breaks").insert({
    time_entry_id: timeEntryId,
    started_at: new Date().toISOString(),
    is_paid: isPaid,
  });

  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/time-clock");
  if (e.time_clock_id) {
    revalidatePath(`/time-clock/${e.time_clock_id}`);
  }
  return { ok: true };
}

export type EndBreakInput = {
  breakId: string;
  locationId: string;
};

export async function endBreak(input: EndBreakInput): Promise<ActionResult> {
  const breakId = input.breakId?.trim();
  const locationId = input.locationId?.trim();
  if (!breakId || !locationId) {
    return { ok: false, error: "Missing break or location." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  if (process.env.RBAC_ENABLED === "true") {
    const ctx = await getRbacContext(supabase, user);
    if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_VIEW)) {
      return { ok: false, error: "You don’t have permission to use the time clock." };
    }
  }

  const actorEmployeeId = await resolveActorEmployeeId(supabase);
  if (!actorEmployeeId) {
    return { ok: false, error: ERR_NO_EMPLOYEE_LINK };
  }

  const { data: br, error: brErr } = await supabase
    .from("time_entry_breaks")
    .select("id, time_entry_id, ended_at")
    .eq("id", breakId)
    .maybeSingle();

  if (brErr || !br) {
    return { ok: false, error: brErr?.message ?? "Break not found." };
  }
  const b = br as { id: string; time_entry_id: string; ended_at: string | null };
  if (b.ended_at) {
    return { ok: false, error: "This break already ended." };
  }

  const { data: entry, error: enErr } = await supabase
    .from("time_entries")
    .select("id, employee_id, location_id, archived_at, time_clock_id")
    .eq("id", b.time_entry_id)
    .maybeSingle();

  if (enErr || !entry) {
    return { ok: false, error: enErr?.message ?? "Time entry not found." };
  }
  const e = entry as {
    employee_id: string;
    location_id: string;
    archived_at: string | null;
    time_clock_id: string | null;
  };
  if (e.archived_at) {
    return { ok: false, error: "This time entry is archived." };
  }
  if (e.location_id !== locationId) {
    return { ok: false, error: "This time entry does not belong to this location." };
  }
  if (e.employee_id !== actorEmployeeId) {
    return { ok: false, error: ERR_SELF_ONLY };
  }

  const { error: upErr } = await supabase
    .from("time_entry_breaks")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", breakId);

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  revalidatePath("/time-clock");
  if (e.time_clock_id) {
    revalidatePath(`/time-clock/${e.time_clock_id}`);
  }
  return { ok: true };
}
