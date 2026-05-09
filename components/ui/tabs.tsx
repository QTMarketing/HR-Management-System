"use client";

import { useCallback, useId, useRef } from "react";

/**
 * Minimal, accessible Tabs primitive (no Radix dependency, parity with our
 * Sheet component). Renders as:
 *
 *   <div role="tablist">
 *     <button role="tab" aria-selected ... />
 *
 * Caller controls `value` / `onValueChange` and renders the active panel
 * separately. Keyboard support: ArrowLeft / ArrowRight cycles between tabs,
 * Home / End jump to first / last.
 */

export type TabItem = {
  value: string;
  label: string;
  /** Optional count chip rendered to the right of the label. */
  count?: number;
  /** Optional rendered next to the label (e.g. a pulsing dot). */
  decoration?: React.ReactNode;
};

type TabsProps = {
  tabs: TabItem[];
  value: string;
  onValueChange: (next: string) => void;
  /** aria-controls id of the panel rendered by the caller. */
  panelId?: string;
  /** Optional aria-label for the tablist (e.g. "Attendance views"). */
  ariaLabel?: string;
};

export function Tabs({
  tabs,
  value,
  onValueChange,
  panelId,
  ariaLabel,
}: TabsProps) {
  const baseId = useId();
  const tablistRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight" &&
        e.key !== "Home" &&
        e.key !== "End"
      ) {
        return;
      }
      e.preventDefault();
      const idx = tabs.findIndex((t) => t.value === value);
      if (idx === -1) return;
      let next = idx;
      if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      const nextValue = tabs[next]?.value;
      if (!nextValue) return;
      onValueChange(nextValue);
      // Move focus to the freshly-selected tab so screen readers announce it.
      const el = tablistRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab="${nextValue}"]`,
      );
      el?.focus();
    },
    [tabs, value, onValueChange],
  );

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
    >
      {tabs.map((t) => {
        const selected = t.value === value;
        const tabId = `${baseId}-${t.value}`;
        return (
          <button
            key={t.value}
            id={tabId}
            data-tab={t.value}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(t.value)}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 ${
              selected
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="truncate">{t.label}</span>
            {t.decoration ? (
              <span className="shrink-0" aria-hidden>
                {t.decoration}
              </span>
            ) : null}
            {typeof t.count === "number" ? (
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                  selected
                    ? "bg-slate-900 text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
