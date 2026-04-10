/** Shared derivation for manager + employee time off forms. */

export const WORK_HOURS_PER_DAY = 8;

/**
 * Derive total hours + day equivalents from start/end.
 * — All day: inclusive calendar days; hours = days × 8.
 * — Date/time: elapsed hours (0.25h); days = hours ÷ 8.
 */
export function computeHoursAndDaysFromRange(
  allDay: boolean,
  startRaw: string,
  endRaw: string,
): { totalHours: string; daysOfLeave: string } | null {
  const start = startRaw.trim();
  const end = endRaw.trim();
  if (!start || !end) return null;

  if (allDay) {
    const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
    if (!m1 || !m2) return null;
    const d0 = new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
    const d1 = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
    if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime()) || d1 < d0) return null;
    const inclusiveDays = Math.floor((d1.getTime() - d0.getTime()) / 86400000) + 1;
    const hours = inclusiveDays * WORK_HOURS_PER_DAY;
    return {
      totalHours: String(Math.round(hours * 4) / 4),
      daysOfLeave: String(inclusiveDays),
    };
  }

  const t0 = Date.parse(start);
  const t1 = Date.parse(end);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return null;
  const durationHours = (t1 - t0) / 3600000;
  const roundedHours = Math.round(durationHours * 4) / 4;
  const dayEquiv = durationHours / WORK_HOURS_PER_DAY;
  const roundedDays = Math.round(dayEquiv * 100) / 100;
  return {
    totalHours: String(roundedHours),
    daysOfLeave: roundedDays < 0.005 ? "0" : String(roundedDays),
  };
}
