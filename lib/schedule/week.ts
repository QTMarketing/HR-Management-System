/** Week helpers — Monday–Sunday grid (Connecteam-style). */

export function mondayOfWeekContaining(d: Date): Date {
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + mondayOffset);
  m.setHours(0, 0, 0, 0);
  return m;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Parse `YYYY-MM-DD` as local calendar date; invalid → today’s Monday. */
export function parseWeekMondayParam(week: string | undefined): Date {
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return mondayOfWeekContaining(new Date());
  }
  const [y, mo, day] = week.split("-").map(Number);
  const d = new Date(y, mo - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return mondayOfWeekContaining(new Date());
  return mondayOfWeekContaining(d);
}

export function formatWeekQueryParam(monday: Date): string {
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function hoursBetween(isoStart: string, isoEnd: string): number {
  const a = new Date(isoStart).getTime();
  const b = new Date(isoEnd).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return (b - a) / 3600000;
}

/** Overlap of [segmentStart, segmentEnd) with [windowStart, windowEnd), in hours. */
export function hoursInWindow(
  segmentStart: Date,
  segmentEnd: Date,
  windowStart: Date,
  windowEnd: Date,
): number {
  const a = segmentStart.getTime();
  const b = segmentEnd.getTime();
  const ws = windowStart.getTime();
  const we = windowEnd.getTime();
  const s0 = Math.max(a, ws);
  const s1 = Math.min(b, we);
  if (s1 <= s0) return 0;
  return (s1 - s0) / 3600000;
}
