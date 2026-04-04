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
  /** Raw DB status: `open` | `closed`. */
  status: string;
  /**
   * UI review state: open shift, closed pending manager approval, approved, or archived.
   * Derived from `status`, `clock_out_at`, `approved_at`, `archived_at`.
   */
  reviewStatus: "open" | "pending" | "approved" | "archived";
  /** Short label for the Status column (e.g. Open, Pending, Approved, Archived). */
  reviewLabel: string;
  /** Soft-deleted punch — retained for audit, excluded from active totals. */
  isArchived?: boolean;
  /** `time_entries.punch_source` — how the punch was recorded (Phase 1). */
  punchSourceLabel?: string | null;
  /** Job/labor code at clock-in when set. */
  jobCodeAtPunch?: string | null;
  /** Manager edited clock times after the fact. */
  wasEdited?: boolean;
  /** Phase 2: paid/unpaid break summary for this punch (when breaks exist). */
  breaksSummaryLabel?: string | null;
  /** Total unpaid break minutes (completed + in-progress unpaid portion). */
  unpaidBreakMinutes?: number | null;
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
