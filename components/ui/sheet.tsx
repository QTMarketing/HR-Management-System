"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  side?: "right" | "left";
};

/**
 * Slide-over panel (Shadcn-style Sheet) without Radix — keeps bundle small.
 * Renders via portal to `document.body` so stacking context never clips it.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "right",
}: SheetProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  /** Two-phase open so the slide-in transition runs after mount. */
  const [entered, setEntered] = useState(false);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onKeyDown]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [open]);

  if (typeof document === "undefined" || !open) return null;

  const offX = side === "right" ? "translate-x-full" : "-translate-x-full";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex" role="presentation">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative ml-auto flex h-full w-full max-w-md flex-col border-slate-200 bg-white shadow-2xl outline-none transition-transform duration-300 ease-out sm:max-w-lg ${
          side === "right" ? "border-l" : "border-r mr-auto"
        } ${entered ? "translate-x-0" : offX}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
