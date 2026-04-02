/**
 * Enriched punch row for Connecteam-style tables (Today + Timesheets).
 * @see `lib/time-clock/punch-table-columns.ts` for how to extend columns and search.
 */
export type EnrichedPunchRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  /** Job column — same as Users **Position** (`employees.role`). */
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
  /** Planned shift length (HH:MM) when linked to a schedule row. */
  scheduledDurationLabel: string | null;
  /** Worked minutes minus scheduled minutes (closed punch + schedule only). */
  scheduleVarianceMinutes: number | null;
  ptoLabel: string;
  status: string;
  /** Soft-deleted punch — retained for audit, excluded from active totals. */
  isArchived?: boolean;
};

export type TimeClockTodayMetrics = {
  scheduledToday: number;
  lateClockIns: number;
  clockedInNow: number;
  /** Employees with at least one punch today for this clock (Connecteam-style headcount). */
  totalAttendance: number;
  /** Late end vs scheduled shift (shown as “Running late” on the Today strip). */
  runningLate: number;
};
