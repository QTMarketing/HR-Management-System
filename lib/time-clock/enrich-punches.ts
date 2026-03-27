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
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";

type RawEntry = {
  id: string;
  employee_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  status: string;
};

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
    lateClockOuts: enrichedTodayForClock.filter((e) => e.lateOutBadge).length,
  };
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
    const { label: dailyTotalLabel } = computeDailyTotal(row.clock_in_at, row.clock_out_at);

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
      lateInBadge: lateIn,
      lateOutBadge: lateOut,
      dailyTotalLabel,
      ptoLabel: "—",
      status: row.status,
    };
  });
}
