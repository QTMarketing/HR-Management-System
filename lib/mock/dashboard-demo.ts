import type { ActivityFeedItem } from "@/components/dashboard/activity-feed.types";
import type { AttendanceTrendPoint } from "@/components/dashboard/attendance-trend-chart";
import type { StaffUpdateRow } from "@/components/dashboard/recent-staff-updates.types";
import { aggregateLocationMetrics, averageTrendByDay } from "@/lib/dashboard/aggregate-dashboard";
import { ALL_LOCATIONS_ID, type LocationRow } from "@/lib/dashboard/resolve-location";

/** Stable demo UUIDs (`a000…000001` …) match historical seed migrations when only the first rows exist. */
function demoLocationId(index: number): string {
  return `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

/** Fallback list when Supabase has no `locations` rows: real store labels and addresses. */
const DEMO_STORE_NAMES = [
  "East · 118 — 34911 Hwy 96",
  "East · 119 — 13391 FM1013",
  "East · 123 — 12234 HWY 190 E",
  "East · 124 — 102 N Wheeler",
  "East · 125 — 200 Hwy 87",
  "East · 127 — 898 N Wheeler St",
  "East · 128 — 12183 N Wheeler St",
  "East · 18 — 105 Broadway",
  "East · 51 — 504 Front Street",
  "East · Pot of Gold — 911 W Arch St, Coal Township, PA 17866",
  "East · Irish Isle — 911 W Arch St, Coal Township, PA 17866",
  "East · Lama Wholesale — 1501 Pipeline Rd E, Ste B, Bedford, TX 76022",
  "East · Field Visit — Field / route",
  "East · 94 — 509 S Washington Ave",
  "East · 96 — 1011 E End Blvd N",
  "East · 97 — 2700 Victory Dr",
  "East · 99 — 5601 E End Blvd S",
  "East · 101 — 6182 State Highway 300 (East Mountain)",
  "East · 102 — 4665 E US Highway 80",
  "East · 104 — 101 E US Highway 80",
  "East · 106 — 308 E Goode St",
  "East · 110 — 1105 Business Hwy 37 N",
  "East · HQ — Time clock",
  "East · LP Food Mart — Address on file",
  "West · 67 — 8109 Indiana Ave",
  "West · 68 — 2318 19th St",
  "West · 73 — 2455 Kermit Highway",
  "West · 77 — 1509 FM 1936",
  "West · 78 — 13920 W Highway 80 E",
  "West · 79 — 801 Golder Ave",
  "West · 80 — 1523 Harless Ave",
  "West · 81 — 4324 Andrews Hwy",
  "West · 82 — 4401 W Illinois St",
  "West · 83 — 300 Owens St",
  "West · 108 — 317 N Dixie Blvd",
  "West · 109 — 721 N County Rd W",
  "Other · QT29 — 5101 Little Rd",
] as const;

export const DEMO_PRIMARY_LOCATION_ID = demoLocationId(1);

export const DEMO_LOCATIONS: LocationRow[] = DEMO_STORE_NAMES.map((name, i) => ({
  id: demoLocationId(i + 1),
  name,
}));

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
    updateText: "Missed clock-in",
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

/** Short label for demo feed lines when switching stores (avoids huge full addresses). */
function demoLocationShortLabel(locationId: string): string {
  const loc = DEMO_LOCATIONS.find((l) => l.id === locationId);
  if (!loc) return "";
  const head = loc.name.split(" — ")[0]?.trim() ?? loc.name;
  return head.length > 28 ? `${head.slice(0, 25)}…` : head;
}

/** Vary demo KPIs slightly when switching stores in mock mode. */
export function demoMetricsForLocation(locationId: string): DemoMetrics {
  if (locationId === ALL_LOCATIONS_ID) {
    const rows = DEMO_LOCATIONS.map((l) => demoMetricsForLocation(l.id));
    return aggregateLocationMetrics(rows)!;
  }
  const n = locationIndex(locationId);
  const k = n % 5;
  return {
    ...DEMO_METRICS,
    total_employees: Math.max(12, 128 - k * 22),
    active_now: Math.max(0, 28 - k * 2),
    late_arrivals: [3, 1, 2][n % 3]!,
    scheduled_today: Math.max(0, 42 - k * 5),
    clocked_in_now: Math.max(0, 28 - k * 2),
    late_clock_ins: [3, 1, 2][n % 3]!,
    late_clock_outs: n % 4,
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
  const shift = n % 8;
  return DEMO_TREND.map((p) => ({
    ...p,
    onTimePct: Math.min(100, Math.max(0, p.onTimePct - shift * 2 + (p.dayIndex % 3))),
  }));
}

export function demoActivityForLocation(locationId: string): ActivityFeedItem[] {
  if (locationId === ALL_LOCATIONS_ID) {
    // One list for “All locations”: KPIs are still summed in `demoMetricsForLocation`;
    // repeating the same people per fake store looked like broken duplicate data.
    return demoActivityForLocation(DEMO_PRIMARY_LOCATION_ID);
  }
  const n = locationIndex(locationId);
  const suffix = demoLocationShortLabel(locationId) ? ` @ ${demoLocationShortLabel(locationId)}` : "";
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
  const tail = demoLocationShortLabel(locationId);
  const suffix = tail ? ` — ${tail}` : "";
  return DEMO_STAFF.map((s, i) => ({
    ...s,
    id: `${s.id}-loc-${n}-${i}`,
    updateText: s.updateText + suffix,
  }));
}
