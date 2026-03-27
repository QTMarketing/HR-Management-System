/**
 * Schedule week grid model (Connecteam-style board).
 * Extend: add fields on `ShiftForBoard`, map them in `schedule/board/page.tsx`,
 * then adjust `ScheduleWeekBoard` cell rendering if needed.
 */
import { addDays, hoursBetween } from "@/lib/schedule/week";

export type ShiftForBoard = {
  id: string;
  employee_id: string;
  location_id: string;
  shift_start: string;
  shift_end: string;
  notes: string | null;
  employeeName: string;
  employeeRole: string;
};

export type DayColumn = {
  date: Date;
  labelShort: string;
  labelDayNum: string;
  totalHours: number;
  shiftCount: number;
  uniquePeople: number;
};

const ROLE_ORDER = ["store manager", "shift lead", "employee", "manager"];

export function sortRole(a: string, b: string): number {
  const ai = ROLE_ORDER.indexOf(a.toLowerCase());
  const bi = ROLE_ORDER.indexOf(b.toLowerCase());
  const as = ai === -1 ? 999 : ai;
  const bs = bi === -1 ? 999 : bi;
  if (as !== bs) return as - bs;
  return a.localeCompare(b);
}

/** Group label from shift notes (Connecteam-style sections). */
export function sectionTitle(notes: string | null): string {
  const n = notes?.trim();
  return n && n.length > 0 ? n : "Scheduled shifts";
}

export function dayBounds(weekMonday: Date, dayOffset: number): { start: Date; end: Date } {
  const start = addDays(weekMonday, dayOffset);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 1);
  return { start, end };
}

export function shiftStartsInRange(shiftStartIso: string, start: Date, end: Date): boolean {
  const t = new Date(shiftStartIso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

export function buildDayColumns(
  weekMonday: Date,
  shifts: ShiftForBoard[],
): { columns: DayColumn[]; shiftsByDay: ShiftForBoard[][] } {
  const shiftsByDay: ShiftForBoard[][] = [[], [], [], [], [], [], []];
  const columns: DayColumn[] = [];

  for (let d = 0; d < 7; d++) {
    const { start, end } = dayBounds(weekMonday, d);
    const dayShifts = shifts.filter((s) => shiftStartsInRange(s.shift_start, start, end));
    shiftsByDay[d] = dayShifts;

    let totalHours = 0;
    const people = new Set<string>();
    for (const s of dayShifts) {
      totalHours += hoursBetween(s.shift_start, s.shift_end);
      people.add(s.employee_id);
    }

    const date = addDays(weekMonday, d);
    columns.push({
      date,
      labelShort: date.toLocaleDateString(undefined, { weekday: "short" }),
      labelDayNum: date.toLocaleDateString(undefined, { day: "numeric", month: "numeric" }),
      totalHours: Math.round(totalHours * 100) / 100,
      shiftCount: dayShifts.length,
      uniquePeople: people.size,
    });
  }

  return { columns, shiftsByDay };
}

export function uniqueSectionTitles(shifts: ShiftForBoard[]): string[] {
  const set = new Set(shifts.map((s) => sectionTitle(s.notes)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function rolesInSection(shifts: ShiftForBoard[], section: string): string[] {
  const roles = new Set(
    shifts.filter((s) => sectionTitle(s.notes) === section).map((s) => s.employeeRole),
  );
  return [...roles].sort(sortRole);
}

export function shiftsForCell(
  shifts: ShiftForBoard[],
  section: string,
  role: string,
  weekMonday: Date,
  dayIndex: number,
): ShiftForBoard[] {
  const { start, end } = dayBounds(weekMonday, dayIndex);
  return shifts.filter(
    (s) =>
      sectionTitle(s.notes) === section &&
      s.employeeRole === role &&
      shiftStartsInRange(s.shift_start, start, end),
  );
}

export function weekTotals(shifts: ShiftForBoard[]): {
  hours: number;
  shiftCount: number;
  people: number;
} {
  let hours = 0;
  const people = new Set<string>();
  for (const s of shifts) {
    hours += hoursBetween(s.shift_start, s.shift_end);
    people.add(s.employee_id);
  }
  return {
    hours: Math.round(hours * 100) / 100,
    shiftCount: shifts.length,
    people: people.size,
  };
}

export function sectionTotals(
  shifts: ShiftForBoard[],
  section: string,
): { hours: number; shiftCount: number; people: number } {
  const sub = shifts.filter((s) => sectionTitle(s.notes) === section);
  return weekTotals(sub);
}
