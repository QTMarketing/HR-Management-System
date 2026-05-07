"use client";

import { useEffect, useRef } from "react";
import { MinusCircle, MoreHorizontal, Plus, Sun } from "lucide-react";

export type CellHoverActionsProps = {
  menuKey: string;
  openMenuKey: string | null;
  setOpenMenuKey: (k: string | null) => void;
  onQuickAdd: () => void;
  onTimeOff: () => void;
  onUnavailability: () => void;
  unavailabilityLabel?: string;
};

export function ScheduleCellHoverActions({
  menuKey,
  openMenuKey,
  setOpenMenuKey,
  onQuickAdd,
  onTimeOff,
  onUnavailability,
  unavailabilityLabel = "Add unavailability",
}: CellHoverActionsProps) {
  const open = openMenuKey === menuKey;
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenMenuKey(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuKey(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpenMenuKey]);

  return (
    <div
      ref={rootRef}
      data-schedule-cell-menu-root
      className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100"
    >
      <div className="flex items-center gap-0.5 rounded-full border border-slate-200/90 bg-white/95 p-0.5 shadow-md ring-1 ring-slate-900/5 backdrop-blur-[2px]">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700"
          title="Add shift"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuKey(null);
            onQuickAdd();
          }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
        <div className="relative">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title="More options"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuKey(open ? null : menuKey);
            }}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          {open ? (
            <div
              role="menu"
              className="absolute left-1/2 top-[calc(100%+8px)] z-40 min-w-[216px] -translate-x-1/2 rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-slate-800 hover:bg-slate-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuKey(null);
                  onTimeOff();
                }}
              >
                <Sun className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                Add time off
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-slate-800 hover:bg-slate-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuKey(null);
                  onUnavailability();
                }}
              >
                <MinusCircle className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                {unavailabilityLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
