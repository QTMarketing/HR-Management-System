"use client";

import type { ShiftForBoard } from "@/lib/schedule/board-model";
import { formatDateShort, formatSpan, hoursBetweenIso } from "@/components/schedule/schedule-board-format";

export function ScheduleBoardListView({ listRows }: { listRows: ShiftForBoard[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="text-xs font-semibold text-slate-700">List view</div>
        <div className="text-xs text-slate-500">{listRows.length} shifts</div>
      </div>
      <table className="w-full min-w-[1000px] border-collapse">
        <thead className="bg-slate-50/80">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="border-b border-slate-200 px-3 py-2">Users</th>
            <th className="border-b border-slate-200 px-3 py-2">Job</th>
            <th className="border-b border-slate-200 px-3 py-2">Date</th>
            <th className="border-b border-slate-200 px-3 py-2">Set times</th>
            <th className="border-b border-slate-200 px-3 py-2">Shift total</th>
            <th className="border-b border-slate-200 px-3 py-2">Status</th>
            <th className="border-b border-slate-200 px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {listRows.map((s) => (
            <tr key={s.id} className="text-sm text-slate-800 hover:bg-slate-50">
              <td className="border-b border-slate-100 px-3 py-2">
                <div className="font-medium">{s.assignedLabel}</div>
                {s.assignedEmployeeNames.length > 1 ? (
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {s.assignedEmployeeNames.slice(0, 4).join(", ")}
                    {s.assignedEmployeeNames.length > 4 ? "…" : ""}
                  </div>
                ) : null}
              </td>
              <td className="border-b border-slate-100 px-3 py-2">
                <span
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-semibold text-slate-800"
                  title={s.jobName ?? "—"}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.jobColorHex }}
                    aria-hidden
                  />
                  {s.jobName ?? "—"}
                </span>
              </td>
              <td className="border-b border-slate-100 px-3 py-2 text-sm text-slate-700">
                {formatDateShort(s.shift_start)}
              </td>
              <td className="border-b border-slate-100 px-3 py-2 tabular-nums text-slate-700">
                {formatSpan(s.shift_start, s.shift_end)}
              </td>
              <td className="border-b border-slate-100 px-3 py-2 tabular-nums text-slate-700">
                {hoursBetweenIso(s.shift_start, s.shift_end)}
              </td>
              <td className="border-b border-slate-100 px-3 py-2">
                {!s.isPublished ? (
                  <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200/60">
                    Draft
                  </span>
                ) : (
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/60">
                    Published
                  </span>
                )}
              </td>
              <td className="border-b border-slate-100 px-3 py-2 text-sm text-slate-600">
                {s.notes ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
