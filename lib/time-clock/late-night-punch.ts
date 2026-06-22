/**
 * Late-night / early-morning punch times (Connecteam-style moon on timecard).
 * Local time: before 8:00 AM or from 9:00 PM onward.
 */
export const LATE_NIGHT_MORNING_END_HOUR = 8;
export const LATE_NIGHT_EVENING_START_HOUR = 21;

export function isLateNightLocalTime(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const h = d.getHours();
  return h < LATE_NIGHT_MORNING_END_HOUR || h >= LATE_NIGHT_EVENING_START_HOUR;
}

export function formatPunchTimeLocal(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatPunchDateTimeLocal(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const LATE_NIGHT_PUNCH_TITLE =
  "Late night or early morning — punch falls before 8:00 AM or at/after 9:00 PM (local time).";
