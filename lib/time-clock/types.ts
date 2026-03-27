/**
 * Enriched punch row for Connecteam-style tables (Today + Timesheets).
 * @see `lib/time-clock/punch-table-columns.ts` for how to extend columns and search.
 */
export type EnrichedPunchRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  initials: string;
  scheduleLabel: string | null;
  shiftTypeLabel: string;
  jobTone: "manager" | "lead" | "staff" | "other";
  clockInAt: string;
  clockOutAt: string | null;
  clockInDisplay: string;
  clockOutDisplay: string;
  lateInBadge: string | null;
  lateOutBadge: string | null;
  dailyTotalLabel: string;
  ptoLabel: string;
  status: string;
};

export type TimeClockTodayMetrics = {
  scheduledToday: number;
  lateClockIns: number;
  clockedInNow: number;
  /** Employees with at least one punch today for this clock (Connecteam-style headcount). */
  totalAttendance: number;
  lateClockOuts: number;
};
