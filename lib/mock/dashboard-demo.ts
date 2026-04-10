import type { ActivityFeedItem } from "@/components/dashboard/activity-feed.types";
import type { AttendanceTrendPoint } from "@/components/dashboard/attendance-trend-chart";
import type { StaffUpdateRow } from "@/components/dashboard/recent-staff-updates.types";
import { aggregateLocationMetrics, averageTrendByDay } from "@/lib/dashboard/aggregate-dashboard";
import { ALL_LOCATIONS_ID, type LocationRow } from "@/lib/dashboard/resolve-location";

/** Matches seed in migration 003 so cookie / DB stay consistent when you migrate. */
export const DEMO_PRIMARY_LOCATION_ID = "a0000000-0000-4000-8000-000000000001";

export const DEMO_LOCATIONS: LocationRow[] = [
  { id: DEMO_PRIMARY_LOCATION_ID, name: "Downtown Flagship" },
  { id: "a0000000-0000-4000-8000-000000000002", name: "Store LP" },
  { id: "a0000000-0000-4000-8000-000000000003", name: "Store 18" },
];

export type DemoMetrics = {
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

export const DEMO_METRICS: DemoMetrics = {
  total_employees: 128,
  active_now: 28,
  late_arrivals: 3,
  avg_weekly_hours: 32.4,
  active_now_trend_text: "+4% vs yesterday",
  late_arrivals_trend_text: "Needs attention",
  scheduled_today: 42,
  late_clock_ins: 3,
  clocked_in_now: 28,
  total_attendance_pct: 94,
  late_clock_outs: 1,
};

export const DEMO_TREND: AttendanceTrendPoint[] = [
  { dayIndex: 0, dayLabel: "M", onTimePct: 88 },
  { dayIndex: 1, dayLabel: "T", onTimePct: 92 },
  { dayIndex: 2, dayLabel: "W", onTimePct: 85 },
  { dayIndex: 3, dayLabel: "T", onTimePct: 94 },
  { dayIndex: 4, dayLabel: "F", onTimePct: 90 },
  { dayIndex: 5, dayLabel: "S", onTimePct: 78 },
  { dayIndex: 6, dayLabel: "S", onTimePct: 82 },
];

export const DEMO_ACTIVITY: ActivityFeedItem[] = [
  {
    id: "demo-act-1",
    who: "Alex P.",
    action: "Clock in",
    status: "ok",
    occurredAt: "2026-03-26T14:00:00.000Z",
  },
  {
    id: "demo-act-2",
    who: "Jamie L.",
    action: "Clock in",
    status: "late",
    occurredAt: "2026-03-26T13:15:00.000Z",
  },
  {
    id: "demo-act-3",
    who: "Riley K.",
    action: "PTO request",
    status: "info",
    occurredAt: "2026-03-26T12:00:00.000Z",
  },
  {
    id: "demo-act-4",
    who: "Sam D.",
    action: "Clock out",
    status: "ok",
    occurredAt: "2026-03-26T11:30:00.000Z",
  },
];

export const DEMO_STAFF: StaffUpdateRow[] = [
  {
    id: "demo-staff-1",
    employeeLabel: "Alex P.",
    updateText: "Schedule change",
    status: "approved",
    createdAt: "2026-03-26T14:30:00.000Z",
  },
  {
    id: "demo-staff-2",
    employeeLabel: "Jamie L.",
    updateText: "Missed punch",
    status: "review",
    createdAt: "2026-03-26T13:00:00.000Z",
  },
  {
    id: "demo-staff-3",
    employeeLabel: "Riley K.",
    updateText: "PTO request",
    status: "pending",
    createdAt: "2026-03-26T11:00:00.000Z",
  },
];

/** Use seeded locations in the header when Supabase returns none. */
export function withDemoLocations(rows: LocationRow[]): LocationRow[] {
  return rows.length > 0 ? rows : DEMO_LOCATIONS;
}

function locationIndex(locationId: string): number {
  const i = DEMO_LOCATIONS.findIndex((l) => l.id === locationId);
  return i >= 0 ? i : 0;
}

/** Vary demo KPIs slightly when switching stores in mock mode. */
export function demoMetricsForLocation(locationId: string): DemoMetrics {
  if (locationId === ALL_LOCATIONS_ID) {
    const rows = DEMO_LOCATIONS.map((l) => demoMetricsForLocation(l.id));
    return aggregateLocationMetrics(rows)!;
  }
  const n = locationIndex(locationId);
  return {
    ...DEMO_METRICS,
    total_employees: 128 - n * 22,
    active_now: 28 - n * 2,
    late_arrivals: Number([3, 1, 2][n] ?? 0),
    scheduled_today: 42 - n * 5,
    clocked_in_now: 28 - n * 2,
    late_clock_ins: Number([3, 1, 2][n] ?? 0),
    late_clock_outs: n,
  };
}

export function demoTrendForLocation(locationId: string): AttendanceTrendPoint[] {
  if (locationId === ALL_LOCATIONS_ID) {
    const merged: { day_index: number; day_label: string; on_time_pct: number }[] = [];
    for (const loc of DEMO_LOCATIONS) {
      const pts = demoTrendForLocation(loc.id);
      for (const p of pts) {
        merged.push({
          day_index: p.dayIndex,
          day_label: p.dayLabel,
          on_time_pct: p.onTimePct,
        });
      }
    }
    return averageTrendByDay(merged);
  }
  const n = locationIndex(locationId);
  return DEMO_TREND.map((p) => ({
    ...p,
    onTimePct: Math.min(100, Math.max(0, p.onTimePct - n * 2 + (p.dayIndex % 3))),
  }));
}

export function demoActivityForLocation(locationId: string): ActivityFeedItem[] {
  if (locationId === ALL_LOCATIONS_ID) {
    // One list for “All locations”: KPIs are still summed in `demoMetricsForLocation`;
    // repeating the same people per fake store looked like broken duplicate data.
    return demoActivityForLocation(DEMO_PRIMARY_LOCATION_ID);
  }
  const n = locationIndex(locationId);
  const suffix = ["", " @ LP", " @ 18"][n] ?? "";
  return DEMO_ACTIVITY.map((a, i) => ({
    ...a,
    id: `${a.id}-loc-${n}-${i}`,
    who: `${a.who}${suffix}`,
  }));
}

export function demoStaffForLocation(locationId: string): StaffUpdateRow[] {
  if (locationId === ALL_LOCATIONS_ID) {
    return demoStaffForLocation(DEMO_PRIMARY_LOCATION_ID);
  }
  const n = locationIndex(locationId);
  const suffix = ["", " — LP", " — 18"][n] ?? "";
  return DEMO_STAFF.map((s, i) => ({
    ...s,
    id: `${s.id}-loc-${n}-${i}`,
    updateText: s.updateText + suffix,
  }));
}
