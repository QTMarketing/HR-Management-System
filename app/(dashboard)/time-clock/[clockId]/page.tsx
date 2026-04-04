import { cookies } from "next/headers";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { TimeClockPanel } from "@/components/time-clock/time-clock-panel";
import { TimeClockDetailShell } from "@/components/time-clock/time-clock-detail-shell";
import { TimeClockSettingsForm } from "@/components/time-clock/time-clock-settings-form";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import { isAllLocations, resolveSelectedLocationId, type LocationRow } from "@/lib/dashboard/resolve-location";
import { attachBreakRollups, computeTodayMetrics, enrichPunchRows } from "@/lib/time-clock/enrich-punches";
import { getLocalDayBounds } from "@/lib/time-clock/punch-display";
import {
  getPeriodBounds,
  normalizePeriodConfig,
  parsePeriodKind,
  periodBoundsFromDateStrings,
  periodBoundsToQueryIso,
  type TimesheetPeriodKind,
} from "@/lib/time-clock/timesheet-period";
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { TimeSheetsPanel } from "@/components/time-clock/time-sheets-panel";
import { requirePermission } from "@/lib/rbac/guard";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { takeLatestPunchPerEmployee } from "@/lib/time-clock/dedupe-punches";
import type { TimeEntryBreakRow } from "@/lib/time-clock/breaks";
import { loadBreaksByEntryIds } from "@/lib/time-clock/load-entry-breaks";
import {
  attachPtoLabels,
  type TimeOffRecordForUi,
} from "@/lib/time-clock/time-off-display";

