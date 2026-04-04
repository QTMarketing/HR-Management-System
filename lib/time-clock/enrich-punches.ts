/**
 * Maps raw `time_entries` + `employees` + `shifts` → `EnrichedPunchRow`.
 * @see `lib/time-clock/punch-table-columns.ts` when adding columns.
 */
import {
  dailyTotalLabel as computeDailyTotal,
  findShiftForPunch,
  formatScheduleLine,
  formatPunchDateTime,
  initialsFromName,
  lateBadgeFromShift,
  lateClockOutBadge,
  type ShiftLike,
} from "@/lib/time-clock/punch-display";
import {
  formatBreaksSummaryLabel,
  rollupBreakMinutes,
  type TimeEntryBreakRow,
} from "@/lib/time-clock/breaks";
import { punchSourceLabel as punchSourceDisplay } from "@/lib/time-clock/punch-source";
import { formatHoursMinutes } from "@/lib/time-clock/timecard-rollup";
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";

type RawEntry = {
  id: string;
  employee_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  status: string;
  archived_at?: string | null;
  approved_at?: string | null;
  punch_source?: string | null;
  job_code?: string | null;
  edited_at?: string | null;
  edit_reason?: string | null;
};

function reviewFromRaw(row: RawEntry): Pick<EnrichedPunchRow, "reviewStatus" | "reviewLabel"> {
  if (row.archived_at) {
    return { reviewStatus: "archived", reviewLabel: "Archived" };
  }
  if (row.status === "open" || !row.clock_out_at) {
    return { reviewStatus: "open", reviewLabel: "Open" };
  }
  if (row.approved_at) {
    return { reviewStatus: "approved", reviewLabel: "Approved" };
  }
  return { reviewStatus: "pending", reviewLabel: "Pending" };
}

export function jobToneFromRole(role: string): EnrichedPunchRow["jobTone"] {
  const r = role.toLowerCase();
  if (r.includes("manager")) return "manager";
  if (r.includes("lead")) return "lead";
  if (r.includes("employee")) return "staff";
  return "other";
}

export function computeTodayMetrics(
  shiftsToday: ShiftLike[],
  enrichedTodayForClock: EnrichedPunchRow[],
  openEntryCountForClock: number,
): TimeClockTodayMetrics {
  return {
    scheduledToday: shiftsToday.length,
    lateClockIns: enrichedTodayForClock.filter((e) => e.lateInBadge).length,
    clockedInNow: openEntryCountForClock,
    totalAttendance: new Set(enrichedTodayForClock.map((e) => e.employeeId)).size,
    runningLate: enrichedTodayForClock.filter((e) => e.lateOutBadge).length,
  };
}

/** Attach Phase 2 break rollups after punch rows are enriched (separate DB fetch). */
export function attachBreakRollups(
  rows: EnrichedPunchRow[],
  breaksByEntryId: Map<string, TimeEntryBreakRow[]>,
  asOf: Date = new Date(),
): EnrichedPunchRow[] {
  return rows.map((row) => {
    const breaks = breaksByEntryId.get(row.id) ?? [];
    const rollup = rollupBreakMinutes(breaks, asOf, row.clockOutAt);
    return {
      ...row,
      breaksSummaryLabel: formatBreaksSummaryLabel(rollup),
      unpaidBreakMinutes: rollup.unpaidMinutes > 0 ? rollup.unpaidMinutes : null,
    };
  });
}

export function enrichPunchRows(
  raw: RawEntry[],
  nameById: Map<string, string>,
  roleById: Map<string, string>,
  shifts: ShiftLike[],
): EnrichedPunchRow[] {
  return raw.map((row) => {
    const name = nameById.get(row.employee_id) ?? "—";
    const role = roleById.get(row.employee_id) ?? "—";
    const shift = findShiftForPunch(shifts, row.employee_id, row.clock_in_at);
    const scheduleLabel = shift ? formatScheduleLine(shift) : null;
    const lateIn =
      shift && row.clock_in_at
        ? lateBadgeFromShift(row.clock_in_at, shift.shift_start)
        : null;
    const lateOut =
      shift && row.clock_out_at
        ? lateClockOutBadge(row.clock_out_at, shift.shift_end)
        : null;
    const { label: dailyTotalLabel, minutes: workedMinutes } = computeDailyTotal(
      row.clock_in_at,
      row.clock_out_at,
    );

    let scheduledDurationLabel: string | null = null;
    let scheduleVarianceMinutes: number | null = null;
    if (shift) {
      const s = new Date(shift.shift_start);
      const e = new Date(shift.shift_end);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
        const sm = Math.round((e.getTime() - s.getTime()) / 60000);
        if (sm > 0) {
          scheduledDurationLabel = formatHoursMinutes(sm);
          if (workedMinutes != null) {
            scheduleVarianceMinutes = workedMinutes - sm;
          }
        }
      }
    }

    const isArchived = Boolean(row.archived_at);
    const review = reviewFromRaw(row);
    const jc = row.job_code?.trim();
    return {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: name,
      employeeRole: role,
      initials: initialsFromName(name),
      scheduleLabel,
      shiftTypeLabel: shift ? "Shift" : "—",
      jobTone: jobToneFromRole(role),
      clockInAt: row.clock_in_at,
      clockOutAt: row.clock_out_at,
      clockInDisplay: formatPunchDateTime(row.clock_in_at),
      clockOutDisplay: row.clock_out_at ? formatPunchDateTime(row.clock_out_at) : "—",
      isArchived,
      lateInBadge: lateIn,
      lateOutBadge: lateOut,
      dailyTotalLabel,
      scheduledDurationLabel,
      scheduleVarianceMinutes,
      ptoLabel: "—",
      status: row.status,
      reviewStatus: review.reviewStatus,
      reviewLabel: review.reviewLabel,
      punchSourceLabel: punchSourceDisplay(row.punch_source ?? undefined),
      jobCodeAtPunch: jc && jc.length > 0 ? jc : null,
      wasEdited: Boolean(row.edited_at),
    };
  });
}
