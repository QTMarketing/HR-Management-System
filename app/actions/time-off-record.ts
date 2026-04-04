"use server";

import { revalidatePath } from "next/cache";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { TIME_OFF_TYPES } from "@/lib/time-clock/time-off-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateTimeOffRecordResult = { ok: true; id: string } | { ok: false; error: string };

const ALLOWED_TYPES = new Set<string>(TIME_OFF_TYPES);

async function gateManageTime(): Promise<CreateTimeOffRecordResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return {
      ok: false,
      error: "You need time clock management permission to record time off.",
    };
  }
  return null;
}

/**
 * Manager-logged time off from the timecard drawer (stored as approved).
 */
export async function createManagerTimeOffRecord(params: {
  locationId: string;
  employeeId: string;
  timeOffType: string;
  allDay: boolean;
  /** ISO timestamps */
  startAtIso: string;
  endAtIso: string;
  totalHours: number | null;
  daysOfLeave: number | null;
  managerNotes: string | null;
}): Promise<CreateTimeOffRecordResult> {
  const g = await gateManageTime();
  if (g) return g;

  const locationId = params.locationId?.trim();
  const employeeId = params.employeeId?.trim();
  const timeOffType = params.timeOffType?.trim() ?? "";

  if (!locationId || !employeeId) {
    return { ok: false, error: "Missing location or employee." };
  }
  if (!ALLOWED_TYPES.has(timeOffType)) {
    return { ok: false, error: "Invalid time off type." };
  }

  const start = Date.parse(params.startAtIso);
  const end = Date.parse(params.endAtIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false, error: "Invalid start or end time." };
  }
  if (end < start) {
    return { ok: false, error: "End must be on or after start." };
  }

  const notes = params.managerNotes?.trim() ?? "";
  if (notes.length > 2000) {
    return { ok: false, error: "Notes are too long." };
  }

  const supabase = await createSupabaseServerClient();
  const actorId = await resolveActorEmployeeId(supabase);
  if (!actorId) {
    return { ok: false, error: "Could not resolve your employee profile." };
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, location_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (empErr) return { ok: false, error: empErr.message };
  const row = emp as { id: string; location_id: string | null } | null;
  if (!row) return { ok: false, error: "Employee not found." };
  if (row.location_id !== locationId) {
    return { ok: false, error: "That employee is not assigned to this store." };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("time_off_records")
    .insert({
      employee_id: employeeId,
      location_id: locationId,
      time_off_type: timeOffType,
      all_day: params.allDay,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      total_hours: params.totalHours,
      days_of_leave: params.daysOfLeave,
      manager_notes: notes.length > 0 ? notes : null,
      recorded_by: actorId,
      status: "approved",
    })
    .select("id")
    .maybeSingle();

  if (insErr) return { ok: false, error: insErr.message };
  const id = (inserted as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: "Could not save time off." };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.TIME_OFF_RECORDED,
    targetEmployeeId: employeeId,
    locationId,
    metadata: { time_off_record_id: id, time_off_type: timeOffType },
  });

  revalidatePath("/time-clock");

  return { ok: true, id };
}
