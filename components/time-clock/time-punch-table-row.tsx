"use client";

import { EllipsisTd } from "@/components/ui/ellipsis-td";
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

function reviewBadgeClass(status: EnrichedPunchRow["reviewStatus"]): string {
  switch (status) {
    case "open":
      return "bg-amber-50 text-amber-900 ring-amber-200/80";
    case "pending":
      return "bg-sky-50 text-sky-900 ring-sky-200/80";
    case "approved":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200/80";
    case "archived":
      return "bg-slate-200 text-slate-800 ring-slate-300/80";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
  }
}

type Props = {
  row: EnrichedPunchRow;
  /** 0-based index in the filtered list (displayed as 1-based #). */
  displayIndex: number;
  zebra: boolean;
  showClockOutActions: boolean;
  onClockOut?: (entryId: string) => void;
  showArchiveActions?: boolean;
  onArchive?: (entryId: string) => void;
  showReviewActions?: boolean;
  onApprove?: (entryId: string) => void;
  onUnapprove?: (entryId: string) => void;
  pending?: boolean;
  /** Opens employee timecard (full row is clickable except actions). */
  onRowClick?: () => void;
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
  showArchiveActions = false,
  onArchive,
  showReviewActions = false,
  onApprove,
  onUnapprove,
  pending = false,
  onRowClick,
}: Props) {
  const archived = Boolean(row.isArchived);
  return (
    <tr
      className={`border-b border-slate-100 last:border-b-0 ${
        archived ? "opacity-70" : ""
      } ${zebra ? "bg-slate-50/40" : "bg-white"} ${
        onRowClick ? "cursor-pointer hover:bg-orange-50/25" : ""
      }`}
      onClick={onRowClick}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-center gap-2">
          <span className="w-5 text-center text-xs tabular-nums text-slate-400">
            {displayIndex + 1}
          </span>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-orange-100 text-xs font-semibold text-orange-950"
            title={row.employeeName}
          >
            {row.initials}
          </span>
        </div>
      </td>
      <EllipsisTd
        padClass="px-3 py-2.5 align-middle"
        maxClass="max-w-[14rem]"
        title={row.employeeName}
        className="font-medium"
      >
        {row.employeeName}
      </EllipsisTd>
      <EllipsisTd
        padClass="px-3 py-2.5 align-middle text-slate-600"
        maxClass="max-w-[220px]"
        title={row.scheduleLabel ?? undefined}
      >
        {row.scheduleLabel ?? <span className="text-slate-400">—</span>}
      </EllipsisTd>
      <td className="max-w-[10rem] px-3 py-2.5 align-middle">
        {row.shiftTypeLabel === "—" ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1 truncate rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-950 ring-1 ring-orange-200/80">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            <span className="truncate">{row.shiftTypeLabel}</span>
          </span>
        )}
      </td>
      <td className="max-w-[11rem] px-3 py-2.5 align-middle">
        <span
          className={`inline-flex max-w-full min-w-0 flex-col items-start justify-center gap-0.5 truncate rounded px-2.5 py-1 text-xs font-medium leading-snug ring-1 ${jobPillClass(row.jobTone)}`}
          title={
            row.jobCodeAtPunch
              ? `${row.employeeRole} · Labor code: ${row.jobCodeAtPunch}`
              : row.employeeRole
          }
        >
          <span className="truncate">{row.employeeRole}</span>
          {row.jobCodeAtPunch ? (
            <span className="max-w-full truncate text-[10px] font-normal opacity-90">
              {row.jobCodeAtPunch}
            </span>
          ) : null}
        </span>
      </td>
      <td className="max-w-[200px] px-3 py-2.5 align-middle">
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
          <span
            className="min-w-0 truncate text-slate-700"
            title={[
              row.clockInDisplay,
              row.punchSourceLabel ? `Source: ${row.punchSourceLabel}` : null,
              row.wasEdited ? "Times edited by manager" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {row.clockInDisplay}
          </span>
          {row.lateInBadge ? (
            <span className="shrink-0 inline-flex rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-200/80">
              {row.lateInBadge}
            </span>
          ) : null}
        </div>
      </td>
      <td className="max-w-[200px] px-3 py-2.5 align-middle">
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
          <span className="min-w-0 truncate text-slate-600" title={row.clockOutDisplay}>
            {row.clockOutDisplay === "—" ? "—" : row.clockOutDisplay}
          </span>
          {row.lateOutBadge ? (
            <span className="shrink-0 inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-amber-200/80">
              Late out {row.lateOutBadge}
            </span>
          ) : null}
        </div>
      </td>
      <td className="max-w-[10rem] px-3 py-2.5 align-middle text-xs text-slate-600">
        <span className="line-clamp-2" title={row.breaksSummaryLabel ?? undefined}>
          {row.breaksSummaryLabel ?? <span className="text-slate-400">—</span>}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-sm text-slate-800">
        {row.dailyTotalLabel}
      </td>
      <td className="max-w-[8rem] px-3 py-2.5 align-middle">
        <span
          className="block truncate text-slate-500"
          title={`${row.ptoLabel}. On Today, time off is shown for the same week as the clock-in. On Timesheets, it follows that day’s calendar date.`}
        >
          {row.ptoLabel}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center justify-center rounded px-2.5 py-1 text-xs font-medium leading-snug ring-1 ${reviewBadgeClass(row.reviewStatus)}`}
          title={row.reviewLabel}
        >
          {row.reviewLabel}
        </span>
      </td>
      {showClockOutActions ? (
        <td className="px-3 py-2.5 text-right">
          {row.status === "open" && onClockOut && !archived ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClockOut(row.id);
              }}
              disabled={pending}
              className="text-sm font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
            >
              Clock out
            </button>
          ) : null}
        </td>
      ) : null}
      {showArchiveActions ? (
        <td className="px-3 py-2.5 text-right">
          {archived ? (
            <span className="text-xs text-slate-500">—</span>
          ) : onArchive ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(row.id);
              }}
              disabled={pending}
              className="text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 disabled:opacity-50"
            >
              Archive
            </button>
          ) : null}
        </td>
      ) : null}
      {showReviewActions ? (
        <td className="px-3 py-2.5 text-right">
          {archived || row.reviewStatus === "open" ? (
            <span className="text-xs text-slate-400">—</span>
          ) : row.reviewStatus === "pending" && onApprove ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onApprove(row.id);
              }}
              disabled={pending}
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
            >
              Mark reviewed
            </button>
          ) : row.reviewStatus === "approved" && onUnapprove ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUnapprove(row.id);
              }}
              disabled={pending}
              className="text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 disabled:opacity-50"
            >
              Needs review
            </button>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
      ) : null}
    </tr>
  );
}
