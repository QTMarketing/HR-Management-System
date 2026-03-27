/** Server-safe helpers for Connecteam-style punch rows (schedule, late, totals). */

export function getLocalDayBounds(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export type ShiftLike = {
  employee_id: string;
  shift_start: string;
  shift_end: string;
  notes: string | null;
};

export type EmployeeLike = {
  id: string;
  full_name: string;
  role: string;
};

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0] ?? "";
  const b = parts[parts.length - 1][0] ?? "";
  return (a + b).toUpperCase();
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function findShiftForPunch(
  shifts: ShiftLike[],
  employeeId: string,
  clockInIso: string,
): ShiftLike | null {
  const punch = new Date(clockInIso);
  if (Number.isNaN(punch.getTime())) return null;
  for (const s of shifts) {
    if (s.employee_id !== employeeId) continue;
    const start = new Date(s.shift_start);
    if (Number.isNaN(start.getTime())) continue;
    if (sameCalendarDay(start, punch)) return s;
  }
  return null;
}

export function formatScheduleLine(shift: ShiftLike): string {
  const s = new Date(shift.shift_start);
  const e = new Date(shift.shift_end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
  const t1 = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const t2 = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const hours = (e.getTime() - s.getTime()) / 3600000;
  const h = Math.round(hours * 100) / 100;
  return `${t1} – ${t2} (${h}h)`;
}

/** Returns "+1h 27m" style if clock-in is after shift start (61s+). */
export function lateBadgeFromShift(clockInIso: string, shiftStartIso: string): string | null {
  const punch = new Date(clockInIso);
  const start = new Date(shiftStartIso);
  if (Number.isNaN(punch.getTime()) || Number.isNaN(start.getTime())) return null;
  const lateMs = punch.getTime() - start.getTime();
  if (lateMs <= 60_000) return null;
  return `+${formatDurationHuman(lateMs)}`;
}

export function formatDurationHuman(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Daily worked duration as HH:MM when closed; em dash when still open. */
export function dailyTotalLabel(
  clockInIso: string,
  clockOutIso: string | null,
): { label: string; minutes: number | null } {
  if (!clockOutIso) return { label: "—", minutes: null };
  const a = new Date(clockInIso);
  const b = new Date(clockOutIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return { label: "—", minutes: null };
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return { label: "—", minutes: null };
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return {
    label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    minutes,
  };
}

export function formatPunchDateTime(iso: string): string {
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

export function lateClockOutBadge(
  clockOutIso: string | null,
  shiftEndIso: string,
): string | null {
  if (!clockOutIso) return null;
  const out = new Date(clockOutIso);
  const end = new Date(shiftEndIso);
  if (Number.isNaN(out.getTime()) || Number.isNaN(end.getTime())) return null;
  const lateMs = out.getTime() - end.getTime();
  if (lateMs <= 60_000) return null;
  return `+${formatDurationHuman(lateMs)}`;
}
