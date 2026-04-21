/**
 * Punch table (Connecteam-style) — extension points
 * -------------------------------------------------
 * When you change requirements, touch these in order:
 *
 * 1. **Row shape** — `EnrichedPunchRow` in `./types.ts`
 * 2. **Values** — `enrichPunchRows()` in `./enrich-punches.ts` (and raw SQL selects in
 *    `app/(dashboard)/time-clock/[clockId]/page.tsx` if new DB columns are needed)
 * 3. **Column headers & order** — `PUNCH_TABLE_COLUMNS` below (keep in sync with body cells)
 * 4. **Cells** — `components/time-clock/time-punch-table-row.tsx` (one `<td>` per column)
 * 5. **Toolbar search** — `matchesPunchTableSearch()` below (which fields the search box uses)
 * 6. **Today KPI strip** — `TimeClockTodayMetrics` + `computeTodayMetrics()` in `./enrich-punches.ts`
 */

import type { EnrichedPunchRow } from "@/lib/time-clock/types";

/** Minimum scroll width for the table wrapper (update if you add wide columns). */
export const PUNCH_TABLE_MIN_WIDTH_PX = 1380;

export type PunchTableColumnDef = {
  /** Stable id for keys; align with comments in `time-punch-table-row.tsx`. */
  id: string;
  header: string;
  /** Tailwind classes for `<th>` */
  headerClassName: string;
};

/** Data columns (left → right). Actions column is separate — see `PUNCH_ACTIONS_COLUMN`. */
export const PUNCH_TABLE_COLUMNS: readonly PunchTableColumnDef[] = [
  { id: "index", header: "#", headerClassName: "w-12 whitespace-nowrap px-3 py-3 text-center" },
  { id: "name", header: "Name", headerClassName: "whitespace-nowrap px-3 py-3" },
  {
    id: "schedule",
    header: "Schedule",
    headerClassName: "min-w-[180px] whitespace-nowrap px-3 py-3",
  },
  { id: "type", header: "Type", headerClassName: "whitespace-nowrap px-3 py-3" },
  { id: "job", header: "Job", headerClassName: "whitespace-nowrap px-3 py-3" },
  { id: "locCode", header: "Location", headerClassName: "whitespace-nowrap px-3 py-3" },
  {
    id: "clockIn",
    header: "Clock in",
    headerClassName: "min-w-[140px] whitespace-nowrap px-3 py-3",
  },
  {
    id: "clockOut",
    header: "Clock out",
    headerClassName: "min-w-[120px] whitespace-nowrap px-3 py-3",
  },
  {
    id: "breaks",
    header: "Breaks",
    headerClassName: "min-w-[7rem] whitespace-nowrap px-3 py-3",
  },
  { id: "dailyTotal", header: "Daily total", headerClassName: "whitespace-nowrap px-3 py-3" },
  { id: "pto", header: "PTO", headerClassName: "whitespace-nowrap px-3 py-3" },
  { id: "status", header: "Status", headerClassName: "whitespace-nowrap px-3 py-3" },
];

export const PUNCH_ACTIONS_COLUMN: PunchTableColumnDef = {
  id: "actions",
  header: "Actions",
  headerClassName: "w-28 whitespace-nowrap px-3 py-3 text-right",
};

export const PUNCH_ARCHIVE_ACTIONS_COLUMN: PunchTableColumnDef = {
  id: "archive",
  header: "Record",
  headerClassName: "min-w-[7rem] whitespace-nowrap px-3 py-3 text-right",
};

/**
 * Which fields participate in the toolbar search. Add branches here when you add
 * searchable columns (e.g. employee ID, job codes).
 */
export function matchesPunchTableSearch(row: EnrichedPunchRow, queryTrimmed: string): boolean {
  const q = queryTrimmed.toLowerCase();
  if (!q) return true;
  return (
    row.employeeName.toLowerCase().includes(q) ||
    row.employeeRole.toLowerCase().includes(q) ||
    row.reviewLabel.toLowerCase().includes(q) ||
    (row.jobCodeAtPunch?.toLowerCase().includes(q) ?? false) ||
    (row.locationCodeAtPunch?.toLowerCase().includes(q) ?? false) ||
    (row.punchSourceLabel?.toLowerCase().includes(q) ?? false) ||
    (row.breaksSummaryLabel?.toLowerCase().includes(q) ?? false) ||
    row.ptoLabel.toLowerCase().includes(q)
  );
}

export const PUNCH_REVIEW_ACTIONS_COLUMN: PunchTableColumnDef = {
  id: "review",
  header: "Review",
  headerClassName: "min-w-[6.5rem] whitespace-nowrap px-3 py-3 text-right",
};
