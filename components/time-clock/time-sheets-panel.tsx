"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  Filter,
  Lock,
  LockOpen,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { approveTimeEntry, unapproveTimeEntry } from "@/app/actions/time-entry-approval";
import { lockPayPeriod, unlockPayPeriod } from "@/app/actions/pay-period-lock";
import { seedSampleTimesheetPunches } from "@/app/actions/seed-time-entries";
import { EmployeeTimecardModal } from "@/components/time-clock/employee-timecard-modal";
import type { StoreEmployeeOption } from "@/components/time-clock/time-off-request-sidebar";
import { formatHoursMinutes, punchMinutes } from "@/lib/time-clock/timecard-rollup";
import {
  buildTimesheetPunchesCsv,
  downloadTimesheetCsv,
} from "@/lib/time-clock/export-timesheet-csv";
import {
  calculatePayableHours,
  DEFAULT_PAYROLL_POLICY,
  formatGrossPayLabel,
  summarizePayableHours,
  type PayableHoursResult,
  type PayrollPolicy,
} from "@/lib/payroll/payable-hours";
import { downloadUnifiedPayrollCsv } from "@/lib/csv/unified-payroll-csv";
import { generateUnifiedPayrollCsv } from "@/app/actions/payroll-export";
import { TimesheetRangePicker } from "@/components/time-clock/timesheet-range-picker";
import {
  enumerateDaysInPeriod,
  formatPeriodRangeLabel,
  shiftCustomRangeYmd,
  shiftPeriodAnchor,
  type TimesheetPeriodConfig,
  type TimesheetPeriodKind,
} from "@/lib/time-clock/timesheet-period";
import {
  rollupTimeOffForEmployeeInRange,
  type TimeOffRecordForUi,
} from "@/lib/time-clock/time-off-display";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";

type Props = {
  /** Rows for the active period (grid). */
  rows: EnrichedPunchRow[];
  /** Wider pool for employee timecard modal (e.g. last 90 days). */
  modalPoolRows: EnrichedPunchRow[];
  timeOffRecords?: TimeOffRecordForUi[];
  locationId: string;
  timeClockId: string;
  canArchive: boolean;
  periodKind: TimesheetPeriodKind;
  periodConfig: TimesheetPeriodConfig;
  periodStartIso: string;
  periodEndExclusiveIso: string;
  /** When set, period comes from custom URL range (not Week/Month math). */
  rangeFromYmd?: string | null;
  rangeToYmd?: string | null;
  clockDefaultKind: TimesheetPeriodKind;
  storeEmployees: StoreEmployeeOption[];
  holidays?: { holiday_date: string; name: string; is_paid?: boolean | null; paid_hours?: number | null }[];
  /**
   * Track A — Payable hours rollup. Map of `employee_id -> hourly_rate`. `null`
   * means no wage on file → calculator drops to the marked DEMO fallback and
   * the UI shows the "DEMO RATE — UPDATE IN PROFILE" badge.
   */
  hourlyRatesByEmployee?: Record<string, number | null>;
  /** Track B — only Owners see the lock/unlock control. */
  canLockPayPeriods?: boolean;
  /**
   * Track B — current lock row for the visible period, or a synthetic open row
   * when no `pay_periods` row exists yet. `null` when the lookup failed (e.g.
   * pre-migration); the lock control is hidden in that case.
   */
  payPeriodLock?: {
    id: string;
    status: "open" | "locked";
    startDateYmd: string;
    endDateYmd: string;
    lockedAt: string | null;
    lockedByName: string | null;
  } | null;
  /**
   * Track C — active OT policy for this clock's location (resolved server-side
   * via `payroll_policies`: store override → global default). When omitted,
   * the calculator uses the FLSA fallback (40h/wk @ 1.5x).
   */
  payrollPolicy?: PayrollPolicy;
};

function dayKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function periodKindLabel(k: TimesheetPeriodKind): string {
  switch (k) {
    case "weekly":
      return "Week";
    case "bi_weekly":
      return "Bi-week";
    case "monthly":
      return "Month";
    case "semi_monthly":
      return "Semi-month";
    case "custom":
      return "Custom";
    default:
      return k;
  }
}

