import { cookies } from "next/headers";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { TimeClockPanel } from "@/components/time-clock/time-clock-panel";
import { TimeClockDetailShell } from "@/components/time-clock/time-clock-detail-shell";
import { TimePunchTable } from "@/components/time-clock/time-punch-table";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import { isAllLocations, resolveSelectedLocationId, type LocationRow } from "@/lib/dashboard/resolve-location";
import { computeTodayMetrics, enrichPunchRows } from "@/lib/time-clock/enrich-punches";
import { getLocalDayBounds } from "@/lib/time-clock/punch-display";
import { getTimeClockSmartGate } from "@/lib/time-clock/smart-group-gate";
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ clockId: string }>;
};

export default async function TimeClockDetailPage({ params }: PageProps) {
  await requirePermission(PERMISSIONS.TIME_CLOCK_VIEW);

  const { clockId } = await params;
  const supabase = await createSupabaseServerClient();

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
    .select("id, name, status, location_id")
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

  const { data: empRows, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, role")
    .eq("location_id", effectiveLocationId)
    .eq("status", "active")
    .order("full_name", { ascending: true });

  const smartGate = await getTimeClockSmartGate(supabase, clockId);

  let employees = (empRows ?? []).map((e) => ({
    id: e.id,
    full_name: e.full_name,
  }));

  let smartGroupHint: string | null = null;
  if (smartGate.kind === "error") {
    smartGroupHint = `Could not load smart group rules: ${smartGate.message}`;
  } else if (smartGate.kind === "restricted") {
    employees = employees.filter((e) => smartGate.allowedEmployeeIds.has(e.id));
    smartGroupHint =
      employees.length === 0
        ? "This clock only allows employees who belong to a smart group assigned here (see Users → Smart groups). No eligible employees at this store yet — add members to the assigned groups."
        : "Clock-in is limited to employees in smart groups assigned to this time clock.";
  }

  const nameById = new Map((empRows ?? []).map((e) => [e.id, e.full_name] as const));
  const roleById = new Map((empRows ?? []).map((e) => [e.id, e.role] as const));

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  const { data: shiftsWindow } = await supabase
    .from("shifts")
    .select("employee_id, shift_start, shift_end, notes")
    .eq("location_id", effectiveLocationId)
    .gte("shift_start", since30.toISOString());

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
      .select("id, employee_id, clock_in_at, clock_out_at, status")
      .eq("location_id", effectiveLocationId)
      .eq("time_clock_id", clockId)
      .order("clock_in_at", { ascending: false })
      .limit(50);

    if (error) {
      entriesError = error.message;
    } else if (raw) {
      entries = enrichPunchRows(raw, nameById, roleById, shiftsList);
    }

    const { data: entriesToday } = await supabase
      .from("time_entries")
      .select("id, employee_id, clock_in_at, clock_out_at, status")
      .eq("time_clock_id", clockId)
      .gte("clock_in_at", dayStart.toISOString())
      .lt("clock_in_at", dayEnd.toISOString());

    const { count: openCount } = await supabase
      .from("time_entries")
      .select("*", { count: "exact", head: true })
      .eq("time_clock_id", clockId)
      .eq("status", "open");

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

  const timesheetSince = new Date();
  timesheetSince.setDate(timesheetSince.getDate() - 30);

  const timesheetRows: EnrichedPunchRow[] = [];

  const { data: tsRaw } = await supabase
    .from("time_entries")
    .select("id, employee_id, clock_in_at, clock_out_at, status")
    .eq("time_clock_id", clockId)
    .gte("clock_in_at", timesheetSince.toISOString())
    .order("clock_in_at", { ascending: false })
    .limit(500);

  if (tsRaw) {
    timesheetRows.push(...enrichPunchRows(tsRaw, nameById, roleById, shiftsList));
  }

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
              locationName={locationName}
              timeClockId={clockId}
              timeClocks={[{ id: clockId, name: clock.name }]}
              employees={employees}
              entries={entries}
              todayMetrics={isArchived ? null : todayMetrics}
              archivedReadOnly={isArchived}
              smartGroupHint={smartGroupHint}
            />
          </div>
        }
        timesheetsContent={
          <div className="space-y-3">
            <TimePunchTable
              rows={timesheetRows}
              title="Timesheets"
              subtitle="Last 30 days of punches for this time clock — same column layout as Today."
              emptyMessage="No punches in the last 30 days for this time clock."
              showClockOutActions={false}
              showToolbar
              toolbarHint="Last 30 days"
            />
            <p className="text-xs text-slate-500">
              Week grid, export, and GPS map (Connecteam) can build on this table in a later phase.
            </p>
          </div>
        }
      />
    </Suspense>
  );
}
