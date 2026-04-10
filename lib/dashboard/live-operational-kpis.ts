import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_LOCATIONS_ID } from "@/lib/dashboard/resolve-location";

export type DashboardMetricsRow = {
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

function utcDayBoundsIso(): { startIso: string; endIso: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Overwrite headline KPIs from operational tables so the home dashboard matches the roster
 * and schedule, not only `dashboard_location_metrics` seed snapshots.
 */
export async function mergeLiveOperationalKpis(
  supabase: SupabaseClient,
  base: DashboardMetricsRow | null,
  opts: { scopeAll: boolean; locationId: string },
): Promise<DashboardMetricsRow> {
  const shell: DashboardMetricsRow =
    base ?? {
      total_employees: 0,
      active_now: 0,
      late_arrivals: 0,
      avg_weekly_hours: 0,
      active_now_trend_text: null,
      late_arrivals_trend_text: null,
      scheduled_today: 0,
      late_clock_ins: 0,
      clocked_in_now: 0,
      total_attendance_pct: 0,
      late_clock_outs: 0,
    };

  const locScoped =
    !opts.scopeAll && opts.locationId.length > 0 && opts.locationId !== ALL_LOCATIONS_ID;

  let empQ = supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  if (locScoped) {
    empQ = empQ.eq("location_id", opts.locationId);
  }
  const { count: empCount, error: empErr } = await empQ;
  if (!empErr && empCount != null) {
    shell.total_employees = empCount;
  }

  const { startIso, endIso } = utcDayBoundsIso();
  let shiftQ = supabase
    .from("shifts")
    .select("*", { count: "exact", head: true })
    .gte("shift_start", startIso)
    .lt("shift_start", endIso);
  if (locScoped) {
    shiftQ = shiftQ.eq("location_id", opts.locationId);
  }
  const { count: shiftCount, error: shiftErr } = await shiftQ;
  if (!shiftErr && shiftCount != null) {
    shell.scheduled_today = shiftCount;
  }

  let openQ = supabase
    .from("time_entries")
    .select("*", { count: "exact", head: true })
    .eq("status", "open")
    .is("archived_at", null);
  if (locScoped) {
    openQ = openQ.eq("location_id", opts.locationId);
  }
  const { count: openCount, error: openErr } = await openQ;
  if (!openErr && openCount != null) {
    shell.clocked_in_now = openCount;
  }

  /** On-time % from weekly trend seed rows (same source as the attendance chart elsewhere), not live punch math. */
  let trendQ = supabase.from("attendance_trend_points").select("on_time_pct");
  if (locScoped) {
    trendQ = trendQ.eq("location_id", opts.locationId);
  }
  const { data: trendRows, error: trendErr } = await trendQ;
  if (!trendErr && trendRows && trendRows.length > 0) {
    const sum = trendRows.reduce(
      (acc, r) => acc + Number((r as { on_time_pct: number }).on_time_pct ?? 0),
      0,
    );
    shell.total_attendance_pct = Math.round((sum / trendRows.length) * 10) / 10;
  }

  return shell;
}
