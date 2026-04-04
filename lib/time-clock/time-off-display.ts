/**
 * Overlap math for `time_off_records` vs punch days and timecard date ranges.
 */
import { formatHoursMinutes, localDayKey, startOfWeekMonday } from "@/lib/time-clock/timecard-rollup";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";

export type TimeOffRecordForUi = {
  id: string;
  employee_id: string;
  time_off_type: string;
  start_at: string;
  end_at: string;
};

export function isPaidTimeOffType(type: string): boolean {
  return type.trim().toLowerCase() !== "unpaid leave";
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return e > s ? e - s : 0;
}

/** Intersection of a time-off interval with one local calendar day (`YYYY-MM-DD`). */
export function overlapMinutesOnLocalDay(
  dayKey: string,
  recordStartIso: string,
  recordEndIso: string,
): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dayStart = new Date(y, mo - 1, d, 0, 0, 0, 0).getTime();
  const dayEnd = new Date(y, mo - 1, d, 23, 59, 59, 999).getTime();
  const rs = new Date(recordStartIso).getTime();
  const re = new Date(recordEndIso).getTime();
  if (Number.isNaN(rs) || Number.isNaN(re)) return 0;
  return overlapMs(rs, re, dayStart, dayEnd) / 60000;
}

export function formatPtoDayLabel(paidMinutes: number, unpaidMinutes: number): string {
  if (paidMinutes <= 0 && unpaidMinutes <= 0) return "—";
  const parts: string[] = [];
  if (paidMinutes > 0) parts.push(`${formatHoursMinutes(paidMinutes)} paid`);
  if (unpaidMinutes > 0) parts.push(`${formatHoursMinutes(unpaidMinutes)} unpaid`);
  return parts.join(" · ");
}

/** Mon 00:00 – Sun 23:59:59.999 local, week containing `clockInIso`. */
export function localWeekBoundsContainingClockIn(clockInIso: string): {
  start: Date;
  end: Date;
} | null {
  const d = new Date(clockInIso);
  if (Number.isNaN(d.getTime())) return null;
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export type PtoLabelScope = "day" | "week";

/**
 * @param scope `day` — time off on the same local calendar day as clock-in (Timesheets grid).
 * `week` — time off overlapping Mon–Sun week of that clock-in (Today / latest punch per person).
 */
export function ptoLabelForPunchRow(
  row: { employeeId: string; clockInAt: string },
  records: TimeOffRecordForUi[],
  scope: PtoLabelScope = "day",
): string {
  if (records.length === 0) return "—";
  if (scope === "week") {
    const bounds = localWeekBoundsContainingClockIn(row.clockInAt);
    if (!bounds) return "—";
    const r = rollupTimeOffForEmployeeInRange(
      row.employeeId,
      records,
      bounds.start,
      bounds.end,
    );
    return formatPtoDayLabel(r.paidMinutes, r.unpaidMinutes);
  }
  const dayKey = localDayKey(row.clockInAt);
  if (!dayKey) return "—";
  let paid = 0;
  let unpaid = 0;
  for (const rec of records) {
    if (rec.employee_id !== row.employeeId) continue;
    const mins = overlapMinutesOnLocalDay(dayKey, rec.start_at, rec.end_at);
    if (mins <= 0) continue;
    if (isPaidTimeOffType(rec.time_off_type)) paid += mins;
    else unpaid += mins;
  }
  return formatPtoDayLabel(paid, unpaid);
}

/**
 * Total paid / unpaid time off minutes overlapping [rangeStart, rangeEnd] for one employee.
 */
export function rollupTimeOffForEmployeeInRange(
  employeeId: string,
  records: TimeOffRecordForUi[],
  rangeStart: Date,
  rangeEnd: Date,
): { paidMinutes: number; unpaidMinutes: number } {
  const t0 = rangeStart.getTime();
  const t1 = rangeEnd.getTime();
  let paid = 0;
  let unpaid = 0;
  for (const rec of records) {
    if (rec.employee_id !== employeeId) continue;
    const rs = new Date(rec.start_at).getTime();
    const re = new Date(rec.end_at).getTime();
    if (Number.isNaN(rs) || Number.isNaN(re)) continue;
    const ms = overlapMs(rs, re, t0, t1);
    const mins = ms / 60000;
    if (mins <= 0) continue;
    if (isPaidTimeOffType(rec.time_off_type)) paid += mins;
    else unpaid += mins;
  }
  return { paidMinutes: Math.round(paid), unpaidMinutes: Math.round(unpaid) };
}

export function attachPtoLabels(
  rows: EnrichedPunchRow[],
  records: TimeOffRecordForUi[],
  scope: PtoLabelScope = "day",
): EnrichedPunchRow[] {
  if (records.length === 0) return rows;
  return rows.map((row) => ({
    ...row,
    ptoLabel: ptoLabelForPunchRow(row, records, scope),
  }));
}
