import { cookies } from "next/headers";
import { ActivityFeedLive } from "@/components/dashboard/activity-feed-live";
import type { ActivityFeedItem } from "@/components/dashboard/activity-feed.types";
import { DashboardKpiStrip } from "@/components/dashboard/dashboard-kpi-strip";
import { LaborSummaryCard } from "@/components/dashboard/labor-summary-card";
import { RecentStaffUpdates } from "@/components/dashboard/recent-staff-updates";
import type { StaffUpdateRow } from "@/components/dashboard/recent-staff-updates.types";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { aggregateLocationMetrics } from "@/lib/dashboard/aggregate-dashboard";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import {
  DEMO_LOCATIONS,
  demoActivityForLocation,
  demoMetricsForLocation,
  demoStaffForLocation,
} from "@/lib/mock/dashboard-demo";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mapActivityStatus(s: string): ActivityFeedItem["status"] {
  if (s === "ok" || s === "late" || s === "info") return s;
  return "info";
}

function mapStaffStatus(s: string): StaffUpdateRow["status"] {
  if (s === "approved" || s === "review" || s === "pending") return s;
  return "pending";
}

type MetricsRow = {
  total_employees: number;
  active_now: number;
  late_arrivals: number;
  avg_weekly_hours: number;
  active_now_trend_text: string | null;
  late_arrivals_trend_text: string | null;
  scheduled_today: number;
  late_clock_ins: number;
  clocked_in_now: number;
  total_attendance_pct: number;
  late_clock_outs: number;
};

const forceMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

const sqlHint =
  "Run Supabase SQL migrations in order (001 → … → 007) for chains, locations, time clocks, dashboard, and schedule data.";

