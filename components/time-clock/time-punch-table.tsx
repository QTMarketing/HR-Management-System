"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { getEmployeePunchesInRange } from "@/app/actions/employee-punches-on-date";
import { getPtoBalancesForEmployee } from "@/app/actions/pto-balances";
import { EmployeeTimecardModal } from "@/components/time-clock/employee-timecard-modal";
import type { StoreEmployeeOption } from "@/components/time-clock/time-off-request-sidebar";
import { TimePunchTableRow } from "@/components/time-clock/time-punch-table-row";
import {
  matchesPunchTableSearch,
  PUNCH_ACTIONS_COLUMN,
  PUNCH_ARCHIVE_ACTIONS_COLUMN,
  PUNCH_REVIEW_ACTIONS_COLUMN,
  PUNCH_TABLE_COLUMNS,
  PUNCH_TABLE_MIN_WIDTH_PX,
} from "@/lib/time-clock/punch-table-columns";
import type { TimeOffRecordForUi } from "@/lib/time-clock/time-off-display";
import type { PendingTimeOffRequestRow } from "@/lib/time-clock/pending-time-off";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";

type Props = {
  rows: EnrichedPunchRow[];
  title: string;
  subtitle?: string;
  emptyMessage: string;
  /** Context clock id for "Add shift" in the timecard modal (optional). */
  timeClockId?: string;
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
  /** Time off rows for PTO column + timecard summary (optional). */
  timeOffRecords?: TimeOffRecordForUi[];
  /** Pending employee-submitted time off requests (manager scope; for inline approvals). */
  pendingTimeOffRequests?: PendingTimeOffRequestRow[];
  /** Viewer’s employee id (used to allow self-service leave requests in timecard). */
  viewerEmployeeId?: string | null;
  /** Manager approval (closed punches). */
  showReviewActions?: boolean;
  onApprove?: (entryId: string) => void;
  onUnapprove?: (entryId: string) => void;
  /** Active employees at this clock’s store — powers “Add time off” roster in the timecard modal. */
  storeEmployees?: StoreEmployeeOption[];
  /** Required for manager “Fix clock-in/out time” in the timecard. */
  locationId?: string;
};

