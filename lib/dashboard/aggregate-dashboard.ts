import type { AttendanceTrendPoint } from "@/components/dashboard/attendance-trend-chart";

type MetricsInput = {
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

/** Sum / average KPI rows from `dashboard_location_metrics` across stores. */
export function aggregateLocationMetrics(rows: MetricsInput[]): MetricsInput | null {
  if (rows.length === 0) return null;
  const n = rows.length;
  const sum = (key: keyof MetricsInput) =>
    rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

  return {
    total_employees: sum("total_employees"),
    active_now: sum("active_now"),
    late_arrivals: sum("late_arrivals"),
    avg_weekly_hours: rows.reduce((a, r) => a + Number(r.avg_weekly_hours ?? 0), 0) / n,
    active_now_trend_text: null,
    late_arrivals_trend_text: null,
    scheduled_today: sum("scheduled_today"),
    late_clock_ins: sum("late_clock_ins"),
    clocked_in_now: sum("clocked_in_now"),
    total_attendance_pct: rows.reduce((a, r) => a + Number(r.total_attendance_pct ?? 0), 0) / n,
    late_clock_outs: sum("late_clock_outs"),
  };
}

/** Average duplicate day_index rows (one row per store per day). */
export function averageTrendByDay(
  rows: { day_index: number; day_label: string; on_time_pct: number }[],
): AttendanceTrendPoint[] {
  const byDay = new Map<number, { labels: string[]; sum: number; count: number }>();
  for (const r of rows) {
    const d = r.day_index;
    const cur = byDay.get(d) ?? { labels: [], sum: 0, count: 0 };
    cur.labels.push(r.day_label);
    cur.sum += Number(r.on_time_pct);
    cur.count += 1;
    byDay.set(d, cur);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, { labels, sum, count }]) => ({
      dayIndex,
      dayLabel: labels[0] ?? String(dayIndex),
      onTimePct: Math.round((sum / count) * 10) / 10,
    }));
}
