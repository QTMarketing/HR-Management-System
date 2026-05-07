import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTimeClockRowForDetailPage } from "@/lib/time-clock/load-time-clock-row";

/** Serializable props for `TimeClockSelfServe` (matches component contract). */
export type EmployeeHubSelfServeProps = {
  timeClockId: string;
  locationId: string;
  viewerEmployeeId: string | null;
  viewerEmployeeName?: string | null;
  viewerAtLocation: boolean;
  viewerHomeLocationId?: string | null;
  viewerHomeLocationName?: string | null;
  viewerHomeClockId?: string | null;
  viewerOpenEntryId: string | null;
  viewerOpenEntryClockInAt?: string | null;
  viewerOpenBreakId?: string | null;
  geofenceActive: boolean;
  locationTrackingMode: "off" | "clock_in_out" | "breadcrumbs" | string;
  requireLocationForPunch: boolean;
  categorizationMode: "none" | "job" | "location" | string;
  requireCategorization: boolean;
  jobCodes: { id: string; label: string }[];
  locationCodes: { id: string; label: string }[];
  breaksEnabled: boolean;
  allowPaidBreaks: boolean;
  disabled: boolean;
};

export type EmployeeNextShift = {
  shiftStart: string;
  shiftEnd: string;
  locationName: string | null;
  notes: string | null;
  isPublished: boolean;
};

export type LoadEmployeeHubDataResult = {
  selfServe: EmployeeHubSelfServeProps | null;
  clockMissingMessage: string | null;
  timeOffLocationId: string | null;
  nextShift: EmployeeNextShift | null;
};

