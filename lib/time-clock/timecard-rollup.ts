import { dailyTotalLabel } from "@/lib/time-clock/punch-display";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";

/** Local calendar day key `YYYY-MM-DD` for rollups (same clock-in day). */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday-start week; returns that Monday at local midnight (for grouping labels). */
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function weekRangeLabel(fromMonday: Date, toSunday: Date): string {
  const a = fromMonday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const b = toSunday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${a} – ${b}`;
}

/** Minutes worked for one punch when closed. */
export function punchMinutes(row: EnrichedPunchRow): number | null {
  return dailyTotalLabel(row.clockInAt, row.clockOutAt).minutes;
}

export function formatHoursMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** LaMa-style signed variance (actual − scheduled), e.g. `-00:19`, `00:00`. */
export function formatSignedVarianceMinutes(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m === 0) return "00:00";
  const neg = m < 0;
  const abs = Math.abs(Math.round(m));
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  const body = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

/** Per-day sums for daily-total column in employee timecard. */
export function dailyMinutesMap(rows: EnrichedPunchRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = localDayKey(r.clockInAt);
    if (!key) continue;
    const mins = punchMinutes(r);
    if (mins == null) continue;
    m.set(key, (m.get(key) ?? 0) + mins);
  }
  return m;
}
