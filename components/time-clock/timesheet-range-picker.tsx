"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { DayPicker, type DateRange, useDayPicker } from "react-day-picker";
import type { MonthCaptionProps } from "react-day-picker";
import "react-day-picker/style.css";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const RDP_PANEL_VARS: CSSProperties = {
  "--rdp-day-height": "2.25rem",
  "--rdp-day-width": "14.28%",
  "--rdp-day_button-height": "100%",
  "--rdp-day_button-width": "100%",
  "--rdp-day_button-border-radius": "0",
  "--rdp-accent-color": "#ea580c",
  "--rdp-accent-background-color": "rgb(255 237 213 / 0.5)",
  "--rdp-range_middle-background-color": "rgb(255 237 213 / 0.55)",
  "--rdp-range_middle-color": "rgb(15 23 42)",
  "--rdp-outside-opacity": "0.38",
  "--rdp-nav-height": "2.25rem",
  "--rdp-nav_button-height": "1.85rem",
  "--rdp-nav_button-width": "1.85rem",
  "--rdp-weekday-padding": "0.35rem 0.1rem",
} as CSSProperties;

function timesheetNavBounds() {
  const start = new Date();
  start.setFullYear(start.getFullYear() - 25);
  start.setMonth(0, 1);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 15);
  end.setMonth(11, 31);
  return { startMonth: start, endMonth: end };
}

function monthLabel(monthIndex: number): string {
  return new Date(2024, monthIndex, 1).toLocaleDateString(undefined, { month: "long" });
}

function clampMonthToBounds(date: Date, start: Date, end: Date): Date {
  const t = new Date(date.getFullYear(), date.getMonth(), 1);
  const s = new Date(start.getFullYear(), start.getMonth(), 1);
  const e = new Date(end.getFullYear(), end.getMonth(), 1);
  if (t < s) return s;
  if (t > e) return e;
  return t;
}

/**
 * Single-line "April 2026" with scrollable month/year menus; prev/next month on the sides.
 * Replaces default caption (and we use `hideNavigation` so the duplicate top Nav is gone).
 */
