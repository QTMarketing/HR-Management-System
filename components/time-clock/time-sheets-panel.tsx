"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { seedSampleTimesheetPunches } from "@/app/actions/seed-time-entries";
import { EmployeeTimecardModal } from "@/components/time-clock/employee-timecard-modal";
import { formatHoursMinutes, punchMinutes } from "@/lib/time-clock/timecard-rollup";
import {
  enumerateDaysInPeriod,
  formatPeriodRangeLabel,
  shiftPeriodAnchor,
  type TimesheetPeriodConfig,
  type TimesheetPeriodKind,
} from "@/lib/time-clock/timesheet-period";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";

type Props = {
  /** Rows for the active period (grid). */
  rows: EnrichedPunchRow[];
  /** Wider pool for employee timecard modal (e.g. last 90 days). */
  modalPoolRows: EnrichedPunchRow[];
  locationId: string;
  timeClockId: string;
  canArchive: boolean;
  periodKind: TimesheetPeriodKind;
  periodConfig: TimesheetPeriodConfig;
  periodStartIso: string;
  periodEndExclusiveIso: string;
  clockDefaultKind: TimesheetPeriodKind;
};

function dayKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function periodKindLabel(k: TimesheetPeriodKind): string {
  switch (k) {
    case "weekly":
      return "Week";
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
  locationId,
  timeClockId,
  canArchive,
  periodKind,
  periodConfig,
  periodStartIso,
  periodEndExclusiveIso,
  clockDefaultKind,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [seedPending, setSeedPending] = useState(false);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [timecardAnchorRow, setTimecardAnchorRow] = useState<EnrichedPunchRow | null>(null);

  const bounds = useMemo(
    () => ({
      start: new Date(periodStartIso),
      endExclusive: new Date(periodEndExclusiveIso),
    }),
    [periodStartIso, periodEndExclusiveIso],
  );

  const days = useMemo(() => enumerateDaysInPeriod(bounds), [bounds]);
  const dayKeys = useMemo(() => days.map((d) => dayKeyLocal(d)), [days]);
  const rangeLabel = useMemo(() => formatPeriodRangeLabel(bounds), [bounds]);

  const timecardRows = useMemo(() => {
    if (!timecardAnchorRow) return [];
    const fromPool = modalPoolRows.filter((r) => r.employeeId === timecardAnchorRow.employeeId);
    return fromPool.length > 0 ? fromPool : [timecardAnchorRow];
  }, [modalPoolRows, timecardAnchorRow]);

  function pushTimesheetsQuery(updates: { period?: TimesheetPeriodKind; anchor?: Date }) {
    const q = new URLSearchParams(searchParams.toString());
    q.set("view", "timesheets");
    q.set("period", updates.period ?? periodKind);
    if (updates.anchor) q.set("anchor", updates.anchor.toISOString());
    router.push(`/time-clock/${timeClockId}?${q.toString()}`);
  }

  const byEmployee = useMemo(() => {
    const map = new Map<
      string,
      { employeeId: string; name: string; role: string; rows: EnrichedPunchRow[] }
    >();
    for (const r of rows) {
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
  }, [rows]);

  const filteredEmployees = useMemo(() => {
    let list = byEmployee;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      list = list;
    }
    return list;
  }, [byEmployee, query, statusFilter]);

  const minutesForEmployeeByDay = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const e of filteredEmployees) {
      const mins = new Array<number>(days.length).fill(0);
      for (const r of e.rows) {
        const dk = dayKeyLocal(new Date(r.clockInAt));
        const di = dayKeys.indexOf(dk);
        if (di === -1) continue;
        mins[di] += punchMinutes(r) ?? 0;
      }
      map.set(e.employeeId, mins);
    }
    return map;
  }, [filteredEmployees, dayKeys, days.length]);

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

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-800">Timesheets</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {subtitle}. Green pill = total worked time that day · scroll horizontally when needed.
          </p>
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
                    pushTimesheetsQuery({ period: next, anchor: new Date() });
                  }}
                  className="h-10 w-full cursor-pointer appearance-none rounded border border-slate-200 bg-white py-2 pl-4 pr-10 text-sm font-medium text-slate-800 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
                  aria-label="Period type"
                >
                  <option value="weekly">Week</option>
                  <option value="monthly">Month</option>
                  <option value="semi_monthly">Semi-month</option>
                  <option value="custom">Custom split</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>

              <div className="inline-flex min-w-0 items-center gap-0 rounded border border-slate-200 bg-white pl-1 pr-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    const start = new Date(periodStartIso);
                    const newStart = shiftPeriodAnchor(start, periodKind, periodConfig, -1);
                    pushTimesheetsQuery({ anchor: newStart });
                  }}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
                  aria-label="Previous period"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => pushTimesheetsQuery({ anchor: new Date() })}
                  className="min-w-[8.5rem] px-2 py-2 text-center text-sm font-semibold tabular-nums text-slate-900 sm:min-w-[10rem]"
                  title="Jump to period containing today"
                >
                  {rangeLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const start = new Date(periodStartIso);
                    const newStart = shiftPeriodAnchor(start, periodKind, periodConfig, 1);
                    pushTimesheetsQuery({ anchor: newStart });
                  }}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
                  aria-label="Next period"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="relative min-w-[11rem] shrink-0">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 w-full cursor-pointer appearance-none rounded border border-slate-200 bg-white py-2 pl-4 pr-10 text-sm font-medium text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
                  aria-label="Status filter"
                >
                  <option value="all">Status filter</option>
                  <option value="approved" disabled>
                    Approved (soon)
                  </option>
                  <option value="pending" disabled>
                    Pending (soon)
                  </option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>

              {canArchive ? (
                <button
                  type="button"
                  disabled={seedPending}
                  className="h-10 shrink-0 rounded bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  title="Insert sample punches (this + last week)"
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
                  {seedPending ? "…" : "Sample data"}
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

        {filteredEmployees.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No employees match this period / search.
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
                  return (
                    <div
                      key={di}
                      className={`border-r border-slate-200 p-1.5 text-center last:border-r-0 sm:p-2 ${
                        isWeekend ? "bg-slate-100/80" : ""
                      }`}
                    >
                      <div className="text-[10px] font-semibold leading-tight text-slate-600 sm:text-[11px]">
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-900 sm:text-xs">
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredEmployees.map((e) => {
                const mins = minutesForEmployeeByDay.get(e.employeeId) ?? new Array(days.length).fill(0);
                const totalPeriod = mins.reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={e.employeeId}
                    className="grid border-b border-slate-100 bg-white"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <button
                      type="button"
                      className="sticky left-0 z-[1] border-r border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50/80 sm:px-4 sm:py-3"
                      onClick={() => setTimecardAnchorRow(e.rows[e.rows.length - 1] ?? null)}
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
                    </button>

                    {mins.map((m, di) => {
                      const has = m > 0;
                      const anchor =
                        e.rows.find((r) => dayKeyLocal(new Date(r.clockInAt)) === dayKeys[di]) ?? null;
                      return (
                        <div
                          key={di}
                          className="flex min-h-[52px] items-center justify-center border-r border-slate-100 p-1 last:border-r-0 sm:min-h-[56px]"
                        >
                          {has ? (
                            <button
                              type="button"
                              onClick={() =>
                                setTimecardAnchorRow(anchor ?? e.rows[e.rows.length - 1] ?? null)
                              }
                              className="inline-flex max-w-full items-center justify-center rounded-md bg-emerald-600 px-1.5 py-1 text-[11px] font-semibold tabular-nums text-white shadow-sm hover:bg-emerald-700 sm:px-2 sm:text-sm"
                              title="Open timecard"
                            >
                              {formatHoursMinutes(m)}
                            </button>
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
      />
    </div>
  );
}