export function TimeSheetsPanel({
  rows,
  modalPoolRows,
  timeOffRecords = [],
  locationId,
  timeClockId,
  canArchive,
  periodKind,
  periodConfig,
  periodStartIso,
  periodEndExclusiveIso,
  rangeFromYmd = null,
  rangeToYmd = null,
  clockDefaultKind,
  storeEmployees,
  holidays = [],
  hourlyRatesByEmployee = {},
  canLockPayPeriods = false,
  payPeriodLock = null,
  payrollPolicy = DEFAULT_PAYROLL_POLICY,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [actionPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [seedPending, setSeedPending] = useState(false);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [timecardAnchorRow, setTimecardAnchorRow] = useState<EnrichedPunchRow | null>(null);
  const [approvalErr, setApprovalErr] = useState<string | null>(null);
  const [lockPending, startLockTransition] = useTransition();
  const [lockErr, setLockErr] = useState<string | null>(null);
  const [payrollCsvPending, startPayrollCsvTransition] = useTransition();
  const [payrollCsvErr, setPayrollCsvErr] = useState<string | null>(null);

  const isPeriodLocked = payPeriodLock?.status === "locked";

  function onToggleLock() {
    if (!payPeriodLock) return;
    setLockErr(null);
    startLockTransition(async () => {
      const args = {
        timeClockId,
        startDateYmd: payPeriodLock.startDateYmd,
        endDateYmd: payPeriodLock.endDateYmd,
      };
      const r = isPeriodLocked ? await unlockPayPeriod(args) : await lockPayPeriod(args);
      if (!r.ok) {
        setLockErr(r.error);
        return;
      }
      router.refresh();
    });
  }

  /**
   * Track C: download the Gusto-ready unified payroll CSV for the visible
   * period. We POST through a Server Action so RLS, RBAC, and the policy
   * lookup all stay server-side; the client just saves the returned text.
   */
  function onDownloadPayrollCsv() {
    setPayrollCsvErr(null);
    startPayrollCsvTransition(async () => {
      // Use the same local-day YMD as the Track B pay-period lookup so the
      // server-side query targets the same calendar window the user sees.
      const ymdLocal = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const startYmd =
        payPeriodLock?.startDateYmd ?? ymdLocal(new Date(periodStartIso));
      let endYmd = payPeriodLock?.endDateYmd;
      if (!endYmd) {
        const endInclusive = new Date(periodEndExclusiveIso);
        endInclusive.setDate(endInclusive.getDate() - 1);
        endYmd = ymdLocal(endInclusive);
      }
      const r = await generateUnifiedPayrollCsv({
        timeClockId,
        startDateYmd: startYmd,
        endDateYmd: endYmd,
      });
      if (!r.ok) {
        setPayrollCsvErr(r.error);
        return;
      }
      downloadUnifiedPayrollCsv(r.csv, r.filename);
    });
  }

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => {
      if (statusFilter === "approved") return r.reviewStatus === "approved";
      if (statusFilter === "pending") return r.reviewStatus === "pending";
      return true;
    });
  }, [rows, statusFilter]);

  const bounds = useMemo(
    () => ({
      start: new Date(periodStartIso),
      endExclusive: new Date(periodEndExclusiveIso),
    }),
    [periodStartIso, periodEndExclusiveIso],
  );

  const days = useMemo(() => enumerateDaysInPeriod(bounds), [bounds]);
  const dayKeys = useMemo(() => days.map((d) => dayKeyLocal(d)), [days]);
  const holidayByDayKey = useMemo(() => {
    const map = new Map<string, { name: string; isPaid: boolean; paidHours: number | null }>();
    for (const h of holidays) {
      const key = String(h.holiday_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      map.set(key, {
        name: h.name,
        isPaid: h.is_paid !== false,
        paidHours: typeof h.paid_hours === "number" ? h.paid_hours : null,
      });
    }
    return map;
  }, [holidays]);
  const dayIndexByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < dayKeys.length; i++) {
      const k = dayKeys[i];
      if (k) m.set(k, i);
    }
    return m;
  }, [dayKeys]);
  const rangeLabel = useMemo(() => formatPeriodRangeLabel(bounds), [bounds]);

  const periodEndInclusive = useMemo(() => {
    const ex = new Date(periodEndExclusiveIso);
    const d = new Date(ex);
    d.setDate(d.getDate() - 1);
    return d;
  }, [periodEndExclusiveIso]);

  const hasCustomRange = Boolean(rangeFromYmd && rangeToYmd);

  const timecardRows = useMemo(() => {
    if (!timecardAnchorRow) return [];
    const fromPool = modalPoolRows.filter((r) => r.employeeId === timecardAnchorRow.employeeId);
    return fromPool.length > 0 ? fromPool : [timecardAnchorRow];
  }, [modalPoolRows, timecardAnchorRow]);

  function onApproveEntry(entryId: string) {
    setApprovalErr(null);
    startTransition(async () => {
      const r = await approveTimeEntry(entryId, locationId);
      if (!r.ok) {
        setApprovalErr(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onUnapproveEntry(entryId: string) {
    setApprovalErr(null);
    startTransition(async () => {
      const r = await unapproveTimeEntry(entryId, locationId);
      if (!r.ok) {
        setApprovalErr(r.error);
        return;
      }
      router.refresh();
    });
  }

  function pushTimesheetsQuery(updates: {
    period?: TimesheetPeriodKind;
    anchor?: Date;
    rangeFrom?: string | null;
    rangeTo?: string | null;
    clearCustomRange?: boolean;
  }) {
    const q = new URLSearchParams(searchParams.toString());
    q.set("view", "timesheets");
    q.set("period", updates.period ?? periodKind);
    if (updates.clearCustomRange) {
      q.delete("range_from");
      q.delete("range_to");
    }
    if (updates.rangeFrom !== undefined) {
      if (updates.rangeFrom) q.set("range_from", updates.rangeFrom);
      else q.delete("range_from");
    }
    if (updates.rangeTo !== undefined) {
      if (updates.rangeTo) q.set("range_to", updates.rangeTo);
      else q.delete("range_to");
    }
    if (updates.rangeFrom && updates.rangeTo) {
      q.delete("anchor");
    } else if (updates.anchor) {
      q.set("anchor", updates.anchor.toISOString());
    }
    router.push(`/time-clock/${timeClockId}?${q.toString()}`);
  }

  const byEmployee = useMemo(() => {
    const map = new Map<
      string,
      { employeeId: string; name: string; role: string; rows: EnrichedPunchRow[] }
    >();
    for (const r of filteredRows) {
      const key = r.employeeId;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          employeeId: key,
          name: r.employeeName ?? "Employee",
          role: r.employeeRole ?? "",
          rows: [],
        });
      }
      map.get(key)!.rows.push(r);
    }
    const list = [...map.values()].map((e) => ({
      ...e,
      rows: e.rows.slice().sort((a, b) => a.clockInAt.localeCompare(b.clockInAt)),
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [filteredRows]);

  const byEmployeeWithAll = useMemo(() => {
    const map = new Map(byEmployee.map((e) => [e.employeeId, e] as const));
    for (const se of storeEmployees) {
      if (!se.id) continue;
      if (map.has(se.id)) continue;
      map.set(se.id, {
        employeeId: se.id,
        name: se.fullName ?? "Employee",
        role: se.role ?? "",
        rows: [],
      });
    }
    const list = [...map.values()];
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [byEmployee, storeEmployees]);

  const filteredEmployees = useMemo(() => {
    let list = byEmployeeWithAll;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q),
      );
    }
    return list;
  }, [byEmployeeWithAll, query]);

  const rowsForExport = useMemo(
    () => filteredEmployees.flatMap((e) => e.rows),
    [filteredEmployees],
  );

  function onExportCsv() {
    if (rowsForExport.length === 0) return;
    const csv = buildTimesheetPunchesCsv(rowsForExport, { periodLabel: rangeLabel });
    const safe = rangeLabel.replace(/[^\w\d\-]+/g, "_").slice(0, 48) || "period";
    downloadTimesheetCsv(csv, `timesheet-${safe}.csv`);
  }

  const minutesForEmployeeByDay = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const e of filteredEmployees) {
      const mins = new Array<number>(days.length).fill(0);
      for (const r of e.rows) {
        const dk = dayKeyLocal(new Date(r.clockInAt));
        const di = dayIndexByKey.get(dk);
        if (di === -1) continue;
        if (di == null) continue;
        mins[di] += punchMinutes(r) ?? 0;
      }

      // Automatic paid holiday hours when the store is closed (no logged time).
      for (let di = 0; di < days.length; di++) {
        if (mins[di] > 0) continue;
        const key = dayKeys[di];
        if (!key) continue;
        const h = holidayByDayKey.get(key);
        if (!h || !h.isPaid) continue;
        const hours = h.paidHours ?? 8;
        if (hours > 0) mins[di] += Math.round(hours * 60);
      }

      map.set(e.employeeId, mins);
    }
    return map;
  }, [filteredEmployees, dayIndexByKey, dayKeys, days.length, holidayByDayKey]);

  /**
   * Track A rollup: actual worked minutes (net of unpaid breaks), paid PTO
   * hours overlapping the period, and paid holiday hours auto-credited on
   * "no logged time" days. Keep these three components separate so the gross-
   * pay calculation stays auditable.
   */
  const payableByEmployeeId = useMemo(() => {
    const periodStart = bounds.start;
    const periodEnd = bounds.endExclusive;
    const map = new Map<string, PayableHoursResult>();

    for (const e of filteredEmployees) {
      let workedMinutes = 0;
      for (const r of e.rows) {
        const m = punchMinutes(r);
        if (m != null && m > 0) workedMinutes += m;
      }

      // Holiday auto-credit minutes already merged into minutesForEmployeeByDay.
      // Subtract worked from that to recover the "holiday-only" portion (no double count).
      const dayMins = minutesForEmployeeByDay.get(e.employeeId) ?? [];
      const dayMinsTotal = dayMins.reduce((a, b) => a + b, 0);
      const paidHolidayMinutes = Math.max(0, dayMinsTotal - workedMinutes);
      const paidHolidayHours = paidHolidayMinutes / 60;

      const pto = rollupTimeOffForEmployeeInRange(
        e.employeeId,
        timeOffRecords,
        periodStart,
        periodEnd,
      );
      const approvedPtoHours = pto.paidMinutes / 60;

      const rate = hourlyRatesByEmployee[e.employeeId] ?? null;
      map.set(
        e.employeeId,
        calculatePayableHours({
          workedMinutes,
          approvedPtoHours,
          paidHolidayHours,
          hourlyRate: rate,
          policy: payrollPolicy,
        }),
      );
    }
    return map;
  }, [
    filteredEmployees,
    minutesForEmployeeByDay,
    timeOffRecords,
    hourlyRatesByEmployee,
    bounds,
    payrollPolicy,
  ]);

  const payableSummary = useMemo(
    () => summarizePayableHours([...payableByEmployeeId.values()]),
    [payableByEmployeeId],
  );

  const gridTemplate = `260px repeat(${days.length}, minmax(52px, 1fr))`;

  const subtitle =
    clockDefaultKind !== periodKind
      ? `Clock default: ${periodKindLabel(clockDefaultKind)} · View: ${periodKindLabel(periodKind)}`
      : `Period: ${periodKindLabel(periodKind)}`;

  return (
    <div className="space-y-3">
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {err}
        </p>
      ) : null}
      {approvalErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {approvalErr}
        </p>
      ) : null}

      {lockErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {lockErr}
        </p>
      ) : null}

      {payrollCsvErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {payrollCsvErr}
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Timesheets</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {subtitle}. Green pill = total worked time that day · scroll horizontally when needed.
              </p>
            </div>
            {isPeriodLocked && payPeriodLock ? (
              <div
                role="status"
                className="inline-flex items-start gap-2 rounded-lg border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 shadow-sm"
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="leading-snug">
                  <span className="block uppercase tracking-wide">Pay period locked</span>
                  <span className="mt-0.5 block font-medium">
                    Punches in this period are read-only.
                    {payPeriodLock.lockedByName
                      ? ` Locked by ${payPeriodLock.lockedByName}`
                      : " Locked"}
                    {payPeriodLock.lockedAt
                      ? ` on ${new Date(payPeriodLock.lockedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`
                      : "."}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
                aria-label="Search employees"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border transition-colors ${
                  filtersOpen
                    ? "border-sky-300 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-sky-600 hover:bg-slate-50"
                }`}
                aria-expanded={filtersOpen}
                aria-label="Toggle filters"
              >
                <Filter className="h-4 w-4" />
              </button>

              <div className="relative min-w-[10rem] shrink-0">
                <select
                  value={periodKind}
                  onChange={(e) => {
                    const next = e.target.value as TimesheetPeriodKind;
                    pushTimesheetsQuery({
                      period: next,
                      anchor: new Date(),
                      clearCustomRange: true,
                    });
                  }}
                  className="h-10 w-full cursor-pointer appearance-none rounded border border-slate-200 bg-white py-2 pl-4 pr-12 text-sm font-medium text-slate-800 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
                  aria-label="Period type"
                >
                  <option value="weekly">Week</option>
                  <option value="bi_weekly">Bi-week</option>
                  <option value="monthly">Month</option>
                  <option value="semi_monthly">Semi-month</option>
                  <option value="custom">Custom split</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>

              <TimesheetRangePicker
                key={`${periodStartIso}-${periodEndExclusiveIso}`}
                rangeLabel={rangeLabel}
                periodStart={new Date(periodStartIso)}
                periodEndInclusive={periodEndInclusive}
                weekStartsOn={
                  ((typeof periodConfig.week_starts_on === "number"
                    ? periodConfig.week_starts_on
                    : 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6)
                }
                hasCustomRange={hasCustomRange}
                onApplyCustomRange={(fromYmd, toYmd) =>
                  pushTimesheetsQuery({ rangeFrom: fromYmd, rangeTo: toYmd })
                }
                onClearCustomRange={() =>
                  pushTimesheetsQuery({ anchor: new Date(), clearCustomRange: true })
                }
                onNavigatePrev={() => {
                  if (rangeFromYmd && rangeToYmd) {
                    const n = shiftCustomRangeYmd(rangeFromYmd, rangeToYmd, -1);
                    if (n) {
                      pushTimesheetsQuery({ rangeFrom: n.from, rangeTo: n.to });
                    }
                    return;
                  }
                  const start = new Date(periodStartIso);
                  const newStart = shiftPeriodAnchor(start, periodKind, periodConfig, -1);
                  pushTimesheetsQuery({ anchor: newStart, clearCustomRange: true });
                }}
                onNavigateNext={() => {
                  if (rangeFromYmd && rangeToYmd) {
                    const n = shiftCustomRangeYmd(rangeFromYmd, rangeToYmd, 1);
                    if (n) {
                      pushTimesheetsQuery({ rangeFrom: n.from, rangeTo: n.to });
                    }
                    return;
                  }
                  const start = new Date(periodStartIso);
                  const newStart = shiftPeriodAnchor(start, periodKind, periodConfig, 1);
                  pushTimesheetsQuery({ anchor: newStart, clearCustomRange: true });
                }}
                onJumpToToday={() =>
                  pushTimesheetsQuery({ anchor: new Date(), clearCustomRange: true })
                }
              />

              <div className="relative min-w-[11rem] shrink-0">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 w-full cursor-pointer appearance-none rounded border border-slate-200 bg-white py-2 pl-4 pr-12 text-sm font-medium text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
                  aria-label="Status filter"
                >
                  <option value="all">All statuses</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending review</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>

              <button
                type="button"
                disabled={rowsForExport.length === 0}
                onClick={onExportCsv}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                title="Download logged time for the visible period as a spreadsheet"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Export Report
              </button>

              <button
                type="button"
                onClick={onDownloadPayrollCsv}
                disabled={payrollCsvPending}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Gusto-ready unified payroll CSV: regular vs OT hours, PTO, holiday hours, hourly rate, gross pay, and a flag if any wage is using the demo fallback."
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                {payrollCsvPending ? "Building…" : "Download Payroll CSV"}
              </button>

              {canLockPayPeriods && payPeriodLock ? (
                <button
                  type="button"
                  onClick={onToggleLock}
                  disabled={lockPending}
                  className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded px-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                    isPeriodLocked
                      ? "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                      : "border border-rose-300 bg-rose-600 text-white hover:bg-rose-700"
                  }`}
                  title={
                    isPeriodLocked
                      ? "Unlock this pay period — punches inside will become editable again."
                      : "Lock this pay period — Owner only. Punches inside become read-only at the database level."
                  }
                >
                  {isPeriodLocked ? (
                    <LockOpen className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Lock className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {lockPending
                    ? isPeriodLocked
                      ? "Unlocking…"
                      : "Locking…"
                    : isPeriodLocked
                      ? "Unlock pay period"
                      : "Lock pay period"}
                </button>
              ) : null}

              {canArchive ? (
                <button
                  type="button"
                  disabled={seedPending}
                  className="h-10 shrink-0 rounded bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  title="Insert sample clock-ins for this and last week (preview only)"
                  onClick={() => {
                    setErr(null);
                    setSeedPending(true);
                    startTransition(async () => {
                      const r = await seedSampleTimesheetPunches(timeClockId, locationId);
                      setSeedPending(false);
                      if (!r.ok) {
                        setErr(r.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                >
                  {seedPending ? "…" : "Add sample data"}
                </button>
              ) : null}
            </div>
          </div>

          {filtersOpen ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-slate-100/90 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center">
              <span className="text-sm font-bold text-slate-800">Filter</span>
              <div className="relative min-w-[7.25rem]">
                <select
                  disabled
                  className="h-9 w-full cursor-not-allowed appearance-none rounded border border-slate-200/90 bg-white py-1.5 pl-3.5 pr-9 text-sm text-slate-500 opacity-90"
                  title="Connect smart groups when ready"
                >
                  <option>Groups</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
              </div>
              <div className="relative min-w-[7.75rem]">
                <select
                  disabled
                  className="h-9 w-full cursor-not-allowed appearance-none rounded border border-slate-200/90 bg-white py-1.5 pl-3.5 pr-9 text-sm text-slate-500 opacity-90"
                  title="Department field — add to employees when ready"
                >
                  <option>Department</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
              </div>
              <div className="relative min-w-[7.25rem]">
                <select
                  disabled
                  className="h-9 w-full cursor-not-allowed appearance-none rounded border border-slate-200/90 bg-white py-1.5 pl-3.5 pr-9 text-sm text-slate-500 opacity-90"
                  title="Use store / location scope from header when ready"
                >
                  <option>Branch</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
              </div>
              <div className="relative min-w-[9rem]">
                <select
                  disabled
                  className="h-9 w-full cursor-not-allowed appearance-none rounded border border-slate-200/90 bg-white py-1.5 pl-3.5 pr-9 text-sm text-slate-500 opacity-90"
                  title="Direct manager — see employee profile fields when ready"
                >
                  <option>Direct manager</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
              </div>
              <button
                type="button"
                disabled
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-200/90 bg-white text-sky-600 opacity-60"
                title="Add filter — later"
                aria-label="Add filter"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>

        {filteredEmployees.length > 0 ? (
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Total payable hours
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                    {payableSummary.totalPayableHours.toFixed(2)} h
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Worked − unpaid breaks + approved PTO + paid holidays
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Reg / OT (worked only)
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                    <span>{payableSummary.regularHours.toFixed(2)}h</span>
                    <span className="text-slate-300"> · </span>
                    <span
                      className={
                        payableSummary.overtimeHours > 0 ? "text-rose-700" : "text-slate-500"
                      }
                    >
                      OT {payableSummary.overtimeHours.toFixed(2)}h
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Over 40h/wk = 1.5× ·{" "}
                    {payableSummary.employeesWithOvertime} employee
                    {payableSummary.employeesWithOvertime === 1 ? "" : "s"} on OT
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Estimated gross pay
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                    {formatGrossPayLabel(payableSummary.estimatedGrossPay)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Reg {formatGrossPayLabel(payableSummary.estimatedRegularPay)} · OT{" "}
                    {formatGrossPayLabel(payableSummary.estimatedOvertimePay)}
                  </p>
                </div>
              </div>
              {payableSummary.employeesOnFallbackRate > 0 ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border-2 border-amber-400 bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div className="leading-snug">
                    <span className="block uppercase tracking-wide">⚠️ Demo rate in use</span>
                    <span className="mt-0.5 block font-semibold">
                      {payableSummary.employeesOnFallbackRate} of {payableSummary.employeeCount}{" "}
                      employees have no wage on file. Update Profile → Hourly rate before exporting.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {filteredEmployees.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No team members match this period or search. Try a different date range or clear the search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(400, 260 + days.length * 52) }}>
              <div
                className="grid border-b border-slate-200 bg-slate-50/80"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="sticky left-0 z-[1] border-r border-slate-200 bg-slate-50/95 p-2 backdrop-blur-sm sm:p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Employee
                  </div>
                </div>
                {days.map((d, di) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const hk = dayKeys[di];
                  const holiday = hk ? holidayByDayKey.get(hk) ?? null : null;
                  return (
                    <div
                      key={di}
                      className={`border-r border-slate-200 p-1.5 text-center last:border-r-0 sm:p-2 ${
                        holiday ? "bg-amber-50/70" : isWeekend ? "bg-slate-100/80" : ""
                      }`}
                      title={
                        holiday
                          ? `${holiday.name}${holiday.isPaid ? ` (paid${holiday.paidHours ? ` ${holiday.paidHours}h` : ""})` : ""}`
                          : undefined
                      }
                    >
                      <div className="text-[10px] font-semibold leading-tight text-slate-600 sm:text-[11px]">
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-900 sm:text-xs">
                        {d.getDate()}
                      </div>
                      {holiday ? (
                        <div className="mt-0.5 truncate text-[9px] font-semibold text-amber-700 sm:text-[10px]">
                          {holiday.name}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {filteredEmployees.map((e) => {
                const mins = minutesForEmployeeByDay.get(e.employeeId) ?? new Array(days.length).fill(0);
                const totalPeriod = mins.reduce((a, b) => a + b, 0);
                const canOpenAnyTimecard = e.rows.length > 0;
                const payable = payableByEmployeeId.get(e.employeeId) ?? null;
                return (
                  <div
                    key={e.employeeId}
                    className="grid border-b border-slate-100 bg-white"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <button
                      type="button"
                      className="sticky left-0 z-[1] border-r border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50/80 sm:px-4 sm:py-3"
                      onClick={() => {
                        if (!canOpenAnyTimecard) return;
                        setTimecardAnchorRow(e.rows[e.rows.length - 1] ?? null);
                      }}
                      disabled={!canOpenAnyTimecard}
                      title={
                        !canOpenAnyTimecard
                          ? "No logged time for this team member in this period."
                          : "Open timecard"
                      }
                    >
                      <div className="truncate text-sm font-semibold text-slate-900">{e.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-md bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                          {e.role || "—"}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="tabular-nums">
                          {totalPeriod ? `${formatHoursMinutes(totalPeriod)} this period` : "—"}
                        </span>
                      </div>
                      {payable ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-semibold tabular-nums text-slate-700">
                            <span className="text-slate-500">Reg</span>
                            {payable.regularHours.toFixed(2)}h
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold tabular-nums ${
                              payable.overtimeHours > 0
                                ? "border-rose-300 bg-rose-50 text-rose-800"
                                : "border-slate-200 bg-white text-slate-500"
                            }`}
                            title={`Over ${payable.weeklyOtThreshold}h/wk → 1.5× rate`}
                          >
                            <span className={payable.overtimeHours > 0 ? "text-rose-600" : "text-slate-400"}>
                              OT
                            </span>
                            {payable.overtimeHours.toFixed(2)}h
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-semibold tabular-nums text-slate-700">
                            <span className="text-slate-500">Payable</span>
                            {payable.totalPayableHours.toFixed(2)}h
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold tabular-nums shadow-sm ${
                              payable.isUsingFallbackRate
                                ? "bg-amber-100 text-amber-900 ring-1 ring-amber-400"
                                : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                            }`}
                            title={
                              payable.overtimeHours > 0
                                ? `Reg ${formatGrossPayLabel(payable.estimatedRegularPay)} · OT ${formatGrossPayLabel(payable.estimatedOvertimePay)} (1.5× of ${formatGrossPayLabel(payable.hourlyRate)}/hr)`
                                : `@ ${formatGrossPayLabel(payable.hourlyRate)}/hr × ${payable.totalPayableHours.toFixed(2)}h`
                            }
                          >
                            {formatGrossPayLabel(payable.estimatedGrossPay)}
                          </span>
                          {payable.isUsingFallbackRate ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-950 shadow-sm"
                              role="alert"
                              aria-label="Demo rate in use — update employee profile"
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              Demo rate — update in profile
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>

                    {mins.map((m, di) => {
                      const has = m > 0;
                      const anchor =
                        e.rows.find((r) => dayKeyLocal(new Date(r.clockInAt)) === dayKeys[di]) ?? null;
                      const dk = dayKeys[di];
                      const holiday = dk ? holidayByDayKey.get(dk) ?? null : null;
                      const isHolidayPayCell = has && !anchor && Boolean(holiday?.isPaid);
                      const canOpenCell = Boolean(anchor) || canOpenAnyTimecard;
                      return (
                        <div
                          key={di}
                          className="flex min-h-[52px] items-center justify-center border-r border-slate-100 p-1 last:border-r-0 sm:min-h-[56px]"
                        >
                          {has ? (
                            canOpenCell ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setTimecardAnchorRow(anchor ?? e.rows[e.rows.length - 1] ?? null)
                                }
                                className={`inline-flex max-w-full items-center justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold tabular-nums text-white shadow-sm sm:px-2 sm:text-sm ${
                                  isHolidayPayCell
                                    ? "bg-amber-600 hover:bg-amber-700"
                                    : "bg-emerald-600 hover:bg-emerald-700"
                                }`}
                                title={
                                  isHolidayPayCell
                                    ? `${holiday?.name ?? "Holiday"} (paid)`
                                    : "Open timecard"
                                }
                              >
                                {isHolidayPayCell ? `Holiday ${formatHoursMinutes(m)}` : formatHoursMinutes(m)}
                              </button>
                            ) : (
                              <span
                                className={`inline-flex max-w-full items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums text-white shadow-sm ${
                                  isHolidayPayCell ? "bg-amber-600" : "bg-emerald-600"
                                }`}
                                title={
                                  isHolidayPayCell
                                    ? `${holiday?.name ?? "Holiday"} (paid) — nothing to open`
                                    : "Nothing to open"
                                }
                              >
                                {isHolidayPayCell ? `Holiday ${formatHoursMinutes(m)}` : formatHoursMinutes(m)}
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-300 sm:text-xs">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!canArchive ? (
        <p className="text-xs text-slate-500">
          Sample data and edits require time clock management permission.
        </p>
      ) : null}

      <EmployeeTimecardModal
        key={timecardAnchorRow?.employeeId ?? "closed"}
        open={timecardAnchorRow != null}
        onClose={() => setTimecardAnchorRow(null)}
        rows={timecardRows}
        canEditJob={canArchive}
        canApprovePunches={canArchive}
        onApproveEntry={canArchive ? onApproveEntry : undefined}
        onUnapproveEntry={canArchive ? onUnapproveEntry : undefined}
        approvalPending={actionPending}
        canManageTimeEntries={canArchive}
        storeEmployees={storeEmployees}
        locationId={locationId}
        timeOffRecords={timeOffRecords}
        onPunchAdjusted={() => router.refresh()}
      />
    </div>
  );
}
