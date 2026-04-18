"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const RDP_PANEL_VARS: CSSProperties = {
  "--rdp-day-height": "3rem",
  "--rdp-day-width": "3rem",
  "--rdp-day_button-height": "2.75rem",
  "--rdp-day_button-width": "2.75rem",
  "--rdp-day_button-border-radius": "9999px",
  "--rdp-accent-color": "#ea580c",
  "--rdp-accent-background-color": "rgb(255 237 213 / 0.55)",
  "--rdp-range_middle-background-color": "rgb(255 237 213 / 0.42)",
  "--rdp-range_middle-color": "rgb(30 41 59)",
  "--rdp-outside-opacity": "0.38",
  "--rdp-nav-height": "2.75rem",
  "--rdp-nav_button-height": "2.25rem",
  "--rdp-nav_button-width": "2.25rem",
  "--rdp-weekday-padding": "0.65rem 0.15rem",
} as CSSProperties;

type Props = {
  /** Shown on the center control (e.g. 30/03 – 05/04). */
  rangeLabel: string;
  /** First and last calendar day of the visible grid (inclusive end). */
  periodStart: Date;
  periodEndInclusive: Date;
  /** When set, user chose a custom range via URL. */
  hasCustomRange: boolean;
  /** Apply custom inclusive range and sync URL. */
  onApplyCustomRange: (fromYmd: string, toYmd: string) => void;
  /** Remove range_from/range_to; use period rules again. */
  onClearCustomRange: () => void;
  /** Previous period (week/month/custom shift). */
  onNavigatePrev: () => void;
  /** Next period. */
  onNavigateNext: () => void;
  /** Jump to the preset period that contains today (clears custom range). */
  onJumpToToday: () => void;
};

export function TimesheetRangePicker({
  rangeLabel,
  periodStart,
  periodEndInclusive,
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
          className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-1.25rem),22.5rem)] rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl shadow-slate-900/[0.07]"
          style={RDP_PANEL_VARS}
        >
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Range
              </p>
              <p className="mt-1 truncate text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
                {rangeLabel}
              </p>
              {hasCustomRange ? (
                <p className="mt-2 text-xs leading-relaxed text-orange-800/90">
                  Custom range — overrides Week / Month until you use Preset or Today.
                </p>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-sky-700/90">
                  Tap a start date, then an end date, then Apply.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  onJumpToToday();
                  setOpen(false);
                }}
                className="rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
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
                  className="rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Preset
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl bg-gradient-to-b from-slate-50/80 to-white px-2 pb-1 pt-2">
            <DayPicker
              mode="range"
              weekStartsOn={1}
              numberOfMonths={1}
              defaultMonth={periodStart}
              selected={draft}
              onSelect={setDraft}
              showOutsideDays
              formatters={{
                formatWeekdayName: (d) =>
                  d.toLocaleDateString(undefined, { weekday: "short" }),
              }}
              classNames={{
                root: "mx-auto w-full max-w-none text-slate-800",
                months: "w-full",
                month: "w-full space-y-4",
                month_caption:
                  "relative mb-1 flex h-11 items-center justify-center px-10 sm:px-12",
                caption_label:
                  "text-[15px] font-semibold tracking-tight text-slate-900",
                nav: "absolute inset-x-2 top-1/2 flex -translate-y-1/2 items-center justify-between",
                button_previous:
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-slate-100/95 text-slate-600 shadow-none transition hover:bg-slate-200/90 [&_svg]:h-4 [&_svg]:w-4",
                button_next:
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-slate-100/95 text-slate-600 shadow-none transition hover:bg-slate-200/90 [&_svg]:h-4 [&_svg]:w-4",
                month_grid: "mx-auto w-full border-separate [border-spacing:0.2rem_0.35rem]",
                weekdays: "mb-1 flex w-full px-0.5",
                weekday:
                  "flex-1 select-none text-center text-[11px] font-medium capitalize tracking-wide text-slate-400",
                weeks: "w-full",
                week: "mt-0 flex w-full",
                day: "p-0 text-center align-middle",
                day_button:
                  "mx-auto flex size-[2.75rem] max-h-[2.75rem] max-w-[2.75rem] items-center justify-center rounded-full text-[0.9375rem] font-medium text-slate-700 transition-colors hover:bg-slate-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/45 focus-visible:ring-offset-1",
                selected:
                  "!text-white [&>button]:!bg-orange-600 [&>button]:!text-white [&>button]:shadow-sm [&>button]:hover:!bg-orange-600",
                range_start:
                  "rounded-none rounded-l-full bg-orange-100/50 [&>button]:relative [&>button]:z-[1] [&>button]:!bg-orange-600 [&>button]:!text-white [&>button]:shadow-md [&>button]:hover:!bg-orange-600",
                range_end:
                  "rounded-none rounded-r-full bg-orange-100/50 [&>button]:relative [&>button]:z-[1] [&>button]:!bg-orange-600 [&>button]:!text-white [&>button]:shadow-md [&>button]:hover:!bg-orange-600",
                range_middle:
                  "rounded-none bg-orange-100/35 [&>button]:rounded-none [&>button]:!bg-transparent [&>button]:font-medium [&>button]:!text-slate-800 [&>button]:shadow-none [&>button]:hover:bg-orange-100/55",
                today:
                  "font-semibold text-orange-700 [&>button]:ring-2 [&>button]:ring-orange-200/90 [&>button]:ring-offset-1",
                outside: "text-slate-300 [&>button]:font-normal [&>button]:text-slate-300",
                disabled: "opacity-35",
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft?.from || !draft?.to}
              onClick={() => void apply()}
              className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
