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
      request_source: "manager",
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

function parseOptNum(raw: string | null | undefined): number | null {
  const t = (raw ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Employee submits time off for themselves — stored as **pending** until a manager approves.
 */
export async function requestEmployeeTimeOff(params: {
  locationId: string;
  employeeId: string;
  timeOffType: string;
  allDay: boolean;
  startAtIso: string;
  endAtIso: string;
  totalHours: string;
  daysOfLeave: string;
  employeeNotes: string | null;
}): Promise<CreateTimeOffRecordResult> {
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

  const notes = params.employeeNotes?.trim() ?? "";
  if (notes.length > 2000) {
    return { ok: false, error: "Notes are too long." };
  }

  const supabase = await createSupabaseServerClient();
  const actorId = await resolveActorEmployeeId(supabase);
  if (!actorId || actorId !== employeeId) {
    return {
      ok: false,
      error: "You can only request time off for your own profile (login must match your employee email).",
    };
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
    return { ok: false, error: "You are not assigned to this store." };
  }

  const th = parseOptNum(params.totalHours);
  const dLeave = parseOptNum(params.daysOfLeave);

  const { data: inserted, error: insErr } = await supabase
    .from("time_off_records")
    .insert({
      employee_id: employeeId,
      location_id: locationId,
      time_off_type: timeOffType,
      all_day: params.allDay,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      total_hours: th,
      days_of_leave: dLeave,
      employee_notes: notes.length > 0 ? notes : null,
      manager_notes: null,
      recorded_by: null,
      status: "pending",
      request_source: "employee",
    })
    .select("id")
    .maybeSingle();

  if (insErr) return { ok: false, error: insErr.message };
  const id = (inserted as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: "Could not submit request." };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.TIME_OFF_REQUEST_SUBMITTED,
    targetEmployeeId: employeeId,
    locationId,
    metadata: { time_off_record_id: id, time_off_type: timeOffType },
  });

  revalidatePath("/time-clock");

  return { ok: true, id };
}

export type ReviewTimeOffResult = { ok: true } | { ok: false; error: string };

export async function approveTimeOffRequest(
  recordId: string,
  locationId: string,
): Promise<ReviewTimeOffResult> {
  const g = await gateManageTime();
  if (g) return g;

  const id = recordId?.trim();
  const locId = locationId?.trim();
  if (!id || !locId) return { ok: false, error: "Missing request or location." };

  const supabase = await createSupabaseServerClient();
  const actorId = await resolveActorEmployeeId(supabase);
  if (!actorId) {
    return { ok: false, error: "Could not resolve your employee profile." };
  }

  const { data: rec, error: fetchErr } = await supabase
    .from("time_off_records")
    .select("id, employee_id, location_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  const r = rec as {
    employee_id: string;
    location_id: string;
    status: string;
  } | null;
  if (!r) return { ok: false, error: "Request not found." };
  if (r.location_id !== locId) {
    return { ok: false, error: "Request does not belong to this store." };
  }
  if (r.status !== "pending") {
    return { ok: false, error: "Only pending requests can be approved." };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("time_off_records")
    .update({
      status: "approved",
      reviewed_by: actorId,
      reviewed_at: now,
    })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.TIME_OFF_REQUEST_APPROVED,
    targetEmployeeId: r.employee_id,
    locationId: locId,
    metadata: { time_off_record_id: id },
  });

  revalidatePath("/time-clock");

  return { ok: true };
}

export async function denyTimeOffRequest(
  recordId: string,
  locationId: string,
  managerNote?: string | null,
): Promise<ReviewTimeOffResult> {
  const g = await gateManageTime();
  if (g) return g;

  const id = recordId?.trim();
  const locId = locationId?.trim();
  if (!id || !locId) return { ok: false, error: "Missing request or location." };

  const note = managerNote?.trim() ?? "";
  if (note.length > 2000) {
    return { ok: false, error: "Note is too long." };
  }

  const supabase = await createSupabaseServerClient();
  const actorId = await resolveActorEmployeeId(supabase);
  if (!actorId) {
    return { ok: false, error: "Could not resolve your employee profile." };
  }

  const { data: rec, error: fetchErr } = await supabase
    .from("time_off_records")
    .select("id, employee_id, location_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  const r = rec as { employee_id: string; location_id: string; status: string } | null;
  if (!r) return { ok: false, error: "Request not found." };
  if (r.location_id !== locId) {
    return { ok: false, error: "Request does not belong to this store." };
  }
  if (r.status !== "pending") {
    return { ok: false, error: "Only pending requests can be denied." };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("time_off_records")
    .update({
      status: "denied",
      reviewed_by: actorId,
      reviewed_at: now,
      manager_notes: note.length > 0 ? note : null,
    })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.TIME_OFF_REQUEST_DENIED,
    targetEmployeeId: r.employee_id,
    locationId: locId,
    metadata: { time_off_record_id: id },
  });

  revalidatePath("/time-clock");

  return { ok: true };
}
