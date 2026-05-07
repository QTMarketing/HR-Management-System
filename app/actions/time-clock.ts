"use server";

import { revalidatePath } from "next/cache";
import { resolveActorEmployeeId } from "@/lib/audit/security-audit";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isInsideGeofence, type GeofenceConfig } from "@/lib/time-clock/geofence";
import { normalizePunchSource, type PunchSource } from "@/lib/time-clock/punch-source";
import {
  getTimeClockSmartGate,
  isEmployeeAllowedOnTimeClock,
} from "@/lib/time-clock/smart-group-gate";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ERR_NO_EMPLOYEE_LINK =
  "Your login isn’t linked to an employee profile. Ask HR to add your work email under Users.";
const ERR_SELF_ONLY_IN = "You can only clock in for yourself.";
const ERR_SELF_ONLY_OUT = "You can only clock out your own open shift.";

export type ClockInInput = {
  employeeId: string;
  locationId: string;
  timeClockId: string;
  punchSource?: PunchSource;
  /** Idempotency key (e.g. UUID from mobile). Replays return success without a second row. */
  clientRequestId?: string | null;
  clockInLat?: number | null;
  clockInLng?: number | null;
  jobCodeId?: string | null;
  locationCodeId?: string | null;
};

export async function clockIn(input: ClockInInput): Promise<ActionResult> {
  const employeeId = input.employeeId?.trim();
  const locationId = input.locationId?.trim();
  const timeClockId = input.timeClockId?.trim();
  if (!employeeId || !locationId || !timeClockId) {
    return { ok: false, error: "Missing employee, location, or time clock." };
  }

  const punchSource = normalizePunchSource(input.punchSource);
  const clientRequestId = input.clientRequestId?.trim() || null;
  const jobCodeId = input.jobCodeId?.trim() || null;
  const locationCodeId = input.locationCodeId?.trim() || null;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to clock in." };
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
  if (actorEmployeeId !== employeeId) {
    return { ok: false, error: ERR_SELF_ONLY_IN };
  }

  if (clientRequestId) {
    const { data: existing } = await supabase
      .from("time_entries")
      .select("id")
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (existing) {
      return { ok: true };
    }
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, location_id, status, role")
    .eq("id", employeeId)
    .maybeSingle();

  if (empErr || !emp) {
    return { ok: false, error: empErr?.message ?? "Employee not found." };
  }
  const empStatus = String((emp as { status?: string }).status ?? "active");
  if (empStatus !== "active") {
    return {
      ok: false,
      error: "Archived or inactive employees can’t clock in.",
    };
  }
  const roleLabel = String((emp as { role?: string | null }).role ?? "");
  const isOwner =
    roleLabel.trim().toLowerCase().replace(/\s+/g, "_") === "owner" ||
    roleLabel.trim().toLowerCase().replace(/\s+/g, "_") === "org_owner" ||
    roleLabel.trim().toLowerCase().replace(/\s+/g, "_") === "organization_owner";

  if (!isOwner) {
    const homeOk = emp.location_id === locationId;
    if (!homeOk) {
      const { data: asg } = await supabase
        .from("employee_location_assignments")
        .select("employee_id")
        .eq("employee_id", employeeId)
        .eq("location_id", locationId)
        .maybeSingle();
      if (!asg) {
        return {
          ok: false,
          error:
            "You’re not assigned to this store. Ask a manager to add this store to your work locations.",
        };
      }
    }
  }

  const { data: loc, error: locErr } = await supabase
    .from("locations")
    .select("id, geofence_center_lat, geofence_center_lng, geofence_radius_meters")
    .eq("id", locationId)
    .maybeSingle();

  if (locErr || !loc) {
    return { ok: false, error: locErr?.message ?? "Location not found." };
  }

  const lr = loc as {
    geofence_center_lat: number | null;
    geofence_center_lng: number | null;
    geofence_radius_meters: number | null;
  };

  const fenceActive =
    lr.geofence_center_lat != null &&
    lr.geofence_center_lng != null &&
    lr.geofence_radius_meters != null &&
    lr.geofence_radius_meters > 0;

  if (fenceActive) {
    const lat = input.clockInLat;
    const lng = input.clockInLng;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return {
        ok: false,
        error:
          "This store requires GPS for clock-in. Enable location services and try again.",
      };
    }
    const fence: GeofenceConfig = {
      centerLat: lr.geofence_center_lat!,
      centerLng: lr.geofence_center_lng!,
      radiusMeters: lr.geofence_radius_meters!,
    };
    if (!isInsideGeofence(lat, lng, fence)) {
      return {
        ok: false,
        error: "Clock-in is outside the allowed area for this store.",
      };
    }
  }

  const { data: clock, error: clockErr } = await supabase
    .from("time_clocks")
    .select(
      "id, location_id, status, categorization_mode, require_categorization, location_tracking_mode, require_location_for_punch",
    )
    .eq("id", timeClockId)
    .maybeSingle();

  if (clockErr || !clock) {
    return { ok: false, error: clockErr?.message ?? "Time clock not found." };
  }
  const c = clock as {
    location_id: string;
    status: string;
    categorization_mode?: string | null;
    require_categorization?: boolean | null;
    location_tracking_mode?: string | null;
    require_location_for_punch?: boolean | null;
  };
  if (c.location_id !== locationId) {
    return { ok: false, error: "Time clock does not belong to this store." };
  }
  if (c.status !== "active") {
    return { ok: false, error: "This time clock is archived." };
  }

  const trackingMode = String(c.location_tracking_mode ?? "off");
  const trackingOn = trackingMode === "clock_in_out" || trackingMode === "breadcrumbs";
  const requireGps = Boolean(c.require_location_for_punch) || fenceActive || trackingOn;
  if (requireGps) {
    const lat = input.clockInLat;
    const lng = input.clockInLng;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return {
        ok: false,
        error: "Location access is required to clock in at this store.",
      };
    }
  }

  const catMode = (c.categorization_mode ?? "none") as string;
  const reqCat = Boolean(c.require_categorization);
  if (reqCat) {
    if (catMode === "job" && !jobCodeId) {
      return { ok: false, error: "Pick a job to clock in." };
    }
    if (catMode === "location" && !locationCodeId) {
      return { ok: false, error: "Pick a location to clock in." };
    }
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
    .is("archived_at", null)
    .maybeSingle();

  if (open) {
    return { ok: false, error: "Already clocked in — clock out first." };
  }

  const insertPayload: Record<string, unknown> = {
    employee_id: employeeId,
    location_id: locationId,
    time_clock_id: timeClockId,
    clock_in_at: new Date().toISOString(),
    status: "open",
    punch_source: punchSource,
  };
  if (jobCodeId) insertPayload.job_code_id = jobCodeId;
  if (locationCodeId) insertPayload.location_code_id = locationCodeId;

  if (clientRequestId) {
    insertPayload.client_request_id = clientRequestId;
  }
  if (input.clockInLat != null && input.clockInLng != null && !Number.isNaN(input.clockInLat) && !Number.isNaN(input.clockInLng)) {
    insertPayload.clock_in_lat = input.clockInLat;
    insertPayload.clock_in_lng = input.clockInLng;
  }

  const { error: insErr } = await supabase.from("time_entries").insert(insertPayload);

  if (insErr) {
    if (insErr.code === "23505" && clientRequestId) {
      return { ok: true };
    }
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

export type ClockOutInput = {
  entryId: string;
  locationId: string;
  clockOutLat?: number | null;
  clockOutLng?: number | null;
};

export async function clockOut(input: ClockOutInput): Promise<ActionResult> {
  const entryId = input.entryId?.trim();
  const locationId = input.locationId?.trim();
  if (!entryId || !locationId) {
    return { ok: false, error: "Missing entry or location." };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to clock out." };
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

  const { data: row, error: fetchErr } = await supabase
    .from("time_entries")
    .select("id, location_id, employee_id, clock_out_at, time_clock_id, archived_at")
    .eq("id", entryId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? "Entry not found." };
  }
  if ((row as { archived_at?: string | null }).archived_at) {
    return { ok: false, error: "This time entry is archived." };
  }
  if (row.location_id !== locationId) {
    return { ok: false, error: "Entry does not belong to this location." };
  }
  if (row.clock_out_at) {
    // Idempotency / double-click: treat as success.
    return { ok: true };
  }

  const punchEmployeeId = (row as { employee_id: string }).employee_id;
  if (actorEmployeeId !== punchEmployeeId) {
    return { ok: false, error: ERR_SELF_ONLY_OUT };
  }

  // Enforce location capture / geofence rules server-side for clock-out.
  const tcId = (row as { time_clock_id?: string | null }).time_clock_id ?? null;
  if (tcId) {
    const [{ data: loc }, { data: clock }] = await Promise.all([
      supabase
        .from("locations")
        .select("id, geofence_center_lat, geofence_center_lng, geofence_radius_meters")
        .eq("id", locationId)
        .maybeSingle(),
      supabase
        .from("time_clocks")
        .select("id, location_tracking_mode, require_location_for_punch")
        .eq("id", tcId)
        .maybeSingle(),
    ]);

    const lr = loc as
      | {
          geofence_center_lat: number | null;
          geofence_center_lng: number | null;
          geofence_radius_meters: number | null;
        }
      | null;
    const fenceActive =
      Boolean(lr) &&
      lr!.geofence_center_lat != null &&
      lr!.geofence_center_lng != null &&
      lr!.geofence_radius_meters != null &&
      (lr!.geofence_radius_meters ?? 0) > 0;

    const c = clock as
      | { location_tracking_mode?: string | null; require_location_for_punch?: boolean | null }
      | null;
    const trackingMode = String(c?.location_tracking_mode ?? "off");
    const trackingOn = trackingMode === "clock_in_out" || trackingMode === "breadcrumbs";
    const requireGps = Boolean(c?.require_location_for_punch) || fenceActive || trackingOn;

    if (requireGps) {
      const lat = input.clockOutLat;
      const lng = input.clockOutLng;
      if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
        return {
          ok: false,
          error: "Location access is required to clock out at this store.",
        };
      }
      if (fenceActive) {
        const fence: GeofenceConfig = {
          centerLat: lr!.geofence_center_lat!,
          centerLng: lr!.geofence_center_lng!,
          radiusMeters: lr!.geofence_radius_meters!,
        };
        if (!isInsideGeofence(lat, lng, fence)) {
          return { ok: false, error: "Clock-out is outside the allowed area for this store." };
        }
      }
    }
  }

  const { data: emp } = await supabase
    .from("employees")
    .select("full_name")
    .eq("id", row.employee_id)
    .maybeSingle();

  const clockOutIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    clock_out_at: clockOutIso,
    status: "closed",
  };
  if (
    input.clockOutLat != null &&
    input.clockOutLng != null &&
    !Number.isNaN(input.clockOutLat) &&
    !Number.isNaN(input.clockOutLng)
  ) {
    updatePayload.clock_out_lat = input.clockOutLat;
    updatePayload.clock_out_lng = input.clockOutLng;
  }

  const { error: upErr } = await supabase.from("time_entries").update(updatePayload).eq("id", entryId);

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  await supabase
    .from("time_entry_breaks")
    .update({ ended_at: clockOutIso })
    .eq("time_entry_id", entryId)
    .is("ended_at", null);

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
  if (tcId) revalidatePath(`/time-clock/${tcId}`);
  return { ok: true };
}
