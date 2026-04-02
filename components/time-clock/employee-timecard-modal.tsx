"use client";

/**
 * Employee timecard overlay — layout aligned with legacy LaMa / familiar ops UI:
 * top Close, identity + period strip, summary metrics, Add / export / Approve,
 * dense grid with checkbox, job picker styling, scheduled vs difference (red when under),
 * weekly column, vertical “Shift attachments” rail, notes columns.
 */

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { POSITION_ROLE_OPTIONS, type PositionRoleValue } from "@/lib/users/position-options";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";
import {
  dailyMinutesMap,
  formatHoursMinutes,
  formatSignedVarianceMinutes,
  localDayKey,
  punchMinutes,
  startOfWeekMonday,
  weekRangeLabel,
} from "@/lib/time-clock/timecard-rollup";

function jobPillClass(tone: EnrichedPunchRow["jobTone"]): string {
  switch (tone) {
    case "manager":
      return "bg-rose-100 text-rose-900 ring-rose-200/80";
    case "lead":
      return "bg-violet-100 text-violet-900 ring-violet-200/80";
    case "staff":
      return "bg-pink-100 text-pink-900 ring-pink-200/80";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-200/80";
  }
}

function formatTimeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDayHeader(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  rows: EnrichedPunchRow[];
  /** Enable editing job/position on rows (admins only). */
  canEditJob?: boolean;
};

type WeekBlock = {
  monday: Date;
  rows: EnrichedPunchRow[];
};