export function TimePunchTable({
  rows,
  title,
  subtitle,
  emptyMessage,
  timeClockId,
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
  timeOffRecords = [],
  pendingTimeOffRequests = [],
  viewerEmployeeId = null,
  showReviewActions = false,
  onApprove,
  onUnapprove,
  storeEmployees,
  locationId: locationIdProp,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [timecardAnchorRow, setTimecardAnchorRow] = useState<EnrichedPunchRow | null>(null);
  /**
   * When the manager uses the modal's calendar to jump to a historical range,
   * we replace the modal's row set with that range's punches in-place. `null`
   * means "show live/today rows" (the default behavior).
   */
  const [historicalView, setHistoricalView] = useState<{
    employeeId: string;
    fromYmd: string;
    toYmd: string;
    rangeLabel: string;
    rows: EnrichedPunchRow[];
  } | null>(null);
  const [historicalErr, setHistoricalErr] = useState<string | null>(null);
  const [, startHistoricalFetch] = useTransition();
  const [ptoBalances, setPtoBalances] = useState<{
    vacationHours: number;
    sickHours: number;
    standardDayHours: number;
    vacationCashoutEnabled?: boolean;
    nextVacationCashoutAt?: string | null;
    nextVacationCashoutHours?: number;
    lastVacationCashoutAt?: string | null;
    lastVacationCashoutHours?: number;
    ytdVacationUsedHours?: number;
  } | null>(null);
  const [ptoBalancesLoading, setPtoBalancesLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => matchesPunchTableSearch(r, q));
  }, [rows, query]);

  const timecardRows = useMemo(() => {
    if (!timecardAnchorRow) return [];
    // If a historical date was picked for this employee, render those rows
    // instead of the live "today" pool.
    if (
      historicalView &&
      historicalView.employeeId === timecardAnchorRow.employeeId
    ) {
      return historicalView.rows;
    }
    const pool = employeeTimecardPool ?? rows;
    const fromPool = pool.filter((r) => r.employeeId === timecardAnchorRow.employeeId);
    return fromPool.length > 0 ? fromPool : [timecardAnchorRow];
  }, [timecardAnchorRow, employeeTimecardPool, rows, historicalView]);

  /**
   * Ordered, de-duplicated employee IDs in the current display pool. Drives
   * Prev/Next user navigation inside the timecard modal so a manager can sweep
   * the whole roster without closing it.
   */
  const orderedEmployeeIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const pool = employeeTimecardPool ?? rows;
    for (const r of pool) {
      if (!seen.has(r.employeeId)) {
        seen.add(r.employeeId);
        ordered.push(r.employeeId);
      }
    }
    return ordered;
  }, [employeeTimecardPool, rows]);

  const timecardUserNav = useMemo(() => {
    if (!timecardAnchorRow || orderedEmployeeIds.length === 0) {
      return { prevId: null as string | null, nextId: null as string | null };
    }
    const idx = orderedEmployeeIds.indexOf(timecardAnchorRow.employeeId);
    return {
      prevId: idx > 0 ? orderedEmployeeIds[idx - 1] : null,
      nextId: idx >= 0 && idx < orderedEmployeeIds.length - 1 ? orderedEmployeeIds[idx + 1] : null,
    };
  }, [orderedEmployeeIds, timecardAnchorRow]);

  function selectEmployeeInPool(employeeId: string | null) {
    if (!employeeId) return;
    const pool = employeeTimecardPool ?? rows;
    const anchor = pool.find((r) => r.employeeId === employeeId);
    if (anchor) {
      // Switching employees clears any historical view from the previous
      // employee — otherwise the new modal would render stale rows.
      setHistoricalView(null);
      setHistoricalErr(null);
      setTimecardAnchorRow(anchor);
    }
  }

  /**
   * Calendar "jump to range" on the live/today surface fetches that range's
   * punches for the open employee and renders them in the same modal — no
   * navigation, no tab switch. Selecting "Today" (a single-day range that
   * matches today's date) clears the historical view and restores live data.
   */
  const onPickPeriodRange = useCallback(
    (from: Date, to: Date) => {
      const empId = timecardAnchorRow?.employeeId;
      if (!empId) return;
      const ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate(),
        ).padStart(2, "0")}`;
      const fromYmd = ymd(from);
      const toYmd = ymd(to);
      const todayYmd = ymd(new Date());

      // Single-day range that equals today → drop history; show live rows.
      if (fromYmd === todayYmd && toYmd === todayYmd) {
        setHistoricalView(null);
        setHistoricalErr(null);
        return;
      }

      setHistoricalErr(null);
      startHistoricalFetch(async () => {
        const res = await getEmployeePunchesInRange({
          employeeId: empId,
          fromYmd,
          toYmd,
        });
        if (!res.ok) {
          setHistoricalErr(res.error);
          return;
        }
        setHistoricalView({
          employeeId: empId,
          fromYmd,
          toYmd,
          rangeLabel: res.rangeLabel,
          rows: res.rows,
        });
      });
    },
    [timecardAnchorRow?.employeeId],
  );

  useEffect(() => {
    const empId = timecardAnchorRow?.employeeId ?? null;
    if (!empId) {
      setPtoBalances(null);
      setPtoBalancesLoading(false);
      return;
    }

    let cancelled = false;
    setPtoBalancesLoading(true);
    void (async () => {
      const r = await getPtoBalancesForEmployee(empId);
      if (cancelled) return;
      if (!r.ok) {
        setPtoBalances(null);
        setPtoBalancesLoading(false);
        return;
      }
      setPtoBalances({
        vacationHours: r.vacationHours,
        sickHours: r.sickHours,
        standardDayHours: r.standardDayHours,
        vacationCashoutEnabled: r.vacationCashoutEnabled,
        nextVacationCashoutAt: r.nextVacationCashoutAt,
        nextVacationCashoutHours: r.nextVacationCashoutHours,
        lastVacationCashoutAt: r.lastVacationCashoutAt,
        lastVacationCashoutHours: r.lastVacationCashoutHours,
        ytdVacationUsedHours: r.ytdVacationUsedHours,
      });
      setPtoBalancesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [timecardAnchorRow?.employeeId]);

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
          Click a row to open that team member&apos;s timecard—schedule, role, and hours by week.
        </p>
      </div>

      {showToolbar ? (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="sr-only" htmlFor="time-entry-search">
            Search employees
          </label>
          <input
            id="time-entry-search"
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
                {showReviewActions ? (
                  <th className={PUNCH_REVIEW_ACTIONS_COLUMN.headerClassName}>
                    {PUNCH_REVIEW_ACTIONS_COLUMN.header}
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
                  showReviewActions={Boolean(showReviewActions)}
                  onApprove={onApprove}
                  onUnapprove={onUnapprove}
                  pending={pending}
                  onRowClick={() => setTimecardAnchorRow(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EmployeeTimecardModal
        key={timecardAnchorRow?.employeeId ?? "closed"}
        open={timecardAnchorRow != null}
        onClose={() => {
          setTimecardAnchorRow(null);
          setHistoricalView(null);
          setHistoricalErr(null);
        }}
        rows={timecardRows}
        timeClockId={timeClockId ?? null}
        ptoBalances={ptoBalances}
        ptoBalancesLoading={ptoBalancesLoading}
        canEditJob={canManage}
        canApprovePunches={Boolean(showReviewActions && canManage)}
        onApproveEntry={onApprove}
        onUnapproveEntry={onUnapprove}
        approvalPending={pending}
        canManageTimeEntries={Boolean(canManage)}
        storeEmployees={storeEmployees}
        locationId={locationIdProp}
        timeOffRecords={timeOffRecords}
        pendingTimeOffRequests={pendingTimeOffRequests}
        viewerEmployeeId={viewerEmployeeId}
        onPunchAdjusted={() => router.refresh()}
        onPrevUser={() => selectEmployeeInPool(timecardUserNav.prevId)}
        onNextUser={() => selectEmployeeInPool(timecardUserNav.nextId)}
        hasPrevUser={timecardUserNav.prevId != null}
        hasNextUser={timecardUserNav.nextId != null}
        onPickPeriodRange={onPickPeriodRange}
        periodLabelOverride={
          historicalView && historicalView.employeeId === timecardAnchorRow?.employeeId
            ? historicalView.rangeLabel
            : undefined
        }
        historicalNotice={
          historicalErr
            ? historicalErr
            : historicalView && historicalView.employeeId === timecardAnchorRow?.employeeId
              ? `Viewing history for ${historicalView.rangeLabel}`
              : null
        }
      />
    </div>
  );
}
