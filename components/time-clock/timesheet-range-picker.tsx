"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { CalendarRange } from "lucide-react";
import "react-day-picker/style.css";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Props = {
  /** Shown on the trigger button (e.g. 30/03 – 05/04). */
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
};

export function TimesheetRangePicker({
  rangeLabel,
  periodStart,
  periodEndInclusive,
  hasCustomRange,
  onApplyCustomRange,
  onClearCustomRange,
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

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setDraft({ from: periodStart, to: periodEndInclusive });
          setOpen((o) => !o);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 px-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-orange-200/90 hover:from-orange-50/80 hover:to-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-400/40"
        title="Choose a date range for this timesheet"
      >
        <CalendarRange className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
        <span className="max-w-[10rem] truncate tabular-nums sm:max-w-none">Dates</span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-full z-50 mt-1.5 w-[min(calc(100vw-1rem),18.5rem)] rounded-xl border border-slate-200 bg-white p-2.5 shadow-lg shadow-slate-900/10"
          style={
            {
              "--rdp-accent-color": "rgba(234, 88, 12, 0.88)",
              "--rdp-accent-background-color": "rgba(255, 237, 213, 0.95)",
              "--rdp-outline": "2px solid #ea580c",
              "--rdp-cell-size": "2rem",
            } as CSSProperties
          }
        >
          <div className="mb-2 flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Range
              </p>
              <p className="truncate text-xs font-semibold text-slate-900">{rangeLabel}</p>
              {hasCustomRange ? (
                <p className="mt-0.5 text-[10px] leading-snug text-orange-800">
                  Custom (overrides Week/Month).
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                  Tap start → end, then Apply.
                </p>
              )}
            </div>
            {hasCustomRange ? (
              <button
                type="button"
                onClick={() => {
                  onClearCustomRange();
                  setOpen(false);
                }}
                className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-white"
              >
                Preset
              </button>
            ) : null}
          </div>

          <div className="rounded-lg bg-slate-50/90 px-0.5 py-1">
            <DayPicker
              mode="range"
              weekStartsOn={1}
              numberOfMonths={1}
              defaultMonth={periodStart}
              selected={draft}
              onSelect={setDraft}
              classNames={{
                root: "mx-auto w-full max-w-[16.5rem] text-slate-800",
                months: "w-full",
                month: "w-full space-y-1.5",
                month_caption: "relative mb-1 flex h-7 items-center justify-center px-6",
                caption_label: "text-xs font-semibold text-slate-800",
                nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between",
                button_previous:
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 [&_svg]:h-3.5 [&_svg]:w-3.5",
                button_next:
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 [&_svg]:h-3.5 [&_svg]:w-3.5",
                weekdays: "mb-0.5 flex",
                weekday: "w-8 flex-1 text-center text-[9px] font-semibold uppercase text-slate-400",
                week: "mt-0 flex w-full",
                day: "p-0 text-center",
                day_button:
                  "mx-auto flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium text-slate-800 hover:bg-orange-100/80",
                selected:
                  "!bg-orange-600/88 text-white [&>button]:bg-orange-600/88 [&>button]:text-white hover:[&>button]:bg-orange-600/88",
                range_start:
                  "rounded-r-none bg-orange-100/90 [&>button]:bg-orange-600/88 [&>button]:text-white",
                range_end:
                  "rounded-l-none bg-orange-100/90 [&>button]:bg-orange-600/88 [&>button]:text-white",
                range_middle:
                  "rounded-none bg-orange-100/75 text-orange-950 [&>button]:bg-transparent [&>button]:text-orange-900/90",
                today: "ring-1 ring-orange-300/70",
                outside: "text-slate-300 opacity-60",
                disabled: "opacity-30",
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft?.from || !draft?.to}
              onClick={() => void apply()}
              className="rounded-md bg-orange-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