export function EmployeeTimecardModal({ open, onClose, rows, canEditJob = false }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const meta = useMemo(() => {
    if (rows.length === 0) return null;
    const sorted = [...rows].sort(
      (a, b) => new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime(),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const byDay = dailyMinutesMap(sorted);
    const totalPaid = [...byDay.values()].reduce((a, b) => a + b, 0);
    const workedDays = byDay.size;

    let totalVariance = 0;
    let varianceCount = 0;
    for (const r of sorted) {
      if (r.scheduleVarianceMinutes != null) {
        totalVariance += r.scheduleVarianceMinutes;
        varianceCount += 1;
      }
    }

    const byWeek = new Map<number, EnrichedPunchRow[]>();
    for (const row of sorted) {
      const mon = startOfWeekMonday(new Date(row.clockInAt));
      const t = mon.getTime();
      if (!byWeek.has(t)) byWeek.set(t, []);
      byWeek.get(t)!.push(row);
    }
    const weekBlocks: WeekBlock[] = [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, rs]) => ({ monday: new Date(t), rows: rs }));

    const periodStart = new Date(first.clockInAt).toLocaleDateString(undefined, {
      month: "2-digit",
      day: "2-digit",
    });
    const periodEnd = new Date(last.clockInAt).toLocaleDateString(undefined, {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });

    return {
      first,
      last,
      byDay,
      totalPaid,
      workedDays,
      weekBlocks,
      totalVariance,
      varianceCount,
      periodLabel: `${periodStart} - ${periodEnd}`,
    };
  }, [rows]);

  const [jobOverrides, setJobOverrides] = useState<Record<string, PositionRoleValue | undefined>>(
    {},
  );

  useEffect(() => {
    if (!open) return;
    // Reset overrides whenever the modal opens on a different employee.
    setJobOverrides({});
  }, [open, rows]);

  if (!open || !meta) return null;

  const { first, byDay, totalPaid, workedDays, weekBlocks, totalVariance, periodLabel } = meta;

  /** Roomier cells / type — legacy LaMa-style tables used more padding than compact data grids. */
  const theadCls =
    "border-b border-slate-200 bg-slate-100/95 text-xs font-bold uppercase tracking-wide text-slate-600";
  const cellBorder = "border-b border-slate-200 border-r border-slate-200 last:border-r-0";
  const thPad = "whitespace-nowrap px-4 py-3.5 align-middle";
  const tdPad = "px-4 py-4 align-middle";
  const totalDiffNegative = meta.varianceCount > 0 && totalVariance < 0;
  const totalDiffDisplay =
    meta.varianceCount > 0 ? formatSignedVarianceMinutes(totalVariance) : "—";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timecard-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close timecard"
        onClick={onClose}
      />
      <div
        className="relative flex h-[90vh] max-h-[90vh] w-[98%] max-w-none flex-col overflow-hidden rounded-t-xl border border-slate-300 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LaMa-style top Close */}
        <div className="flex shrink-0 justify-center border-b border-slate-200 bg-slate-50 py-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            Close
          </button>
        </div>

        {/* Identity + period + actions */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-sm font-bold text-slate-800"
              aria-hidden
            >
              {first.initials}
            </span>
            <div className="min-w-0">
              <h2 id="timecard-title" className="truncate text-base font-bold text-slate-900">
                {first.employeeName}
              </h2>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <button
                  type="button"
                  disabled
                  title="Period navigation — coming soon"
                  className="rounded p-0.5 text-slate-400 disabled:cursor-not-allowed"
                  aria-label="Previous period"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[8.5rem] tabular-nums text-center font-medium text-slate-800">
                  {periodLabel}
                </span>
                <button
                  type="button"
                  disabled
                  title="Period navigation — coming soon"
                  className="rounded p-0.5 text-slate-400 disabled:cursor-not-allowed"
                  aria-label="Next period"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <Link
                href={`/users/${first.employeeId}`}
                className="mt-1 inline-block text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                User profile
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              disabled
              title="Add entry — coming soon"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 opacity-60"
            >
              Add +
            </button>
            <button
              type="button"
              disabled
              title="Export — coming soon"
              className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 opacity-60"
              aria-label="Export"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled
              title="Approve — coming soon"
              className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white opacity-70 shadow-sm"
            >
              Approve
            </button>
          </div>
        </div>

        {/* Summary metrics row (LaMa strip) */}
        <div className="flex shrink-0 flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-slate-200 bg-white px-5 py-4 text-sm leading-relaxed">
          <span>
            <span className="font-bold tabular-nums text-slate-900">
              {formatHoursMinutes(totalPaid)}
            </span>{" "}
            <span className="text-slate-500">Regular</span>
          </span>
          <span>
            <span className="font-semibold tabular-nums text-slate-800">00:00</span>{" "}
            <span className="text-slate-500">Paid time off</span>
          </span>
          <span>
            <span className="font-bold tabular-nums text-slate-900">
              {formatHoursMinutes(totalPaid)}
            </span>{" "}
            <span className="text-slate-500">Total Paid Hours</span>
          </span>
          <span>
            <span className="font-bold tabular-nums text-slate-900">{workedDays}</span>{" "}
            <span className="text-slate-500">Worked Days</span>
          </span>
          <span>
            <span className="font-semibold tabular-nums text-slate-800">00:00</span>{" "}
            <span className="text-slate-500">Unpaid time off</span>
          </span>
          <span
            className={`ml-auto font-bold tabular-nums ${
              totalDiffNegative ? "text-red-600" : "text-slate-900"
            }`}
          >
            {totalDiffDisplay}{" "}
            <span className="text-xs font-semibold text-slate-500">Total difference</span>
          </span>
          <span className="font-semibold tabular-nums text-slate-700">
            $0.00 <span className="text-xs font-normal text-slate-500">Pay per dates</span>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[76rem] table-fixed border-collapse text-left text-sm text-slate-800">
            <colgroup>
              <col className="w-[3rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[7rem]" />
              <col className="w-[14rem] min-w-[14rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[6rem]" />
              <col className="w-[7rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[2.75rem]" />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className={theadCls}>
                <th className={`${thPad} text-center ${cellBorder}`} aria-hidden />
                <th className={`${thPad} ${cellBorder}`}>Date</th>
                <th className={`${thPad} ${cellBorder}`}>Type</th>
                <th className={`${thPad} ${cellBorder}`}>Job</th>
                <th className={`${thPad} ${cellBorder}`}>Start</th>
                <th className={`${thPad} ${cellBorder}`}>End</th>
                <th className={`${thPad} ${cellBorder}`}>Total hours</th>
                <th className={`${thPad} ${cellBorder}`}>Daily total</th>
                <th className={`${thPad} ${cellBorder}`}>Scheduled</th>
                <th className={`${thPad} ${cellBorder}`}>Difference</th>
                <th className={`${thPad} ${cellBorder}`}>Weekly total</th>
                <th
                  className={`${thPad} px-1 text-center [text-orientation:mixed] [writing-mode:vertical-rl] text-[11px] font-bold leading-snug text-slate-500 ${cellBorder}`}
                >
                  Shift attachments
                </th>
                <th className={`${thPad} ${cellBorder}`}>Employee notes</th>
                <th className={`${thPad} ${cellBorder}`}>Manager notes</th>
              </tr>
            </thead>
            <tbody>
              {weekBlocks.map((block) => {
                const sunday = new Date(block.monday);
                sunday.setDate(sunday.getDate() + 6);
                const weekLabel = weekRangeLabel(block.monday, sunday);
                const weekMinutes = block.rows.reduce((sum, r) => sum + (punchMinutes(r) ?? 0), 0);
                return (
                  <Fragment key={block.monday.getTime()}>
                    <tr className="bg-slate-200/90">
                      <td colSpan={14} className="px-5 py-2.5 text-center text-sm font-bold text-slate-800">
                        {weekLabel}
                      </td>
                    </tr>
                    {block.rows.map((r, idx) => {
                      const dk = localDayKey(r.clockInAt);
                      const daySum = dk ? (byDay.get(dk) ?? 0) : 0;
                      const isLast = idx === block.rows.length - 1;
                      const v = r.scheduleVarianceMinutes;
                      const diffNeg = v != null && v < 0;
                      const diffZero = v === 0;
                      return (
                        <tr key={r.id} className="bg-white hover:bg-slate-50/90">
                          <td className={`${cellBorder} ${tdPad} text-center`}>
                            <input
                              type="checkbox"
                              disabled
                              className="h-4 w-4 rounded border-slate-300 text-slate-500"
                              aria-label={`Select row ${r.id}`}
                            />
                          </td>
                          <td className={`${cellBorder} ${tdPad} whitespace-nowrap font-semibold text-slate-900`}>
                            {formatDayHeader(r.clockInAt)}
                          </td>
                          <td className={`${cellBorder} ${tdPad}`}>
                            {r.shiftTypeLabel === "—" ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-800">
                                <CalendarDays className="h-4 w-4 shrink-0 opacity-75" aria-hidden />
                                {r.shiftTypeLabel}
                              </span>
                            )}
                          </td>
                          <td className={`${cellBorder} ${tdPad}`}>
                            <div className="relative w-full min-w-0">
                              <div
                                className={`flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm ${
                                  canEditJob ? "hover:border-slate-400" : "opacity-90"
                                }`}
                              >
                                <div className="flex min-h-[2.25rem] min-w-0 flex-1 items-center justify-center px-0.5">
                                  <span
                                    className={`inline-flex max-w-full items-center justify-center whitespace-nowrap rounded px-3 py-1.5 text-center text-sm font-medium leading-snug ring-1 ${jobPillClass(r.jobTone)}`}
                                  >
                                    {jobOverrides[r.id] ?? (r.employeeRole as PositionRoleValue)}
                                  </span>
                                </div>
                                <ChevronDown
                                  className={`h-4 w-4 shrink-0 self-center ${
                                    canEditJob ? "text-slate-400" : "text-slate-300"
                                  }`}
                                  aria-hidden
                                />
                              </div>
                              <select
                                aria-label="Job / position"
                                disabled={!canEditJob}
                                value={jobOverrides[r.id] ?? (r.employeeRole as PositionRoleValue)}
                                onChange={(e) =>
                                  setJobOverrides((prev) => ({
                                    ...prev,
                                    [r.id]: e.target.value as PositionRoleValue,
                                  }))
                                }
                                className="absolute inset-0 h-full w-full cursor-pointer rounded-md bg-transparent opacity-0 disabled:cursor-not-allowed"
                              >
                                {POSITION_ROLE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className={`${cellBorder} ${tdPad} whitespace-nowrap tabular-nums text-slate-800`}>
                            {formatTimeOnly(r.clockInAt)}
                          </td>
                          <td
                            className={`${cellBorder} ${tdPad} whitespace-nowrap tabular-nums text-slate-600`}
                          >
                            {r.clockOutAt ? formatTimeOnly(r.clockOutAt) : "—"}
                          </td>
                          <td className={`${cellBorder} ${tdPad} font-mono text-sm tabular-nums text-slate-800`}>
                            {r.dailyTotalLabel}
                          </td>
                          <td
                            className={`${cellBorder} ${tdPad} font-mono text-sm font-bold tabular-nums text-slate-900`}
                          >
                            {formatHoursMinutes(daySum)}
                          </td>
                          <td
                            className={`${cellBorder} ${tdPad} font-mono text-sm tabular-nums text-slate-700`}
                          >
                            {r.scheduledDurationLabel ?? "—"}
                          </td>
                          <td className={`${cellBorder} ${tdPad}`}>
                            {v == null ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span
                                className={`inline-flex items-center justify-center rounded px-3 py-1.5 text-sm font-semibold tabular-nums leading-snug ring-1 ${
                                  diffNeg
                                    ? "bg-rose-100 text-red-800 ring-rose-200/90"
                                    : diffZero
                                      ? "bg-slate-100 text-slate-800 ring-slate-200/80"
                                      : "bg-rose-50 text-rose-900 ring-rose-200/70"
                                }`}
                              >
                                {formatSignedVarianceMinutes(v)}
                              </span>
                            )}
                          </td>
                          <td
                            className={`${cellBorder} ${tdPad} text-right font-mono text-sm font-bold tabular-nums text-slate-900`}
                          >
                            {isLast ? formatHoursMinutes(weekMinutes) : ""}
                          </td>
                          <td className={`${cellBorder} ${tdPad} bg-slate-50/70`} />
                          <td className={`${cellBorder} ${tdPad} text-sm text-slate-400`}>—</td>
                          <td className={`${cellBorder} ${tdPad} text-sm text-slate-400`}>—</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