type PageProps = {
  params: Promise<{ clockId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimeClockDetailPage({ params, searchParams }: PageProps) {
  await requirePermission(PERMISSIONS.TIME_CLOCK_VIEW);

  const { clockId } = await params;
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);
  const canArchiveTimeEntries =
    !rbac.enabled || hasPermission(rbac, PERMISSIONS.TIME_CLOCK_MANAGE);

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);
  const locNameById = new Map((locRows ?? []).map((l) => [l.id, l.name] as const));

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);

  const { data: clock, error: clockErr } = await supabase
    .from("time_clocks")
    .select(
      "id, name, status, location_id, timesheet_period_kind, timesheet_period_config",
    )
    .eq("id", clockId)
    .maybeSingle();

  if (clockErr || !clock) {
    notFound();
  }

  if (!scopeAll && clock.location_id !== locationId) {
    redirect("/time-clock");
  }

  const effectiveLocationId = scopeAll ? clock.location_id : locationId;
  const locationName = scopeAll
    ? locNameById.get(clock.location_id) ?? "Location"
    : locations.find((l) => l.id === locationId)?.name ?? "Location";

  const isArchived = clock.status === "archived";

  const defaultKind = (clock.timesheet_period_kind as TimesheetPeriodKind) ?? "weekly";
  const defaultConfig = normalizePeriodConfig(
    (clock as { timesheet_period_config?: unknown }).timesheet_period_config,
    defaultKind,
  );

  const periodParam = typeof sp.period === "string" ? sp.period : undefined;
  const anchorParam = typeof sp.anchor === "string" ? sp.anchor : undefined;
  const rangeFromParam = typeof sp.range_from === "string" ? sp.range_from : undefined;
  const rangeToParam = typeof sp.range_to === "string" ? sp.range_to : undefined;
  const effectiveKind = parsePeriodKind(periodParam) ?? defaultKind;
  const effectiveConfig = normalizePeriodConfig(
    (clock as { timesheet_period_config?: unknown }).timesheet_period_config,
    effectiveKind,
  );

  const customBoundsFromUrl =
    rangeFromParam && rangeToParam
      ? periodBoundsFromDateStrings(rangeFromParam, rangeToParam)
      : null;

  let anchor = new Date();
  if (anchorParam && !customBoundsFromUrl) {
    const t = Date.parse(anchorParam);
    if (!Number.isNaN(t)) anchor = new Date(t);
  }

  const periodBounds =
    customBoundsFromUrl ?? getPeriodBounds(anchor, effectiveKind, effectiveConfig);
  const { gte: periodGte, lt: periodLt } = periodBoundsToQueryIso(periodBounds);

  const { data: empRows, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, role")
    .eq("location_id", effectiveLocationId)
    .eq("status", "active")
    .order("full_name", { ascending: true });

  const nameById = new Map((empRows ?? []).map((e) => [e.id, e.full_name] as const));
  const roleById = new Map((empRows ?? []).map((e) => [e.id, e.role ?? ""] as const));

  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);

  const { data: shiftsWindow } = await supabase
    .from("shifts")
    .select("employee_id, shift_start, shift_end, notes")
    .eq("location_id", effectiveLocationId)
    .gte("shift_start", since90.toISOString());

  const shiftsList = shiftsWindow ?? [];
  const { start: dayStart, end: dayEnd } = getLocalDayBounds();
  const shiftsToday = shiftsList.filter((s) => {
    const t = new Date(s.shift_start);
    return t >= dayStart && t < dayEnd;
  });

  let entries: EnrichedPunchRow[] = [];
  let clockedInNowRows: EnrichedPunchRow[] = [];
  let entriesError: string | null = empErr?.message ?? null;
  let todayMetrics: TimeClockTodayMetrics | null = null;

  try {
    const { data: rpcRows, error: rpcErr } = await supabase.rpc(
      "time_entries_latest_per_employee_for_clock",
      {
        p_time_clock_id: clockId,
        p_location_id: effectiveLocationId,
      },
    );

    let rawForToday: {
      id: string;
      employee_id: string;
      clock_in_at: string;
      clock_out_at: string | null;
      status: string;
      archived_at?: string | null;
      approved_at?: string | null;
      punch_source?: string | null;
      job_code?: string | null;
      edited_at?: string | null;
      edit_reason?: string | null;
    }[] = [];

    if (!rpcErr && rpcRows && Array.isArray(rpcRows)) {
      rawForToday = rpcRows as typeof rawForToday;
    } else {
      const { data: fallbackRaw, error: fbErr } = await supabase
        .from("time_entries")
        .select(
          "id, employee_id, clock_in_at, clock_out_at, status, archived_at, approved_at, punch_source, job_code, edited_at, edit_reason",
        )
        .eq("location_id", effectiveLocationId)
        .eq("time_clock_id", clockId)
        .is("archived_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(3000);

      if (fbErr) {
        entriesError = rpcErr?.message ?? fbErr.message;
      } else if (fallbackRaw) {
        rawForToday = takeLatestPunchPerEmployee(fallbackRaw);
      }
    }

    if (!entriesError) {
      entries = enrichPunchRows(rawForToday, nameById, roleById, shiftsList).sort((a, b) =>
        b.clockInAt.localeCompare(a.clockInAt),
      );
    }

    const { data: entriesToday } = await supabase
      .from("time_entries")
      .select(
        "id, employee_id, clock_in_at, clock_out_at, status, archived_at, approved_at, punch_source, job_code, edited_at, edit_reason",
      )
      .eq("time_clock_id", clockId)
      .is("archived_at", null)
      .gte("clock_in_at", dayStart.toISOString())
      .lt("clock_in_at", dayEnd.toISOString());

    const { data: openEntriesRaw } = await supabase
      .from("time_entries")
      .select(
        "id, employee_id, clock_in_at, clock_out_at, status, archived_at, approved_at, punch_source, job_code, edited_at, edit_reason",
      )
      .eq("time_clock_id", clockId)
      .eq("location_id", effectiveLocationId)
      .eq("status", "open")
      .is("archived_at", null)
      .order("clock_in_at", { ascending: true });

    const enrichedToday = enrichPunchRows(
      entriesToday ?? [],
      nameById,
      roleById,
      shiftsList,
    );
    clockedInNowRows = enrichPunchRows(openEntriesRaw ?? [], nameById, roleById, shiftsList);
    todayMetrics = computeTodayMetrics(shiftsToday, enrichedToday, clockedInNowRows.length);
  } catch (e) {
    entriesError =
      e instanceof Error ? e.message : "Could not load punches. Run migrations 006–007.";
  }

  /** Wider pool for timecard drill-down and Today context */
  const timesheetPoolSince = new Date();
  timesheetPoolSince.setDate(timesheetPoolSince.getDate() - 90);

  const { data: poolRaw } = await supabase
    .from("time_entries")
    .select(
      "id, employee_id, clock_in_at, clock_out_at, status, archived_at, approved_at, punch_source, job_code, edited_at, edit_reason",
    )
    .eq("time_clock_id", clockId)
    .is("archived_at", null)
    .gte("clock_in_at", timesheetPoolSince.toISOString())
    .order("clock_in_at", { ascending: false })
    .limit(2000);

  let employeeTimecardPool: EnrichedPunchRow[] =
    poolRaw && poolRaw.length > 0
      ? enrichPunchRows(poolRaw, nameById, roleById, shiftsList)
      : [];

  const { data: tsRaw } = await supabase
    .from("time_entries")
    .select(
      "id, employee_id, clock_in_at, clock_out_at, status, archived_at, approved_at, punch_source, job_code, edited_at, edit_reason",
    )
    .eq("time_clock_id", clockId)
    .is("archived_at", null)
    .gte("clock_in_at", periodGte)
    .lt("clock_in_at", periodLt)
    .order("clock_in_at", { ascending: false })
    .limit(5000);

  let timesheetRows: EnrichedPunchRow[] =
    tsRaw && tsRaw.length > 0
      ? enrichPunchRows(tsRaw, nameById, roleById, shiftsList)
      : [];

  const breakScopeIds = new Set<string>();
  for (const r of entries) breakScopeIds.add(r.id);
  for (const r of clockedInNowRows) breakScopeIds.add(r.id);
  for (const r of employeeTimecardPool) breakScopeIds.add(r.id);
  for (const r of timesheetRows) breakScopeIds.add(r.id);

  let breaksByEntryId = new Map<string, TimeEntryBreakRow[]>();
  try {
    breaksByEntryId = await loadBreaksByEntryIds(supabase, [...breakScopeIds]);
  } catch {
    breaksByEntryId = new Map();
  }

  const asOf = new Date();
  entries = attachBreakRollups(entries, breaksByEntryId, asOf);
  clockedInNowRows = attachBreakRollups(clockedInNowRows, breaksByEntryId, asOf);
  employeeTimecardPool =
    employeeTimecardPool.length > 0
      ? attachBreakRollups(employeeTimecardPool, breaksByEntryId, asOf)
      : [];
  timesheetRows =
    timesheetRows.length > 0 ? attachBreakRollups(timesheetRows, breaksByEntryId, asOf) : [];

  /**
   * Load approved time off that could affect any punch we show.
   * Do NOT bound the upper range with "now" or the current pay period only: `start_at < winEnd`
   * would drop all future-dated PTO (e.g. next week), so the query returned [] and PTO never appeared.
   */
  const fetchRangeStart = new Date(
    Math.min(since90.getTime(), periodBounds.start.getTime()) - 30 * 86400000,
  );
  const fetchRangeEnd = new Date(
    Math.max(periodBounds.endExclusive.getTime(), Date.now()) + 800 * 86400000,
  );

  let timeOffRecords: TimeOffRecordForUi[] = [];
  const { data: torRaw, error: torErr } = await supabase
    .from("time_off_records")
    .select("id, employee_id, time_off_type, start_at, end_at")
    .eq("location_id", effectiveLocationId)
    .eq("status", "approved")
    .lt("start_at", fetchRangeEnd.toISOString())
    .gt("end_at", fetchRangeStart.toISOString());

  if (torErr) {
    console.error("[time_off_records]", torErr.message);
  }
  if (torRaw && Array.isArray(torRaw)) {
    timeOffRecords = torRaw as TimeOffRecordForUi[];
  }

  if (timeOffRecords.length > 0) {
    // Today tab: one row per employee — show PTO in the same Mon–Sun week as the punch (not only that calendar day).
    entries = attachPtoLabels(entries, timeOffRecords, "week");
    clockedInNowRows = attachPtoLabels(clockedInNowRows, timeOffRecords, "week");
    employeeTimecardPool = attachPtoLabels(employeeTimecardPool, timeOffRecords, "day");
    timesheetRows = attachPtoLabels(timesheetRows, timeOffRecords, "day");
  }

  const storeEmployees = (empRows ?? []).map((e) => ({
    id: e.id,
    fullName: e.full_name?.trim() || "Employee",
  }));

  /** Phase 1: self-serve punch + geofence hint */
  let viewerEmployeeId: string | null = null;
  let viewerAtLocation = false;
  let viewerOpenEntryId: string | null = null;
  /** Phase 2: open break row for viewer’s open punch, if any. */
  let viewerOpenBreakId: string | null = null;
  let geofenceActive = false;

  const userEmail = user?.email?.trim();
  if (userEmail) {
    const { data: viewerEmp } = await supabase
      .from("employees")
      .select("id, location_id")
      .ilike("email", userEmail)
      .eq("status", "active")
      .maybeSingle();
    if (viewerEmp) {
      const ve = viewerEmp as { id: string; location_id: string | null };
      viewerEmployeeId = ve.id;
      viewerAtLocation = ve.location_id === effectiveLocationId;
      if (viewerAtLocation) {
        const { data: openRow } = await supabase
          .from("time_entries")
          .select("id")
          .eq("employee_id", ve.id)
          .eq("time_clock_id", clockId)
          .is("clock_out_at", null)
          .is("archived_at", null)
          .maybeSingle();
        viewerOpenEntryId = (openRow as { id: string } | null)?.id ?? null;
        if (viewerOpenEntryId) {
          const { data: openBreak, error: openBreakErr } = await supabase
            .from("time_entry_breaks")
            .select("id")
            .eq("time_entry_id", viewerOpenEntryId)
            .is("ended_at", null)
            .maybeSingle();
          if (!openBreakErr && openBreak) {
            viewerOpenBreakId = (openBreak as { id: string }).id;
          }
        }
      }
    }
  }

  const { data: locGeo } = await supabase
    .from("locations")
    .select("geofence_center_lat, geofence_center_lng, geofence_radius_meters")
    .eq("id", effectiveLocationId)
    .maybeSingle();
  const geoRow = locGeo as {
    geofence_center_lat: number | null;
    geofence_center_lng: number | null;
    geofence_radius_meters: number | null;
  } | null;
  geofenceActive =
    Boolean(geoRow) &&
    geoRow!.geofence_center_lat != null &&
    geoRow!.geofence_center_lng != null &&
    geoRow!.geofence_radius_meters != null &&
    (geoRow!.geofence_radius_meters ?? 0) > 0;

  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <TimeClockDetailShell
        clockId={clockId}
        clockName={clock.name}
        locationName={locationName}
        todayContent={
          <div className="space-y-4">
            {isArchived ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                This time clock is <strong>archived</strong>. New clock-ins are disabled. Use
                Timesheets to review history, or set status back to active in the database.
              </div>
            ) : null}
            {entriesError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {entriesError}
              </p>
            ) : null}
            <TimeClockPanel
              timeClockId={clockId}
              locationId={effectiveLocationId}
              clockName={clock.name}
              entries={entries}
              clockedInNow={clockedInNowRows}
              todayMetrics={todayMetrics}
              employeeTimecardPool={employeeTimecardPool}
              timeOffRecords={timeOffRecords}
              canManage={canArchiveTimeEntries}
              storeEmployees={storeEmployees}
              viewerEmployeeId={viewerEmployeeId}
              viewerAtLocation={viewerAtLocation}
              viewerOpenEntryId={viewerOpenEntryId}
              viewerOpenBreakId={viewerOpenBreakId}
              geofenceActive={geofenceActive}
              clockSelfServeDisabled={isArchived}
            />
          </div>
        }
        timesheetsContent={
          <TimeSheetsPanel
            rows={timesheetRows}
            modalPoolRows={employeeTimecardPool}
            timeOffRecords={timeOffRecords}
            locationId={effectiveLocationId}
            timeClockId={clockId}
            canArchive={canArchiveTimeEntries}
            periodKind={effectiveKind}
            periodConfig={effectiveConfig}
            periodStartIso={periodBounds.start.toISOString()}
            periodEndExclusiveIso={periodBounds.endExclusive.toISOString()}
            rangeFromYmd={customBoundsFromUrl ? rangeFromParam : null}
            rangeToYmd={customBoundsFromUrl ? rangeToParam : null}
            clockDefaultKind={defaultKind}
            storeEmployees={storeEmployees}
          />
        }
        settingsContent={
          <TimeClockSettingsForm
            key={`${clockId}-${defaultKind}-${JSON.stringify(defaultConfig)}`}
            timeClockId={clockId}
            initialKind={defaultKind}
            initialConfig={defaultConfig}
            canEdit={canArchiveTimeEntries}
          />
        }
        canManage={canArchiveTimeEntries}
      />
    </Suspense>
  );
}
