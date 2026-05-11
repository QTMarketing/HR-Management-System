"use server";

import { revalidatePath, updateTag } from "next/cache";
import { resolveActorEmployeeId } from "@/lib/audit/security-audit";
import { timeClockTag } from "@/lib/cache/tags";
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

/**
 * `true` when a Supabase RPC error is "function not in schema cache" —
 * which usually means migration 073 hasn't been applied yet against the
 * connected database. Detected via the PostgREST error code (`PGRST202`)
 * and a substring fallback for older clients that don't surface the code.
 *
 * Used to fall back to the pre-073 non-atomic write path so QA stays
 * unblocked when code ships ahead of the migration. Once the function
 * exists, this branch is dead and every punch goes through the atomic RPC.
 */
function isMissingRpcError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST202") return true;
  const msg = err.message ?? "";
  return /Could not find the function/i.test(msg) || /schema cache/i.test(msg);
}

const ERR_NO_EMPLOYEE_LINK =
  "Your login isn’t linked to an employee profile. Ask HR to add your work email under Users.";
const ERR_SELF_ONLY_IN = "You can only clock in for yourself.";
const ERR_SELF_ONLY_OUT = "You can only clock out your own open shift.";

/**
 * QA emails whose punches bypass the geofence radius check.
 *
 * Defaults include `emily@quicktrackinc.com` so cross-country QA works out of
 * the box. Production deployments can extend or override this list via the
 * `GEOFENCE_BYPASS_EMAILS` env var (comma- or semicolon-separated).
 *
 * Comparison is case-insensitive and trims whitespace; an exact email match
 * is required (no domain wildcards) so this can't be used to silently grant
 * a whole company.
 */
const QA_BYPASS_EMAILS: ReadonlySet<string> = (() => {
  const defaults = ["emily@quicktrackinc.com"];
  const fromEnv = (process.env.GEOFENCE_BYPASS_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s.includes("@"));
  return new Set([...defaults.map((s) => s.toLowerCase()), ...fromEnv]);
})();

function isQaBypassEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return QA_BYPASS_EMAILS.has(email.trim().toLowerCase());
}

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
    .select("id, full_name, email, location_id, status, role")
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

  // QA bypass for the geofence radius check. Triggers when:
  //   - the punching employee is an Owner (they audit/manage stores from any
  //     location anyway, and the home-store check above is already skipped
  //     for them — keeping geofence parity), OR
  //   - the email is in the QA bypass list (see QA_BYPASS_EMAILS), OR
  //   - we're running in local development (process.env.NODE_ENV ===
  //     "development"). Production builds are NEVER bypassed unless the user
  //     is an Owner or in the QA email allow-list.
  // Important: this only relaxes the *radius* check + the "GPS required
  // because a fence is configured" constraint. It does NOT skip
  // `require_location_for_punch` or location-tracking modes, which are
  // independent features.
  const empEmail = (emp as { email?: string | null }).email ?? null;
  const isDev = process.env.NODE_ENV === "development";
  const isBypassEmail = isQaBypassEmail(empEmail);
  const bypassGeofence = isOwner || isDev || isBypassEmail;

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

  const fenceConfigured =
    lr.geofence_center_lat != null &&
    lr.geofence_center_lng != null &&
    lr.geofence_radius_meters != null &&
    lr.geofence_radius_meters > 0;
  const fenceActive = fenceConfigured && !bypassGeofence;

  if (fenceConfigured && bypassGeofence) {
    console.warn(
      "[time-clock] geofence bypassed for clock-in",
      JSON.stringify({
        employee_id: employeeId,
        location_id: locationId,
        reason: isOwner
          ? "owner_role"
          : isBypassEmail
            ? "qa_bypass_email"
            : "dev_environment",
      }),
    );
  }

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

  // Atomic write: the RPC inserts the `time_entries` row AND the
  // `activity_events` audit entry in one transaction. If either fails,
  // both roll back, so the audit feed can never be out of sync with the
  // punches. Validation above (RBAC, geofence, smart-group, idempotency)
  // still happens here; the RPC is the write boundary only.
  const hasGps =
    input.clockInLat != null &&
    input.clockInLng != null &&
    !Number.isNaN(input.clockInLat) &&
    !Number.isNaN(input.clockInLng);
  const { error: rpcErr } = await supabase.rpc("clock_in_with_audit", {
    p_employee_id: employeeId,
    p_location_id: locationId,
    p_time_clock_id: timeClockId,
    p_punch_source: punchSource,
    p_client_request_id: clientRequestId,
    p_clock_in_lat: hasGps ? input.clockInLat : null,
    p_clock_in_lng: hasGps ? input.clockInLng : null,
    p_job_code_id: jobCodeId,
    p_location_code_id: locationCodeId,
    p_employee_label: emp.full_name ?? "Employee",
  });

  if (rpcErr) {
    // Replayed `client_request_id` lands as a unique-violation 23505. We
    // already short-circuited the obvious idempotent case above (line ~97),
    // but a tight race can still squeeze through to the insert. Treat as
    // success — the original punch is on file.
    if (rpcErr.code === "23505" && clientRequestId) {
      return { ok: true };
    }
    // Migration 073 not applied yet → fall back to the legacy two-step
    // write. Loses atomicity (audit insert can lag the punch), but keeps
    // QA unblocked. Apply the migration ASAP to restore the safety net.
    if (isMissingRpcError(rpcErr)) {
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
      if (clientRequestId) insertPayload.client_request_id = clientRequestId;
      if (hasGps) {
        insertPayload.clock_in_lat = input.clockInLat;
        insertPayload.clock_in_lng = input.clockInLng;
      }
      const { error: insErr } = await supabase
        .from("time_entries")
        .insert(insertPayload);
      if (insErr) {
        if (insErr.code === "23505" && clientRequestId) {
          return { ok: true };
        }
        return { ok: false, error: insErr.message };
      }
      await supabase.from("activity_events").insert({
        employee_label: emp.full_name ?? "Employee",
        action: "Clock in",
        status: "ok",
        location_id: locationId,
        occurred_at: new Date().toISOString(),
      });
      console.warn(
        "[time-clock] clock_in_with_audit RPC missing — used legacy fallback. Apply supabase/migrations/073_clock_in_out_atomic.sql.",
      );
    } else {
      return { ok: false, error: rpcErr.message };
    }
  }

  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  // Tag-based fan-out so any cached read of this clock's state (mobile
  // widgets, future API routes) drops immediately on punch.
  updateTag(timeClockTag(timeClockId));
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
  // Cross-location open punches: an employee may have been reassigned (or
  // their old store archived) after they clocked in. We allow them to close
  // their own stranded punch from the current portal as long as the entry's
  // original location is now archived. Closing a punch at *another active*
  // store still requires being on-site there.
  let isSelfHeal = false;
  if (row.location_id !== locationId) {
    const { data: priorLoc } = await supabase
      .from("locations")
      .select("status")
      .eq("id", row.location_id)
      .maybeSingle();
    const priorStatus = String((priorLoc as { status?: string } | null)?.status ?? "");
    const priorArchived = priorStatus === "archived";
    if (!priorArchived) {
      return { ok: false, error: "Entry does not belong to this location." };
    }
    isSelfHeal = true;
    console.warn(
      "[time-clock] closing stranded open punch from archived location",
      JSON.stringify({
        time_entry_id: entryId,
        entry_location_id: row.location_id,
        portal_location_id: locationId,
      }),
    );
  }
  // For the activity audit + geofence + cache invalidation we use the
  // *portal's* current location, not the entry's archived one. Reasons:
  //   1) RLS on `activity_events` requires the caller to be authorized for
  //      the location they write — Sam can't write at the archived
  //      Downtown Flagship anymore, so passing it RLS-rejects the audit
  //      insert and the whole RPC bails.
  //   2) The geofence at the archived store is moot — the user isn't
  //      physically there.
  // The `time_entries` row itself still updates correctly because the RPC
  // closes by `id`, not by location_id, so payroll keeps the original
  // store on the punch.
  const effectiveLocationId = isSelfHeal ? locationId : String(row.location_id);
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
    const [{ data: loc }, { data: clock }, { data: actorRow }] = await Promise.all([
      supabase
        .from("locations")
        .select("id, geofence_center_lat, geofence_center_lng, geofence_radius_meters")
        .eq("id", effectiveLocationId)
        .maybeSingle(),
      supabase
        .from("time_clocks")
        .select("id, location_tracking_mode, require_location_for_punch")
        .eq("id", tcId)
        .maybeSingle(),
      // Need role + email for the QA bypass; we already restricted clock-out
      // to the punch owner above (`actorEmployeeId === punchEmployeeId`), so
      // this is the right person to inspect.
      supabase
        .from("employees")
        .select("role, email")
        .eq("id", actorEmployeeId)
        .maybeSingle(),
    ]);

    const lr = loc as
      | {
          geofence_center_lat: number | null;
          geofence_center_lng: number | null;
          geofence_radius_meters: number | null;
        }
      | null;
    const fenceConfigured =
      Boolean(lr) &&
      lr!.geofence_center_lat != null &&
      lr!.geofence_center_lng != null &&
      lr!.geofence_radius_meters != null &&
      (lr!.geofence_radius_meters ?? 0) > 0;

    // Mirror clock-in: Owner role, QA bypass email, OR local dev relaxes the
    // radius + the "GPS required because a fence is configured" constraint.
    // Other GPS requirements (require_location_for_punch, location tracking)
    // still apply.
    const actor = actorRow as { role?: string | null; email?: string | null } | null;
    const roleKey = String(actor?.role ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const isOwner =
      roleKey === "owner" || roleKey === "org_owner" || roleKey === "organization_owner";
    const isDev = process.env.NODE_ENV === "development";
    const isBypassEmail = isQaBypassEmail(actor?.email ?? null);
    const bypassGeofence = isOwner || isDev || isBypassEmail;
    const fenceActive = fenceConfigured && !bypassGeofence;

    if (fenceConfigured && bypassGeofence) {
      console.warn(
        "[time-clock] geofence bypassed for clock-out",
        JSON.stringify({
          time_entry_id: entryId,
          employee_id: actorEmployeeId,
          location_id: effectiveLocationId,
          reason: isOwner
            ? "owner_role"
            : isBypassEmail
              ? "qa_bypass_email"
              : "dev_environment",
        }),
      );
    }

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

  // Atomic clock-out: the RPC closes the punch, ends any open break, and
  // writes the audit row in a single transaction. Idempotent — if the
  // entry is already closed (mobile double-click), the function returns
  // false and we report success so the UI doesn't show a spurious error.
  const hasGps =
    input.clockOutLat != null &&
    input.clockOutLng != null &&
    !Number.isNaN(input.clockOutLat) &&
    !Number.isNaN(input.clockOutLng);
  const { error: rpcErr } = await supabase.rpc("clock_out_with_audit", {
    p_entry_id: entryId,
    p_location_id: effectiveLocationId,
    p_clock_out_lat: hasGps ? input.clockOutLat : null,
    p_clock_out_lng: hasGps ? input.clockOutLng : null,
    p_employee_label: emp?.full_name ?? "Employee",
  });

  if (rpcErr) {
    // Migration 073 not applied yet → fall back to the legacy three-step
    // write so QA isn't blocked. Loses atomicity until the migration is
    // applied; the warning below makes that obvious in the dev console.
    if (isMissingRpcError(rpcErr)) {
      const clockOutIso = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        clock_out_at: clockOutIso,
        status: "closed",
      };
      if (hasGps) {
        updatePayload.clock_out_lat = input.clockOutLat;
        updatePayload.clock_out_lng = input.clockOutLng;
      }
      const { error: upErr } = await supabase
        .from("time_entries")
        .update(updatePayload)
        .eq("id", entryId);
      if (upErr) return { ok: false, error: upErr.message };

      await supabase
        .from("time_entry_breaks")
        .update({ ended_at: clockOutIso })
        .eq("time_entry_id", entryId)
        .is("ended_at", null);

      await supabase.from("activity_events").insert({
        employee_label: emp?.full_name ?? "Employee",
        action: "Clock out",
        status: "ok",
        location_id: effectiveLocationId,
        occurred_at: clockOutIso,
      });
      console.warn(
        "[time-clock] clock_out_with_audit RPC missing — used legacy fallback. Apply supabase/migrations/073_clock_in_out_atomic.sql.",
      );
    } else {
      return { ok: false, error: rpcErr.message };
    }
  }

  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath("/time-clock");
  if (tcId) {
    revalidatePath(`/time-clock/${tcId}`);
    updateTag(timeClockTag(tcId));
  }
  return { ok: true };
}
