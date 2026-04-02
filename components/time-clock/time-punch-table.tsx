"use client";

import { useMemo, useState } from "react";
import { EmployeeTimecardModal } from "@/components/time-clock/employee-timecard-modal";
import { TimePunchTableRow } from "@/components/time-clock/time-punch-table-row";
import {
  matchesPunchTableSearch,
  PUNCH_ACTIONS_COLUMN,
  PUNCH_ARCHIVE_ACTIONS_COLUMN,
  PUNCH_TABLE_COLUMNS,
  PUNCH_TABLE_MIN_WIDTH_PX,
} from "@/lib/time-clock/punch-table-columns";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";

type Props = {
  rows: EnrichedPunchRow[];
  title: string;
  subtitle?: string;
  emptyMessage: string;
  /** Viewer can manage / adjust punches (enables editing fields in timecard). */
  canManage?: boolean;
  /** Today tab: show clock-out actions for open punches. */
  showClockOutActions?: boolean;
  onClockOut?: (entryId: string) => void;
  /** Timesheets: archive punch (retain row; no delete). */
  showArchiveActions?: boolean;
  onArchive?: (entryId: string) => void;
  pending?: boolean;
  /** Show search + date toolbar (Connecteam-style). */
  showToolbar?: boolean;
  toolbarDateLabel?: string;
  /** Right-side hint next to the date (e.g. "Today" vs "Last 30 days"). */
  toolbarHint?: string;
  /**
   * Row click opens employee timecard (Connecteam-style). Uses this pool for history when set
   * (e.g. last-30-days rows); otherwise uses `rows` only.
   */
  employeeTimecardPool?: EnrichedPunchRow[];
};

export function TimePunchTable({
  rows,
  title,
  subtitle,
  emptyMessage,
  canManage = false,
  showClockOutActions = false,
  onClockOut,
  showArchiveActions = false,
  onArchive,
  pending = false,
  showToolbar = true,
  toolbarDateLabel,
  toolbarHint = "Today",
  employeeTimecardPool,
}: Props) {
  const [query, setQuery] = useState("");
  const [timecardAnchorRow, setTimecardAnchorRow] = useState<EnrichedPunchRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => matchesPunchTableSearch(r, q));
  }, [rows, query]);

  const timecardRows = useMemo(() => {
    if (!timecardAnchorRow) return [];
    const pool = employeeTimecardPool ?? rows;
    const fromPool = pool.filter((r) => r.employeeId === timecardAnchorRow.employeeId);
    return fromPool.length > 0 ? fromPool : [timecardAnchorRow];
  }, [timecardAnchorRow, employeeTimecardPool, rows]);

  const dateLabel =
    toolbarDateLabel ??
    new Date().toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        <p className="mt-2 text-xs text-slate-400">
          Click any row to open that employee&apos;s timecard for this clock (schedule, job/position,
          hours by week).
        </p>
      </div>

      {showToolbar ? (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="sr-only" htmlFor="punch-search">
            Search employees
          </label>
          <input
            id="punch-search"
            type="search"
            placeholder="Search by name or role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-md bg-slate-50 px-2 py-1 font-medium text-slate-700">
              {dateLabel}
            </span>
            <span className="text-slate-400">·</span>
            <span>{toolbarHint}</span>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-sm"
            style={{ minWidth: PUNCH_TABLE_MIN_WIDTH_PX }}
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {PUNCH_TABLE_COLUMNS.map((col) => (
                  <th key={col.id} className={col.headerClassName}>
                    {col.header}
                  </th>
                ))}
                {showClockOutActions ? (
                  <th className={PUNCH_ACTIONS_COLUMN.headerClassName}>
                    {PUNCH_ACTIONS_COLUMN.header}
                  </th>
                ) : null}
                {showArchiveActions ? (
                  <th className={PUNCH_ARCHIVE_ACTIONS_COLUMN.headerClassName}>
                    {PUNCH_ARCHIVE_ACTIONS_COLUMN.header}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {filtered.map((row, index) => (
                <TimePunchTableRow
                  key={row.id}
                  row={row}
                  displayIndex={index}
                  zebra={index % 2 === 1}
                  showClockOutActions={Boolean(showClockOutActions)}
                  onClockOut={onClockOut}
                  showArchiveActions={Boolean(showArchiveActions)}
                  onArchive={onArchive}
                  pending={pending}
                  onRowClick={() => setTimecardAnchorRow(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EmployeeTimecardModal
        open={timecardAnchorRow != null}
        onClose={() => setTimecardAnchorRow(null)}
        rows={timecardRows}
        canEditJob={canManage}
      />
    </div>
  );
}
