import Link from "next/link";
import { LaborReportCsvButton } from "@/components/reports/labor-report-csv-button";
import { formatHoursClock } from "@/lib/schedule/board-model";
import type { LaborWeekCsvMeta, LaborWeekCsvRow } from "@/lib/reports/labor-week-csv";
import { formatWeekQueryParam } from "@/lib/schedule/week";
import { CalendarRange, Clock } from "lucide-react";

type Props = {
  weekMonday: Date;
  rangeLabel: string;
  scopeLabel: string;
  scheduledHours: number;
  workedHours: number;
  shiftCount: number;
  coveragePct: number | null;
  csvRows: LaborWeekCsvRow[];
  csvMeta: LaborWeekCsvMeta;
  errorMessage: string | null;
  canView: boolean;
};

export function WeeklyLaborPanel({
  weekMonday,
  rangeLabel,
  scopeLabel,
  scheduledHours,
  workedHours,
  shiftCount,
  coveragePct,
  csvRows,
  csvMeta,
  errorMessage,
  canView,
}: Props) {
  if (!canView) return null;

  const weekParam = formatWeekQueryParam(weekMonday);
  const tableRows = [...csvRows].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" }),
  );

  return (
    <section id="weekly-labor" className="scroll-mt-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Weekly labor summary</h2>
          <p className="mt-1 text-sm text-slate-600">
            {rangeLabel}
            <span className="text-slate-400"> · </span>
            <span className="font-medium text-slate-700">{scopeLabel}</span>
          </p>
          <p className="mt-2 max-w-3xl text-xs text-slate-500">
            Live view of scheduled vs worked hours. Download from the report catalog above or use the
            quick export below.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/schedule/board?week=${encodeURIComponent(weekParam)}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <CalendarRange className="h-4 w-4 text-slate-600" />
            View schedule
          </Link>
          <Link
            href="/time-clock"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Clock className="h-4 w-4 text-slate-600" />
            Time clock
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {errorMessage}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Scheduled hours
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                {formatHoursClock(scheduledHours)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Worked hours</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                {formatHoursClock(workedHours)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shifts planned</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{shiftCount}</p>
              <p className="mt-1 text-xs text-slate-500">
                {coveragePct != null ? `${coveragePct}% vs scheduled` : "No shifts scheduled"}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Team breakdown</h3>
                <p className="mt-0.5 text-xs text-slate-500">Employees with scheduled or logged hours this week.</p>
              </div>
              <LaborReportCsvButton weekMonday={weekMonday} meta={csvMeta} rows={csvRows} />
            </div>
            {tableRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No labor data for this week yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3 text-right">Scheduled</th>
                      <th className="px-4 py-3 text-right">Worked</th>
                      <th className="px-4 py-3 text-right">Shifts</th>
                      <th className="px-4 py-3 text-right">vs. scheduled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableRows.map((r) => (
                      <tr key={r.employeeId} className="text-slate-800">
                        <td className="px-4 py-3 font-medium">{r.employeeName}</td>
                        <td className="px-4 py-3 text-slate-600">{r.role}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatHoursClock(r.scheduledHours)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatHoursClock(r.workedHours)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.shiftCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.coveragePct != null ? `${r.coveragePct}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