export async function loadEmployeeHubData(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<LoadEmployeeHubDataResult> {
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, location_id, full_name")
    .eq("id", employeeId)
    .eq("status", "active")
    .maybeSingle();

  if (empErr || !emp) {
    return {
      selfServe: null,
      clockMissingMessage: "We could not load your employee profile.",
      timeOffLocationId: null,
      nextShift: null,
    };
  }

  const locationId = (emp as { location_id: string | null }).location_id;
  const fullName = (emp as { full_name?: string | null }).full_name ?? null;

  if (!locationId) {
    return {
      selfServe: null,
      clockMissingMessage: "Your profile has no home store. Ask HR to assign a location.",
      timeOffLocationId: null,
      nextShift: null,
    };
  }

  const { data: locRow } = await supabase
    .from("locations")
    .select("id, name, geofence_center_lat, geofence_center_lng, geofence_radius_meters")
    .eq("id", locationId)
    .maybeSingle();

  const locNameById = new Map<string, string>();
  if (locRow) {
    locNameById.set(
      (locRow as { id: string }).id,
      String((locRow as { name?: string }).name ?? "Store"),
    );
  }

  const { data: clockPick } = await supabase
    .from("time_clocks")
    .select("id")
    .eq("location_id", locationId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const clockId = (clockPick as { id?: string } | null)?.id ?? null;

  const nextShift = await loadNextShiftForEmployee(supabase, employeeId, locNameById);

  if (!clockId) {
    return {
      selfServe: null,
      clockMissingMessage: "No active time clock for your store yet. Ask a manager to set one up.",
      timeOffLocationId: locationId,
      nextShift,
    };
  }

  const { clock, error: clockErr } = await loadTimeClockRowForDetailPage(supabase, clockId);
  if (!clock || clockErr) {
    return {
      selfServe: null,
      clockMissingMessage: clockErr?.message ?? "Could not load your store time clock.",
      timeOffLocationId: locationId,
      nextShift,
    };
  }

  const tc = clock as Record<string, unknown>;
  const effectiveLocationId = String(tc.location_id ?? locationId);
  const isArchived = tc.status === "archived";

  const locationTrackingMode =
    (tc.location_tracking_mode as string | null | undefined) ?? "off";
  const requireLocationForPunch = Boolean(
    tc.require_location_for_punch as boolean | null | undefined,
  );
  const categorizationMode =
    (tc.categorization_mode as string | null | undefined) ?? "none";
  const requireCategorization = Boolean(
    tc.require_categorization as boolean | null | undefined,
  );
  const breaksEnabled = Boolean((tc.breaks_enabled as boolean | null | undefined) ?? true);
  const allowPaidBreaks = Boolean((tc.allow_paid_breaks as boolean | null | undefined) ?? true);
  const breaksModeRaw = String((tc.breaks_mode as unknown) ?? "manual");
  const breaksMode =
    breaksModeRaw === "disabled" || breaksModeRaw === "manual" || breaksModeRaw === "automatic"
      ? breaksModeRaw
      : "manual";

  const [{ data: jobCodesRaw }, { data: locationCodesRaw }] = await Promise.all([
    supabase
      .from("job_codes")
      .select("id, label, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    supabase
      .from("location_codes")
      .select("id, label, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
  ]);

  const jobCodes = (jobCodesRaw ?? []).map((r) => ({
    id: (r as { id: string }).id,
    label: (r as { label: string }).label,
  }));
  const locationCodes = (locationCodesRaw ?? []).map((r) => ({
    id: (r as { id: string }).id,
    label: (r as { label: string }).label,
  }));

  const geoRow = locRow as {
    geofence_center_lat: number | null;
    geofence_center_lng: number | null;
    geofence_radius_meters: number | null;
  } | null;
  const geofenceActive =
    Boolean(geoRow) &&
    geoRow!.geofence_center_lat != null &&
    geoRow!.geofence_center_lng != null &&
    geoRow!.geofence_radius_meters != null &&
    (geoRow!.geofence_radius_meters ?? 0) > 0;

  let viewerOpenEntryId: string | null = null;
  let viewerOpenEntryClockInAt: string | null = null;
  let viewerOpenBreakId: string | null = null;

  const { data: openRow } = await supabase
    .from("time_entries")
    .select("id, clock_in_at")
    .eq("employee_id", employeeId)
    .eq("time_clock_id", clockId)
    .is("clock_out_at", null)
    .is("archived_at", null)
    .maybeSingle();

  if (openRow) {
    viewerOpenEntryId = (openRow as { id: string }).id;
    viewerOpenEntryClockInAt = (openRow as { clock_in_at?: string }).clock_in_at ?? null;
    const { data: openBreak } = await supabase
      .from("time_entry_breaks")
      .select("id")
      .eq("time_entry_id", viewerOpenEntryId)
      .is("ended_at", null)
      .maybeSingle();
    if (openBreak) {
      viewerOpenBreakId = (openBreak as { id: string }).id;
    }
  }

  const selfServe: EmployeeHubSelfServeProps = {
    timeClockId: clockId,
    locationId: effectiveLocationId,
    viewerEmployeeId: employeeId,
    viewerEmployeeName: fullName?.trim() || null,
    viewerAtLocation: true,
    viewerHomeLocationId: locationId,
    viewerHomeLocationName: locNameById.get(locationId) ?? null,
    viewerHomeClockId: clockId,
    viewerOpenEntryId,
    viewerOpenEntryClockInAt,
    viewerOpenBreakId,
    geofenceActive,
    locationTrackingMode,
    requireLocationForPunch,
    categorizationMode,
    requireCategorization,
    jobCodes,
    locationCodes,
    breaksEnabled: breaksEnabled && breaksMode !== "disabled",
    allowPaidBreaks,
    disabled: isArchived,
  };

  return {
    selfServe,
    clockMissingMessage: null,
    timeOffLocationId: locationId,
    nextShift,
  };
}

async function loadNextShiftForEmployee(
  supabase: SupabaseClient,
  employeeId: string,
  locNameById: Map<string, string>,
): Promise<EmployeeNextShift | null> {
  const nowIso = new Date().toISOString();

  const { data: assigns, error: aErr } = await supabase
    .from("shift_assignments")
    .select("shift_id")
    .eq("employee_id", employeeId);

  if (aErr || !assigns?.length) return null;

  const shiftIds = [...new Set(assigns.map((r) => (r as { shift_id: string }).shift_id))];
  if (shiftIds.length === 0) return null;

  const { data: shiftRows, error: sErr } = await supabase
    .from("shifts")
    .select("shift_start, shift_end, notes, is_published, location_id")
    .in("id", shiftIds)
    .gt("shift_start", nowIso)
    .or("is_published.eq.true,is_published.is.null")
    .order("shift_start", { ascending: true })
    .limit(1);

  if (sErr || !shiftRows?.length) return null;

  const s = shiftRows[0] as {
    shift_start: string;
    shift_end: string;
    notes: string | null;
    is_published: boolean | null;
    location_id: string;
  };

  const lid = s.location_id;
  let locationName = locNameById.get(lid) ?? null;
  if (!locationName) {
    const { data: ln } = await supabase.from("locations").select("name").eq("id", lid).maybeSingle();
    locationName = (ln as { name?: string } | null)?.name ?? null;
  }

  return {
    shiftStart: s.shift_start,
    shiftEnd: s.shift_end,
    locationName,
    notes: s.notes,
    isPublished: s.is_published !== false,
  };
}
