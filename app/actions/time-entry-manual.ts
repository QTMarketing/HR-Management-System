"use server";

import { revalidatePath } from "next/cache";
import { resolveActorEmployeeId } from "@/lib/audit/security-audit";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateManagerShiftResult = { ok: true; id: string } | { ok: false; error: string };

async function gateManage(): Promise<CreateManagerShiftResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return { ok: false, error: "You need time clock management permission to add shifts." };
  }
  return null;
}

/**
 * Manager-created shift-like entry for the timesheet table.
 * Stored as a closed `time_entries` row with punch_source = manager_edit.
 */
export async function createManagerShiftEntry(params: {
  employeeId: string;
  locationId: string;
  timeClockId: string;
  startAtIso: string;
  endAtIso: string;
}): Promise<CreateManagerShiftResult> {
  const g = await gateManage();
  if (g) return g;

  const employeeId = params.employeeId?.trim();
  const locationId = params.locationId?.trim();
  const timeClockId = params.timeClockId?.trim();
  if (!employeeId || !locationId || !timeClockId) {
    return { ok: false, error: "Missing employee, store, or time clock." };
  }

  const start = Date.parse(params.startAtIso);
  const end = Date.parse(params.endAtIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false, error: "Invalid start or end time." };
  }
  if (end <= start) {
    return { ok: false, error: "End must be after start." };
  }

  const supabase = await createSupabaseServerClient();
  const actorId = await resolveActorEmployeeId(supabase);
  if (!actorId) return { ok: false, error: "Could not resolve your employee profile." };

  // Validate employee is assigned to this store.
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, location_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr) return { ok: false, error: empErr.message };
  const er = emp as { id: string; location_id: string | null } | null;
  if (!er) return { ok: false, error: "Employee not found." };
  if (er.location_id !== locationId) {
    return { ok: false, error: "That employee is not assigned to this store." };
  }

  // Validate clock belongs to store.
  const { data: clock, error: clockErr } = await supabase
    .from("time_clocks")
    .select("id, location_id, status")
    .eq("id", timeClockId)
    .maybeSingle();
  if (clockErr) return { ok: false, error: clockErr.message };
  const c = clock as { location_id: string; status: string } | null;
  if (!c) return { ok: false, error: "Time clock not found." };
  if (c.location_id !== locationId) return { ok: false, error: "Time clock does not belong to this store." };

  const { data: inserted, error: insErr } = await supabase
    .from("time_entries")
    .insert({
      employee_id: employeeId,
      location_id: locationId,
      time_clock_id: timeClockId,
      clock_in_at: new Date(start).toISOString(),
      clock_out_at: new Date(end).toISOString(),
      status: "closed",
      punch_source: "manager_edit",
      edited_at: new Date().toISOString(),
      edited_by: actorId,
      edit_reason: "Added from timesheet",
    })
    .select("id")
    .maybeSingle();

  if (insErr) return { ok: false, error: insErr.message };
  const id = (inserted as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: "Could not create shift entry." };

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  return { ok: true, id };
}

