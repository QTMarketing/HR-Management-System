export type DashboardDrillKind =
  | "total_employees"
  | "scheduled_today"
  | "clocked_in_now"
  | "late_clock_ins"
  | "late_clock_outs"
  | "avg_weekly_hours";

export type DashboardDrillRow = {
  id: string;
  fullName: string;
  subtitle: string;
};

export type DashboardDrillResult =
  | { ok: true; rows: DashboardDrillRow[] }
  | { ok: false; error: string };
