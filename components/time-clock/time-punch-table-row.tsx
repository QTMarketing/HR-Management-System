"use client";

import { CalendarDays } from "lucide-react";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";

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

type Props = {
  row: EnrichedPunchRow;
  /** 0-based index in the filtered list (displayed as 1-based #). */
  displayIndex: number;
  zebra: boolean;
  showClockOutActions: boolean;
  onClockOut?: (entryId: string) => void;
  pending?: boolean;
};

/**
 * One row of the punch table — keep column cells aligned with `PUNCH_TABLE_COLUMNS`
 * in `lib/time-clock/punch-table-columns.ts`.
 */
export function TimePunchTableRow({
  row,
  displayIndex,
  zebra,
  showClockOutActions,
  onClockOut,
  pending = false,
}: Props) {
  return (
    <tr
      className={`border-b border-slate-100 last:border-b-0 ${
        zebra ? "bg-slate-50/40" : "bg-white"
      }`}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-center gap-2">
          <span className="w-5 text-center text-xs tabular-nums text-slate-400">
            {displayIndex + 1}
          </span>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-950"
            title={row.employeeName}
          >
            {row.initials}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 font-medium">{row.employeeName}</td>
      <td className="px-3 py-2.5 text-slate-600">
        {row.scheduleLabel ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="px-3 py-2.5">
        {row.shiftTypeLabel === "—" ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-950 ring-1 ring-orange-200/80">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            {row.shiftTypeLabel}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${jobPillClass(row.jobTone)}`}
        >
          {row.employeeRole}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-700">{row.clockInDisplay}</span>
          {row.lateInBadge ? (
            <span className="inline-flex rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-200/80">
              {row.lateInBadge}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600">
            {row.clockOutDisplay === "—" ? "—" : row.clockOutDisplay}
          </span>
          {row.lateOutBadge ? (
            <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-amber-200/80">
              Late out {row.lateOutBadge}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-sm text-slate-800">{row.dailyTotalLabel}</td>
      <td className="px-3 py-2.5 text-slate-500">{row.ptoLabel}</td>
      <td className="px-3 py-2.5">
        <span
          className={
            row.status === "open"
              ? "inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
              : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
          }
        >
          {row.status}
        </span>
      </td>
      {showClockOutActions ? (
        <td className="px-3 py-2.5 text-right">
          {row.status === "open" && onClockOut ? (
            <button
              type="button"
              onClick={() => onClockOut(row.id)}
              disabled={pending}
              className="text-sm font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
            >
              Clock out
            </button>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}
