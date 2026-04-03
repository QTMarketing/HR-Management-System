import { cookies } from "next/headers";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { TimeClockPanel } from "@/components/time-clock/time-clock-panel";
import { TimeClockDetailShell } from "@/components/time-clock/time-clock-detail-shell";
import { TimeClockSettingsForm } from "@/components/time-clock/time-clock-settings-form";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import { isAllLocations, resolveSelectedLocationId, type LocationRow } from "@/lib/dashboard/resolve-location";
import { computeTodayMetrics, enrichPunchRows } from "@/lib/time-clock/enrich-punches";
import { getLocalDayBounds } from "@/lib/time-clock/punch-display";
import {
  getPeriodBounds,
  normalizePeriodConfig,
  parsePeriodKind,
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
  const effectiveKind = parsePeriodKind(periodParam) ?? defaultKind;
  const effectiveConfig = normalizePeriodConfig(
    (clock as { timesheet_period_config?: unknown }).timesheet_period_config,
    effectiveKind,
  );

  let anchor = new Date();
  if (anchorParam) {
    const t = Date.parse(anchorParam);
    if (!Number.isNaN(t)) anchor = new Date(t);
  }

  const periodBounds = getPeriodBounds(anchor, effectiveKind, effectiveConfig);
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
  let entriesError: string | null = empErr?.message ?? null;
  let todayMetrics: TimeClockTodayMetrics | null = null;

  try {
    const { data: raw, error } = await supabase
      .from("time_entries")
      .select("id, employee_id, clock_in_at, clock_out_at, status, archived_at")
      .eq("location_id", effectiveLocationId)
      .eq("time_clock_id", clockId)
      .is("archived_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(50);

    if (error) {
      entriesError = error.message;
    } else if (raw) {
      entries = enrichPunchRows(raw, nameById, roleById, shiftsList);
    }

    const { data: entriesToday } = await supabase
      .from("time_entries")
      .select("id, employee_id, clock_in_at, clock_out_at, status, archived_at")
      .eq("time_clock_id", clockId)
      .is("archived_at", null)
      .gte("clock_in_at", dayStart.toISOString())
      .lt("clock_in_at", dayEnd.toISOString());

    const { count: openCount } = await supabase
      .from("time_entries")
      .select("*", { count: "exact", head: true })
      .eq("time_clock_id", clockId)
      .eq("status", "open")
      .is("archived_at", null);

    const enrichedToday = enrichPunchRows(
      entriesToday ?? [],
      nameById,
      roleById,
      shiftsList,
    );
    todayMetrics = computeTodayMetrics(shiftsToday, enrichedToday, openCount ?? 0);
  } catch (e) {
    entriesError =
      e instanceof Error ? e.message : "Could not load punches. Run migrations 006–007.";
  }

  /** Wider pool for timecard drill-down and Today context */
  const timesheetPoolSince = new Date();
  timesheetPoolSince.setDate(timesheetPoolSince.getDate() - 90);

  const { data: poolRaw } = await supabase
    .from("time_entries")
    .select("id, employee_id, clock_in_at, clock_out_at, status, archived_at")
    .eq("time_clock_id", clockId)
    .is("archived_at", null)
    .gte("clock_in_at", timesheetPoolSince.toISOString())
    .order("clock_in_at", { ascending: false })
    .limit(2000);

  const employeeTimecardPool: EnrichedPunchRow[] =
    poolRaw && poolRaw.length > 0
      ? enrichPunchRows(poolRaw, nameById, roleById, shiftsList)
      : [];

  const { data: tsRaw } = await supabase
    .from("time_entries")
    .select("id, employee_id, clock_in_at, clock_out_at, status, archived_at")
    .eq("time_clock_id", clockId)
    .is("archived_at", null)
    .gte("clock_in_at", periodGte)
    .lt("clock_in_at", periodLt)
    .order("clock_in_at", { ascending: false })
    .limit(5000);

  const timesheetRows: EnrichedPunchRow[] =
    tsRaw && tsRaw.length > 0
      ? enrichPunchRows(tsRaw, nameById, roleById, shiftsList)
      : [];

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
              locationId={effectiveLocationId}
              clockName={clock.name}
              entries={entries}
              todayMetrics={todayMetrics}
              employeeTimecardPool={employeeTimecardPool}
              canManage={canArchiveTimeEntries}
            />
          </div>
        }
        timesheetsContent={
          <TimeSheetsPanel
            rows={timesheetRows}
            modalPoolRows={employeeTimecardPool}
            locationId={effectiveLocationId}
            timeClockId={clockId}
            canArchive={canArchiveTimeEntries}
            periodKind={effectiveKind}
            periodConfig={effectiveConfig}
            periodStartIso={periodBounds.start.toISOString()}
            periodEndExclusiveIso={periodBounds.endExclusive.toISOString()}
            clockDefaultKind={defaultKind}
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
