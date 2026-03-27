import Link from "next/link";
import {
  buildDayColumns,
  type ShiftForBoard,
  rolesInSection,
  sectionTotals,
  shiftsForCell,
  uniqueSectionTitles,
  weekTotals,
} from "@/lib/schedule/board-model";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";

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

function roleAccent(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("manager")) return "border-l-rose-500 bg-rose-50/30";
  if (r.includes("lead")) return "border-l-violet-500 bg-violet-50/30";
  if (r.includes("employee")) return "border-l-emerald-500 bg-emerald-50/30";
  return "border-l-slate-400 bg-slate-50/40";
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
  rangeLabel: string;
  prevWeekHref: string;
  nextWeekHref: string;
  todayWeekHref: string;
  locationLabel: string;
  scopeAll: boolean;
  locationNamesById: Map<string, string>;
  shifts: ShiftForBoard[];
};

export function ScheduleWeekBoard({
  weekMonday,
  rangeLabel,
  prevWeekHref,
  nextWeekHref,
  todayWeekHref,
  locationLabel,
  scopeAll,
  locationNamesById,
  shifts,
}: Props) {
  const { columns } = buildDayColumns(weekMonday, shifts);
  const sections = uniqueSectionTitles(shifts);
  const totals = weekTotals(shifts);
  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/schedule"
            className="text-sm font-medium text-orange-700 hover:text-orange-900"
          >
            ← Schedule hub
          </Link>
          <span className="text-slate-300">|</span>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Schedule</h1>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
            {locationLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500"
            disabled
            title="Coming later"
          >
            Requests
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500"
            disabled
            title="Coming later"
          >
            Job list
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500"
            disabled
            title="Coming later"
          >
            Settings
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
            disabled
          >
            View options
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-500"
            disabled
            aria-label="Filter"
          >
            <Filter className="h-4 w-4" />
          </button>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
            Week
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={prevWeekHref}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[140px] text-center text-sm font-semibold text-slate-800">
            {rangeLabel}
          </span>
          <Link
            href={nextWeekHref}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href={todayWeekHref}
            className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-950 hover:bg-orange-100"
          >
            Today
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
            disabled
          >
            Actions
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
            disabled
          >
            Add
          </button>
          <button
            type="button"
            className={`${PRIMARY_ORANGE_CTA} px-4 py-1.5 text-xs disabled:opacity-50`}
            disabled
            title="Publish workflow — when draft shifts exist in the database."
          >
            Publish (0)
          </button>
        </div>
      </div>

      {shifts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-600">
          No shifts in this week for the current scope. Seed data is created by migration 006, or add
          shifts in Supabase.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[1100px]">
            <div className="grid border-b border-slate-200 bg-slate-50/90" style={{ gridTemplateColumns: `160px repeat(7, minmax(120px, 1fr))` }}>
              <div className="border-r border-slate-200 p-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span className="block py-2">Labor &amp; roles</span>
              </div>
              {columns.map((col, di) => {
                const isToday = sameCalendarDay(col.date, today);
                return (
                  <div
                    key={di}
                    className={`border-r border-slate-200 p-2 text-center last:border-r-0 ${
                      isToday ? "bg-orange-50/90" : ""
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-800">
                      {col.labelShort} {col.labelDayNum}
                    </div>
                    <div className="mt-1 flex flex-wrap justify-center gap-1 text-[10px] font-medium text-slate-500">
                      <span title="Hours">{col.totalHours}h</span>
                      <span className="text-slate-300">·</span>
                      <span title="Shifts">{col.shiftCount} shifts</span>
                      <span className="text-slate-300">·</span>
                      <span title="People">{col.uniquePeople} people</span>
                    </div>
                    <div className="mx-auto mt-1 h-1 max-w-[80%] rounded-full bg-gradient-to-r from-orange-200 via-slate-200 to-slate-200" />
                  </div>
                );
              })}
            </div>

            {sections.map((section) => {
              const st = sectionTotals(shifts, section);
              const roles = rolesInSection(shifts, section);
              return (
                <div key={section} className="border-b border-slate-100 last:border-b-0">
                  <div className="flex items-center justify-between bg-slate-100/80 px-3 py-2">
                    <span className="text-sm font-semibold text-slate-800">{section}</span>
                    <span className="text-xs text-slate-500">
                      {st.hours}h · {st.shiftCount} shifts · {st.people} people
                    </span>
                  </div>
                  {roles.map((role) => (
                    <div
                      key={`${section}-${role}`}
                      className={`grid border-b border-slate-100 ${roleAccent(role)} border-l-4`}
                      style={{ gridTemplateColumns: `160px repeat(7, minmax(120px, 1fr))` }}
                    >
                      <div className="border-r border-slate-200/80 px-2 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {role}
                        </span>
                      </div>
                      {columns.map((_, di) => {
                        const cell = shiftsForCell(shifts, section, role, weekMonday, di);
                        const isToday = sameCalendarDay(columns[di].date, today);
                        return (
                          <div
                            key={di}
                            className={`min-h-[72px] border-r border-slate-100 p-1.5 last:border-r-0 ${
                              isToday ? "bg-orange-50/50" : ""
                            }`}
                          >
                            <div className="flex flex-col gap-1">
                              {cell.map((s) => (
                                <div
                                  key={s.id}
                                  className="rounded-md border border-slate-200/80 bg-white px-2 py-1.5 text-[11px] shadow-sm"
                                >
                                  <div className="font-medium text-slate-900">
                                    {formatSpan(s.shift_start, s.shift_end)}
                                  </div>
                                  <div className="truncate text-slate-600">{s.employeeName}</div>
                                  {scopeAll ? (
                                    <div className="mt-0.5 truncate text-[10px] text-slate-400">
                                      {locationNamesById.get(s.location_id) ?? "Store"}
                                    </div>
                                  ) : null}
                                </div>
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

      <div className="sticky bottom-0 z-10 mt-2 rounded-xl border border-slate-200 bg-slate-50/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Weekly summary
          </span>
          <div className="flex flex-wrap gap-6 text-sm text-slate-700">
            <span>
              <strong className="text-slate-900">{totals.hours}h</strong> hours
            </span>
            <span>
              <strong className="text-slate-900">{totals.shiftCount}</strong> shifts
            </span>
            <span>
              <strong className="text-slate-900">{totals.people}</strong> people
            </span>
            <span className="text-slate-400">Labor / Sales —</span>
          </div>
        </div>
      </div>
    </div>
  );
}
