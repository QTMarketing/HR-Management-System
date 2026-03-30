/**
 * Connecteam-style week board: section (shift layer or legacy group) → job rows → day cells.
 */
import { addDays, hoursBetween } from "@/lib/schedule/week";

export const JOB_ROW_NONE = "__no_job__";

export type ShiftForBoard = {
  id: string;
  employee_id: string;
  location_id: string;
  shift_start: string;
  shift_end: string;
  notes: string | null;
  employeeName: string;
  employeeRole: string;
  groupName: string;
  groupSort: number;
  /** Layer that defines groupName when using shift layers (e.g. “Schedule section”). */
  boardSectionLayerName: string | null;
  /** Other layer selections (e.g. “Department: Front of house”) for search / future UI. */
  extraLayerLabels: string[];
  /** null → “Shifts without a Job” row */
  jobName: string | null;
  jobSort: number;
  jobColorHex: string;
  isPublished: boolean;
  slotsTotal: number;
  assignCount: number;
  notifyBadgeCount: number;
};

export type DayColumn = {
  date: Date;
  labelShort: string;
  labelDayNum: string;
  totalHours: number;
  shiftCount: number;
  uniquePeople: number;
};

export type JobRowDef = {
  rowKey: string;
  label: string;
  sort: number;
  colorHex: string;
};

/** Connecteam-style hour display e.g. 33:00 */
export function formatHoursClock(totalHours: number): string {
  const totalMin = Math.round(totalHours * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
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
      labelDayNum: `${date.getDate()}/${date.getMonth() + 1}`,
      totalHours: Math.round(totalHours * 100) / 100,
      shiftCount: dayShifts.length,
      uniquePeople: people.size,
    });
  }

  return { columns, shiftsByDay };
}

/** Distinct shift groups, stable order */
export function uniqueGroupSections(shifts: ShiftForBoard[]): { name: string; sort: number }[] {
  const map = new Map<string, number>();
  for (const s of shifts) {
    if (!map.has(s.groupName)) map.set(s.groupName, s.groupSort);
    else map.set(s.groupName, Math.min(map.get(s.groupName)!, s.groupSort));
  }
  return [...map.entries()]
    .map(([name, sort]) => ({ name, sort }))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Job rows inside a group (no-job row first when present) */
export function jobRowsForSection(shifts: ShiftForBoard[], groupName: string): JobRowDef[] {
  const inSection = shifts.filter((s) => s.groupName === groupName);
  const byKey = new Map<string, { sort: number; color: string; label: string }>();

  for (const s of inSection) {
    const rowKey = s.jobName == null ? JOB_ROW_NONE : s.jobName;
    const label = s.jobName == null ? "Shifts without a Job" : s.jobName;
    const sort = s.jobName == null ? -1 : s.jobSort;
    if (!byKey.has(rowKey)) {
      byKey.set(rowKey, { sort, color: s.jobColorHex, label });
    }
  }

  return [...byKey.entries()]
    .map(([rowKey, v]) => ({
      rowKey,
      label: v.label,
      sort: v.sort,
      colorHex: v.color,
    }))
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}

export function shiftsForCell(
  shifts: ShiftForBoard[],
  groupName: string,
  jobRowKey: string,
  weekMonday: Date,
  dayIndex: number,
): ShiftForBoard[] {
  const { start, end } = dayBounds(weekMonday, dayIndex);
  const wantNoJob = jobRowKey === JOB_ROW_NONE;
  return shifts.filter((s) => {
    if (s.groupName !== groupName) return false;
    const sKey = s.jobName == null ? JOB_ROW_NONE : s.jobName;
    if (sKey !== jobRowKey) return false;
    return shiftStartsInRange(s.shift_start, start, end);
  });
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
  sectionName: string,
): { hours: number; shiftCount: number; people: number } {
  const sub = shifts.filter((s) => s.groupName === sectionName);
  return weekTotals(sub);
}

export function draftPublishCount(shifts: ShiftForBoard[]): number {
  return shifts.filter((s) => !s.isPublished).length;
}

/** Client-side filter: labels, employee name, job, group */
export function filterShiftsQuery(shifts: ShiftForBoard[], query: string): ShiftForBoard[] {
  const q = query.trim().toLowerCase();
  if (!q) return shifts;
  return shifts.filter((s) => {
    const extrasHit = s.extraLayerLabels.some((x) => x.toLowerCase().includes(q));
    return (
      s.groupName.toLowerCase().includes(q) ||
      (s.boardSectionLayerName?.toLowerCase().includes(q) ?? false) ||
      (s.jobName?.toLowerCase().includes(q) ?? false) ||
      s.employeeName.toLowerCase().includes(q) ||
      (s.notes?.toLowerCase().includes(q) ?? false) ||
      extrasHit
    );
  });
}
