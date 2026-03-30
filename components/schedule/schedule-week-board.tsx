"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { publishDraftShiftsForWeek } from "@/app/actions/schedule";
import {
  buildDayColumns,
  draftPublishCount,
  filterShiftsQuery,
  formatHoursClock,
  jobRowsForSection,
  type ShiftForBoard,
  sectionTotals,
  shiftsForCell,
  uniqueGroupSections,
  weekTotals,
} from "@/lib/schedule/board-model";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  Search,
  Users,
} from "lucide-react";

function formatSpan(isoStart: string, isoEnd: string): string {
  try {
    const a = new Date(isoStart);
    const b = new Date(isoEnd);
    const t1 = a.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    const t2 = b.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${t1} – ${t2}`;
  } catch {
    return "—";
  }
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type Props = {
  weekMonday: Date;
  /** `YYYY-MM-DD` for the week’s Monday — sent to publish action. */
  weekParam: string;
  rangeLabel: string;
  prevWeekHref: string;
  nextWeekHref: string;
  todayWeekHref: string;
  locationLabel: string;
  scopeAll: boolean;
  locationNamesById: Map<string, string>;
  shifts: ShiftForBoard[];
  publishDraftCount: number;
};

export function ScheduleWeekBoard({
  weekMonday,
  weekParam,
  rangeLabel,
  prevWeekHref,
  nextWeekHref,
  todayWeekHref,
  locationLabel,
  scopeAll,
  locationNamesById,
  shifts: shiftsProp,
  publishDraftCount: publishFromServer,
}: Props) {
  const router = useRouter();
  const [publishPending, startPublishTransition] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const shifts = useMemo(() => filterShiftsQuery(shiftsProp, search), [shiftsProp, search]);
  const { columns } = buildDayColumns(weekMonday, shifts);
  const sections = uniqueGroupSections(shifts);
  const totals = weekTotals(shifts);
  const publishCount = useMemo(() => draftPublishCount(shifts), [shifts]);
  const today = new Date();
  /** Prefer server count when search cleared so Publish matches full week */
  const publishN = search.trim() ? publishCount : publishFromServer;

  return (
    <div className="min-h-0 space-y-3">
        {/* Toolbar — Connecteam-style */}
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/schedule" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              ← Schedule hub
            </Link>
            <span className="text-slate-300">|</span>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Schedule</h1>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
            >
              Main schedule
              <span className="text-slate-400">▾</span>
            </button>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              Permissions
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
              disabled
            >
              Requests
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
              disabled
            >
              Job list
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white p-2 text-slate-500"
              disabled
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              View options <span className="text-slate-400">▾</span>
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500"
              aria-label="Filter"
            >
              <Filter className="h-4 w-4" />
            </button>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800">
              Week
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={prevWeekHref}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div className="flex min-w-[160px] items-center justify-center gap-1 text-sm font-semibold text-slate-900">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              {rangeLabel}
            </div>
            <Link
              href={nextWeekHref}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href={todayWeekHref}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Today
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Actions <span className="text-slate-400">▾</span>
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Add <span className="text-slate-400">▾</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              disabled={publishN === 0 || publishPending}
              title={publishN === 0 ? "No draft shifts to publish" : "Publish shifts to employees"}
              onClick={() => {
                if (publishN === 0) return;
                setPublishError(null);
                startPublishTransition(async () => {
                  const r = await publishDraftShiftsForWeek(weekParam);
                  if (!r.ok) {
                    setPublishError(r.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              {publishPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              Publish ({publishN})
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] text-slate-500">
            Scope: <span className="font-medium text-slate-700">{locationLabel}</span>
            {scopeAll ? " · All locations" : ""}
          </p>
          {publishError ? (
            <p className="text-[11px] font-medium text-red-600" role="alert">
              {publishError}
            </p>
          ) : null}
        </div>

        {shifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-600">
            No shifts match this week{search ? " / search" : ""}. Run Supabase migrations through{" "}
            <strong>013</strong> for shift layers, or clear the search box.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* Row search + toggles */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-2">
              <div className="relative min-w-[200px] flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search shifts, jobs, people…"
                  className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800">
                Labor &amp; Sales
              </button>
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800">
                Daily info
              </button>
            </div>

            <div className="min-w-[1100px]">
              <div
                className="grid border-b border-slate-200 bg-slate-50/90"
                style={{ gridTemplateColumns: `200px repeat(7, minmax(110px, 1fr))` }}
              >
                <div className="border-r border-slate-200 p-2" />
                {columns.map((col, di) => {
                  const isToday = sameCalendarDay(col.date, today);
                  return (
                    <div
                      key={di}
                      className={`border-r border-slate-200 p-2 text-center last:border-r-0 ${
                        isToday ? "bg-sky-100/80" : ""
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        {col.labelShort} {col.labelDayNum}
                      </div>
                      <div className="mt-1.5 flex items-center justify-center gap-2 text-[10px] font-medium text-slate-600">
                        <span className="inline-flex items-center gap-0.5" title="Hours">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {formatHoursClock(col.totalHours)}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="inline-flex items-center gap-0.5" title="Shifts">
                          <CalendarDays className="h-3 w-3 text-slate-400" />
                          {col.shiftCount}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="inline-flex items-center gap-0.5" title="Users">
                          <Users className="h-3 w-3 text-slate-400" />
                          {col.uniquePeople}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {sections.map(({ name: section }) => {
                const st = sectionTotals(shifts, section);
                const jobs = jobRowsForSection(shifts, section);
                const inSection = shifts.filter((s) => s.groupName === section);
                const layerKey = inSection.find((s) => s.boardSectionLayerName)?.boardSectionLayerName;
                const metaExtras = [
                  ...new Set(inSection.flatMap((s) => s.extraLayerLabels)),
                ];
                const layerHint = layerKey ? `Layer · ${layerKey}` : null;
                return (
                  <div key={section} className="border-b border-slate-100 last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100/90 px-3 py-2">
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{section}</span>
                        {layerHint ? (
                          <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500">
                            {layerHint}
                          </span>
                        ) : null}
                        {metaExtras.length ? (
                          <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                            {metaExtras.join(" · ")}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs tabular-nums text-slate-600">
                        <span className="font-medium text-slate-800">{formatHoursClock(st.hours)}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        {st.shiftCount} shifts
                        <span className="mx-1 text-slate-300">|</span>
                        {st.people} users
                      </span>
                    </div>
                    {jobs.map((jobRow) => (
                      <div
                        key={`${section}-${jobRow.rowKey}`}
                        className="grid border-b border-slate-100 bg-white"
                        style={{
                          gridTemplateColumns: `200px repeat(7, minmax(110px, 1fr))`,
                          boxShadow: `inset 4px 0 0 0 ${jobRow.colorHex}`,
                        }}
                      >
                        <div className="border-r border-slate-200 px-2 py-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                            {jobRow.label}
                          </span>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            Row color matches shift cards
                          </div>
                        </div>
                        {columns.map((_, di) => {
                          const cell = shiftsForCell(shifts, section, jobRow.rowKey, weekMonday, di);
                          const isToday = sameCalendarDay(columns[di].date, today);
                          return (
                            <div
                              key={di}
                              className={`min-h-[80px] border-r border-slate-100 p-1 last:border-r-0 ${
                                isToday ? "bg-sky-50/50" : ""
                              }`}
                            >
                              <div className="flex flex-col gap-1">
                                {cell.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className="relative w-full rounded-md border border-slate-200/90 bg-white text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    style={{ borderTop: `3px solid ${s.jobColorHex}` }}
                                  >
                                    {s.notifyBadgeCount > 0 ? (
                                      <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white shadow">
                                        {s.notifyBadgeCount}
                                      </span>
                                    ) : null}
                                    <div className="px-2 pb-1.5 pt-2">
                                      <div className="text-[11px] font-semibold text-slate-900">
                                        {formatSpan(s.shift_start, s.shift_end)}
                                      </div>
                                      <div className="truncate text-[11px] text-slate-700">
                                        {s.assignCount === 0 ? "0 users" : s.employeeName}
                                      </div>
                                      {scopeAll ? (
                                        <div className="mt-0.5 truncate text-[9px] text-slate-400">
                                          {locationNamesById.get(s.location_id) ?? "Store"}
                                        </div>
                                      ) : null}
                                      {!s.isPublished ? (
                                        <div className="mt-0.5 text-[9px] font-medium text-amber-700">
                                          Draft
                                        </div>
                                      ) : null}
                                      <div className="mt-1 flex justify-end text-[10px] font-medium tabular-nums text-slate-500">
                                        {s.assignCount}/{s.slotsTotal}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="sticky bottom-0 z-10 rounded-lg border border-slate-200 bg-slate-100/95 px-4 py-2.5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Weekly summary
            </span>
            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-700">
              <span className="tabular-nums">
                <span className="font-semibold text-slate-900">{formatHoursClock(totals.hours)}</span>{" "}
                hours
              </span>
              <span>
                <span className="font-semibold text-slate-900">{totals.shiftCount}</span> shifts
              </span>
              <span>
                <span className="font-semibold text-slate-900">{totals.people}</span> users
              </span>
              <span className="text-slate-400">Labor —</span>
              <span className="text-slate-400">Sales —</span>
              <span className="text-slate-400">Labor % —</span>
            </div>
          </div>
        </div>
    </div>
  );
}
