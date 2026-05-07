"use client";

import dynamic from "next/dynamic";
import { CalendarDays, ChevronDown } from "lucide-react";
import { formatWeekQueryParam, mondayOfWeekContaining } from "@/lib/schedule/week";
import "react-day-picker/style.css";
import type { RefObject } from "react";

const DayPickerLazy = dynamic(
  () => import("react-day-picker").then((mod) => mod.DayPicker),
  { ssr: false, loading: () => null },
);

type RouterLike = { push: (href: string) => void };

export type ScheduleBoardCalendarPopoverProps = {
  calendarRef: RefObject<HTMLDivElement | null>;
  rangeLabel: string;
  calendarOpen: boolean;
  setCalendarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedDate: Date;
  calendarMonth: Date;
  setCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  viewRange: "day" | "week" | "month";
  router: RouterLike;
  today: Date;
};

export function ScheduleBoardCalendarPopover({
  calendarRef,
  rangeLabel,
  calendarOpen,
  setCalendarOpen,
  selectedDate,
  calendarMonth,
  setCalendarMonth,
  viewRange,
  router,
  today,
}: ScheduleBoardCalendarPopoverProps) {
  return (
    <div className="relative" ref={calendarRef}>
      <button
        type="button"
        className="flex min-w-[160px] items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        onClick={() => {
          setCalendarOpen((v) => {
            const next = !v;
            if (next) {
              setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
            }
            return next;
          });
        }}
        aria-haspopup="dialog"
        aria-expanded={calendarOpen}
      >
        <CalendarDays className="h-4 w-4 text-slate-500" />
        {rangeLabel}
      </button>
      {calendarOpen ? (
        <div className="absolute left-1/2 top-[calc(100%+10px)] z-30 w-[288px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Calendar
              </div>
              <div className="text-[13px] font-semibold leading-4 text-slate-900">Jump to date</div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const d = new Date();
                  const params = new URLSearchParams(window.location.search);
                  params.set("view", viewRange);
                  if (viewRange === "week") {
                    const monday = mondayOfWeekContaining(d);
                    params.set("week", formatWeekQueryParam(monday));
                    params.set(
                      "date",
                      `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`,
                    );
                  } else {
                    params.set(
                      "date",
                      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                    );
                    params.delete("week");
                  }
                  router.push(`/schedule/board?${params.toString()}`);
                  setCalendarOpen(false);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const d = new Date();
                  const monday = mondayOfWeekContaining(d);
                  const params = new URLSearchParams(window.location.search);
                  params.set("view", "week");
                  params.set("week", formatWeekQueryParam(monday));
                  params.set(
                    "date",
                    `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`,
                  );
                  router.push(`/schedule/board?${params.toString()}`);
                  setCalendarOpen(false);
                }}
              >
                This week
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const d = new Date(Date.now() + 7 * 86400000);
                  const monday = mondayOfWeekContaining(d);
                  const params = new URLSearchParams(window.location.search);
                  params.set("view", "week");
                  params.set("week", formatWeekQueryParam(monday));
                  params.set(
                    "date",
                    `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`,
                  );
                  router.push(`/schedule/board?${params.toString()}`);
                  setCalendarOpen(false);
                }}
              >
                Next week
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="sr-only">Month</span>
              <div className="relative">
                <select
                  className="h-7 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-2 pr-7 text-[11px] font-semibold text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={calendarMonth.getMonth()}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    if (Number.isNaN(m)) return;
                    setCalendarMonth(new Date(calendarMonth.getFullYear(), m, 1));
                  }}
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const label = new Date(2000, i, 1).toLocaleString(undefined, {
                      month: "long",
                    });
                    return (
                      <option key={i} value={i}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>
            </label>
            <label className="block">
              <span className="sr-only">Year</span>
              <div className="relative">
                <select
                  className="h-7 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-2 pr-7 text-[11px] font-semibold text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={calendarMonth.getFullYear()}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    if (Number.isNaN(y)) return;
                    setCalendarMonth(new Date(y, calendarMonth.getMonth(), 1));
                  }}
                >
                  {Array.from({ length: 9 }, (_, i) => {
                    const y = today.getFullYear() - 4 + i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>
            </label>
          </div>

          <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-1.5">
            <DayPickerLazy
              mode="single"
              selected={selectedDate}
              showOutsideDays
              month={calendarMonth}
              onMonthChange={(d) => {
                setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              }}
              className="w-full"
              classNames={{
                months: "w-full",
                month: "w-full",
                month_caption: "flex items-center justify-between px-1.5 py-1",
                caption_label: "text-[12px] font-semibold text-slate-900",
                nav: "flex items-center gap-1",
                button_previous:
                  "h-6 w-6 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                button_next:
                  "h-6 w-6 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                month_grid: "w-full border-collapse",
                weekdays: "grid grid-cols-7 px-1",
                weekday:
                  "text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-center py-0.5",
                week: "grid grid-cols-7 px-1",
                day: "py-0 text-center",
                day_button:
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                today: "ring-1 ring-blue-200 bg-blue-50 text-blue-900",
                selected: "bg-blue-600 text-white hover:bg-blue-600 hover:text-white",
                outside: "text-slate-400 opacity-60",
                disabled: "text-slate-400 opacity-40",
              }}
              onSelect={(d) => {
                if (!d) return;
                const params = new URLSearchParams(window.location.search);
                params.set("view", viewRange);
                if (viewRange === "week") {
                  const monday = mondayOfWeekContaining(d);
                  params.set("week", formatWeekQueryParam(monday));
                  params.set(
                    "date",
                    `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`,
                  );
                } else {
                  params.set(
                    "date",
                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                  );
                  params.delete("week");
                }
                router.push(`/schedule/board?${params.toString()}`);
                setCalendarOpen(false);
              }}
            />
          </div>

          <p className="mt-1.5 text-[10px] text-slate-500">Tip: use month/year to jump.</p>
        </div>
      ) : null}
    </div>
  );
}