function TimesheetMonthCaption(props: MonthCaptionProps) {
  /** Strip DayPicker-only props so they are not forwarded to the DOM `<div>`. */
  const {
    calendarMonth,
    displayIndex: _displayIndex,
    className,
    style,
    children: _children,
    ...divProps
  } = props;
  const { goToMonth, previousMonth, nextMonth, classNames: cn, dayPickerProps } = useDayPicker();
  const startMonth = dayPickerProps.startMonth ?? new Date(1900, 0, 1);
  const endMonth = dayPickerProps.endMonth ?? new Date(2100, 11, 31);

  const d = calendarMonth.date;
  const year = d.getFullYear();
  const monthIndex = d.getMonth();

  const [openMenu, setOpenMenu] = useState<null | "month" | "year">(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const monthListRef = useRef<HTMLDivElement>(null);
  const yearListRef = useRef<HTMLDivElement>(null);

  const yearOptions = useMemo(() => {
    const from = startMonth.getFullYear();
    const to = endMonth.getFullYear();
    const list: number[] = [];
    for (let y = from; y <= to; y++) list.push(y);
    return list;
  }, [startMonth, endMonth]);

  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (captionRef.current && !captionRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  useEffect(() => {
    if (openMenu !== "month" || !monthListRef.current) return;
    const el = monthListRef.current.querySelector<HTMLButtonElement>(`[data-month="${monthIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [openMenu, monthIndex]);

  useEffect(() => {
    if (openMenu !== "year" || !yearListRef.current) return;
    const el = yearListRef.current.querySelector<HTMLButtonElement>(`[data-year="${year}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [openMenu, year]);

  const pickMonth = useCallback(
    (m: number) => {
      const next = clampMonthToBounds(new Date(year, m, 1), startMonth, endMonth);
      goToMonth(next);
      setOpenMenu(null);
    },
    [goToMonth, year, startMonth, endMonth],
  );

  const pickYear = useCallback(
    (y: number) => {
      const next = clampMonthToBounds(new Date(y, monthIndex, 1), startMonth, endMonth);
      goToMonth(next);
      setOpenMenu(null);
    },
    [goToMonth, monthIndex, startMonth, endMonth],
  );

  const bp = cn.button_previous ?? "";
  const bn = cn.button_next ?? "";

  return (
    <div
      ref={captionRef}
      className={`relative mb-2 flex w-full flex-col items-stretch ${className ?? ""}`}
      style={style}
      {...divProps}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          disabled={!previousMonth}
          aria-label="Previous month"
          onClick={() => previousMonth && goToMonth(previousMonth)}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 bg-white text-slate-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 ${bp}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        <div className="relative flex min-w-0 flex-1 items-center justify-center gap-1 text-sm font-semibold text-slate-900">
          <button
            type="button"
            aria-expanded={openMenu === "month"}
            aria-haspopup="listbox"
            onClick={() => setOpenMenu((o) => (o === "month" ? null : "month"))}
            className="rounded-md px-2 py-1 text-slate-900 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"
          >
            {monthLabel(monthIndex)}
          </button>
          <span className="text-slate-400" aria-hidden>
            {" "}
          </span>
          <button
            type="button"
            aria-expanded={openMenu === "year"}
            aria-haspopup="listbox"
            onClick={() => setOpenMenu((o) => (o === "year" ? null : "year"))}
            className="rounded-md px-2 py-1 tabular-nums text-slate-900 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"
          >
            {year}
          </button>
        </div>

        <button
          type="button"
          disabled={!nextMonth}
          aria-label="Next month"
          onClick={() => nextMonth && goToMonth(nextMonth)}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 bg-white text-slate-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 ${bn}`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {openMenu === "month" ? (
        <div
          ref={monthListRef}
          role="listbox"
          aria-label="Choose month"
          className="absolute left-1/2 top-full z-50 mt-1 max-h-52 w-[min(100%,12rem)] -translate-x-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {Array.from({ length: 12 }, (_, m) => (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={m === monthIndex}
              data-month={m}
              onClick={() => pickMonth(m)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                m === monthIndex
                  ? "bg-orange-50 font-semibold text-orange-900"
                  : "text-slate-800 hover:bg-slate-50"
              }`}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "year" ? (
        <div
          ref={yearListRef}
          role="listbox"
          aria-label="Choose year"
          className="absolute left-1/2 top-full z-50 mt-1 max-h-52 w-[min(100%,7rem)] -translate-x-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {yearOptions.map((yOpt) => (
            <button
              key={yOpt}
              type="button"
              role="option"
              aria-selected={yOpt === year}
              data-year={yOpt}
              onClick={() => pickYear(yOpt)}
              className={`flex w-full items-center justify-center px-2 py-2 text-sm tabular-nums ${
                yOpt === year
                  ? "bg-orange-50 font-semibold text-orange-900"
                  : "text-slate-800 hover:bg-slate-50"
              }`}
            >
              {yOpt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  rangeLabel: string;
  periodStart: Date;
  periodEndInclusive: Date;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hasCustomRange: boolean;
  onApplyCustomRange: (fromYmd: string, toYmd: string) => void;
  onClearCustomRange: () => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onJumpToToday: () => void;
};

export function TimesheetRangePicker({
  rangeLabel,
  periodStart,
  periodEndInclusive,
  weekStartsOn,
  hasCustomRange,
  onApplyCustomRange,
  onClearCustomRange,
  onNavigatePrev,
  onNavigateNext,
  onJumpToToday,
}: Props) {
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: periodStart,
    to: periodEndInclusive,
  }));
  const [calendarMonth, setCalendarMonth] = useState(() =>
    new Date(periodStart.getFullYear(), periodStart.getMonth(), 1),
  );

  const { startMonth, endMonth } = useMemo(() => timesheetNavBounds(), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCalendarMonth(new Date(periodStart.getFullYear(), periodStart.getMonth(), 1));
  }, [open, periodStart]);

  function apply() {
    if (!draft?.from || !draft.to) return;
    const a = draft.from <= draft.to ? draft.from : draft.to;
    const b = draft.from <= draft.to ? draft.to : draft.from;
    onApplyCustomRange(toYmd(a), toYmd(b));
    setOpen(false);
  }

  function closeAndNavigate(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div
      className="relative inline-flex min-w-0 flex-wrap items-center gap-1 rounded border border-slate-200 bg-white pl-1 pr-1 shadow-sm"
      ref={wrapRef}
    >
      <button
        type="button"
        onClick={() => closeAndNavigate(onNavigatePrev)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
        aria-label="Previous period"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        id={`${panelId}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setDraft({ from: periodStart, to: periodEndInclusive });
          setCalendarMonth(new Date(periodStart.getFullYear(), periodStart.getMonth(), 1));
          setOpen((o) => !o);
        }}
        className="min-w-[8.5rem] cursor-pointer rounded-md px-2 py-2 text-center text-sm font-semibold tabular-nums text-slate-900 transition-colors hover:bg-slate-100 active:bg-slate-200 sm:min-w-[10rem]"
        title="Open calendar to pick a custom date range. Use ← → for previous/next period."
      >
        {rangeLabel}
      </button>
      <button
        type="button"
        onClick={() => closeAndNavigate(onNavigateNext)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
        aria-label="Next period"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose timesheet date range"
          className="absolute right-0 top-full z-50 mt-1.5 w-[min(calc(100vw-1rem),21rem)] rounded-xl border border-slate-200/90 bg-white p-3 shadow-lg shadow-slate-900/[0.06]"
          style={RDP_PANEL_VARS}
        >
          <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                Range
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold leading-snug tracking-tight text-slate-900">
                {rangeLabel}
              </p>
              {hasCustomRange ? (
                <p className="mt-1.5 text-[11px] leading-snug text-orange-800/90">
                  Custom range — overrides Week / Month until Preset or Today.
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] leading-snug text-sky-700/85">
                  Tap start, then end, then Apply. Use month or year to jump.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onJumpToToday();
                  setOpen(false);
                }}
                className="rounded-md border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                title="Show the period that contains today"
              >
                Today
              </button>
              {hasCustomRange ? (
                <button
                  type="button"
                  onClick={() => {
                    onClearCustomRange();
                    setOpen(false);
                  }}
                  className="rounded-md border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Preset
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg bg-slate-50/60 px-1 pb-0.5 pt-1">
            <DayPicker
              mode="range"
              weekStartsOn={weekStartsOn}
              numberOfMonths={1}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              startMonth={startMonth}
              endMonth={endMonth}
              hideNavigation
              components={{ MonthCaption: TimesheetMonthCaption }}
              selected={draft}
              onSelect={setDraft}
              showOutsideDays
              formatters={{
                formatWeekdayName: (wd) =>
                  wd.toLocaleDateString(undefined, { weekday: "short" }),
              }}
              classNames={{
                root: "mx-auto w-full max-w-none text-slate-800",
                months: "w-full",
                month: "w-full space-y-2",
                month_grid: "w-full table-fixed border-collapse [border-spacing:0]",
                weekdays: "mb-0 table-row border-collapse",
                weekday:
                  "box-border w-[14.28%] min-w-0 p-0 pb-1.5 pt-0 text-center text-[10px] font-medium capitalize tracking-wide text-slate-400",
                weeks: "w-full",
                week: "table-row border-collapse",
                day: "relative box-border !w-[14.28%] min-w-0 p-0 text-center align-middle",
                day_button:
                  "flex !h-full min-h-[2.25rem] !w-full max-w-none items-center justify-center rounded-none border-0 text-[13px] font-medium tabular-nums text-slate-700 transition-colors hover:bg-slate-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 focus-visible:ring-inset",
                range_start:
                  "bg-orange-600 p-0 [&>button]:h-full [&>button]:min-h-[2.25rem] [&>button]:w-full [&>button]:rounded-none [&>button]:!bg-orange-600 [&>button]:!text-white [&>button]:shadow-none [&>button]:hover:!bg-orange-600 [&>button]:!ring-0",
                range_end:
                  "bg-orange-600 p-0 [&>button]:h-full [&>button]:min-h-[2.25rem] [&>button]:w-full [&>button]:rounded-none [&>button]:!bg-orange-600 [&>button]:!text-white [&>button]:shadow-none [&>button]:hover:!bg-orange-600 [&>button]:!ring-0",
                range_middle:
                  "bg-orange-100 p-0 !text-[13px] text-slate-900 [&>button]:h-full [&>button]:min-h-[2.25rem] [&>button]:w-full [&>button]:rounded-none [&>button]:!bg-orange-100 [&>button]:!text-slate-900 [&>button]:!text-[13px] [&>button]:font-semibold [&>button]:shadow-none [&>button]:hover:!bg-orange-100 [&>button]:hover:!text-slate-900 [&>button]:!ring-0 [&>button]:!ring-offset-0",
                today:
                  "font-semibold text-orange-800 [&>button]:ring-2 [&>button]:ring-inset [&>button]:ring-orange-300/90",
                outside: "text-slate-300 [&>button]:font-normal [&>button]:text-slate-300",
                disabled: "opacity-35",
              }}
            />
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft?.from || !draft?.to}
              onClick={() => void apply()}
              className="rounded-md bg-orange-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