export default async function DashboardPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rawLocations: LocationRow[] = [];
  if (!forceMock) {
    const { data } = await supabase
      .from("locations")
      .select("id, name")
      .order("sort_order", { ascending: true });
    rawLocations = (data ?? []).map((r) => ({ id: r.id, name: r.name }));
  }
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);
  const locationName =
    locations.find((l) => l.id === locationId)?.name ?? "Downtown Flagship";

  let activityItems: ActivityFeedItem[] = [];
  let activityError: string | null = null;
  let staffRows: StaffUpdateRow[] = [];
  let staffError: string | null = null;
  let metrics: MetricsRow | null = null;
  let metricsError: string | null = null;
  let usedDemoFallback = false;

  if (forceMock) {
    metrics = { ...demoMetricsForLocation(locationId) };
    activityItems = [...demoActivityForLocation(locationId)];
    staffRows = [...demoStaffForLocation(locationId)];
    usedDemoFallback = true;
  } else {
    try {
      const metricsPromise = scopeAll
        ? supabase.from("dashboard_location_metrics").select("*")
        : locationId.length > 0
          ? supabase
              .from("dashboard_location_metrics")
              .select("*")
              .eq("location_id", locationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null });

      let activityQ = supabase
        .from("activity_events")
        .select("id, employee_label, action, status, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(12);
      if (!scopeAll) {
        activityQ = activityQ.eq("location_id", locationId);
      }

      let staffQ = supabase
        .from("staff_updates")
        .select("id, employee_label, update_text, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!scopeAll) {
        staffQ = staffQ.eq("location_id", locationId);
      }

      const [activityRes, staffRes, metricsRes] = await Promise.all([
        activityQ,
        staffQ,
        metricsPromise,
      ]);

      if (activityRes.error) activityError = activityRes.error.message;
      else if (activityRes.data) {
        activityItems = activityRes.data.map((row) => ({
          id: row.id,
          who: row.employee_label,
          action: row.action,
          status: mapActivityStatus(row.status),
          occurredAt: row.occurred_at,
        }));
      }

      if (staffRes.error) staffError = staffRes.error.message;
      else if (staffRes.data) {
        staffRows = staffRes.data.map((row) => ({
          id: row.id,
          employeeLabel: row.employee_label,
          updateText: row.update_text,
          status: mapStaffStatus(row.status),
          createdAt: row.created_at,
        }));
      }

      if (metricsRes.error) metricsError = metricsRes.error.message;
      else if (metricsRes.data) {
        if (scopeAll && Array.isArray(metricsRes.data)) {
          const rows = metricsRes.data as Record<string, unknown>[];
          const parsed: MetricsRow[] = rows.map((m) => ({
            total_employees: Number(m.total_employees ?? 0),
            active_now: Number(m.active_now ?? 0),
            late_arrivals: Number(m.late_arrivals ?? 0),
            avg_weekly_hours: Number(m.avg_weekly_hours ?? 0),
            active_now_trend_text: (m.active_now_trend_text as string) ?? null,
            late_arrivals_trend_text: (m.late_arrivals_trend_text as string) ?? null,
            scheduled_today: Number(m.scheduled_today ?? 0),
            late_clock_ins: Number(m.late_clock_ins ?? 0),
            clocked_in_now: Number(m.clocked_in_now ?? 0),
            total_attendance_pct: Number(m.total_attendance_pct ?? 0),
            late_clock_outs: Number(m.late_clock_outs ?? 0),
          }));
          metrics = aggregateLocationMetrics(parsed);
        } else {
          const m = metricsRes.data as Record<string, unknown>;
          metrics = {
            total_employees: Number(m.total_employees ?? 0),
            active_now: Number(m.active_now ?? 0),
            late_arrivals: Number(m.late_arrivals ?? 0),
            avg_weekly_hours: Number(m.avg_weekly_hours ?? 0),
            active_now_trend_text: (m.active_now_trend_text as string) ?? null,
            late_arrivals_trend_text: (m.late_arrivals_trend_text as string) ?? null,
            scheduled_today: Number(m.scheduled_today ?? 0),
            late_clock_ins: Number(m.late_clock_ins ?? 0),
            clocked_in_now: Number(m.clocked_in_now ?? 0),
            total_attendance_pct: Number(m.total_attendance_pct ?? 0),
            late_clock_outs: Number(m.late_clock_outs ?? 0),
          };
        }
      }

    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not connect to Supabase. Check env keys.";
      activityError = msg;
      staffError = msg;
      metricsError = msg;
    }

    const needsDemo =
      !metrics ||
      !!metricsError ||
      (!!activityError && activityItems.length === 0) ||
      (!!staffError && staffRows.length === 0);

    if (needsDemo) {
      usedDemoFallback = true;
      if (!metrics) {
        metrics = { ...demoMetricsForLocation(locationId) };
      }
      if (activityItems.length === 0 || activityError) {
        activityItems = [...demoActivityForLocation(locationId)];
        activityError = null;
      }
      if (staffRows.length === 0 || staffError) {
        staffRows = [...demoStaffForLocation(locationId)];
        staffError = null;
      }
      metricsError = null;
    }
  }

  const firstName = displayNameFromUser(user);
  const m = metrics;

  return (
    <div className="space-y-6 pb-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">
          Good morning, {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {locationName} · Here&apos;s what&apos;s happening today.
        </p>
      </div>

      {m ? (
        <DashboardKpiStrip
          totalEmployees={m.total_employees}
          scheduledToday={m.scheduled_today}
          clockedInNow={m.clocked_in_now}
          lateClockIns={m.late_clock_ins}
          lateClockOuts={m.late_clock_outs}
          avgWeeklyHours={m.avg_weekly_hours}
          totalAttendancePct={m.total_attendance_pct}
          scopeLabel={locationName}
          hasMetrics
        />
      ) : (
        <DashboardKpiStrip
          totalEmployees={0}
          scheduledToday={0}
          clockedInNow={0}
          lateClockIns={0}
          lateClockOuts={0}
          avgWeeklyHours={0}
          totalAttendancePct={0}
          scopeLabel={locationName}
          hasMetrics={false}
        />
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RecentStaffUpdates
            rows={staffRows}
            errorMessage={staffError}
            emptyHint={staffError ? sqlHint : null}
          />
        </div>

        <div className="space-y-6">
          <ActivityFeedLive
            initialItems={activityItems}
            locationId={locationId}
            enableRealtime={!forceMock && !usedDemoFallback && !scopeAll}
            errorMessage={activityError}
            emptyHint={activityError ? sqlHint : null}
          />
          <LaborSummaryCard />
        </div>
      </section>
    </div>
  );
}
