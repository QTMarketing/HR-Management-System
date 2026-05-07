"use client";

/**
 * Tailwind-only AlertDialog used to gate destructive ledger actions like
 * "Run rollover" and "Run cash-out". Keeps focus on Cancel by default,
 * supports ESC + backdrop click to dismiss, and disables both during the
 * `pending` server-action transition so users can't double-fire.
 *
 * No portal: the existing modal pattern in the codebase (see
 * `components/users/add-users-bulk-modal.tsx`) renders inline at z-50, which
 * is enough for our app shell.
 */

import { useEffect, useId, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

export type ConfirmDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  /** Body copy. Pass JSX if you need bolded year/month tokens. */
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When the underlying mutation is running, both buttons disable + Confirm shows a spinner. */
  pending?: boolean;
  /**
   * `primary` (orange brand CTA) for "Confirm & Run" on ledger updates.
   * `danger` (red) reserved for actually destructive deletes — not used here.
   */
  variant?: "primary" | "danger";
};

const DANGER_BUTTON =
  "rounded-md bg-red-600 font-semibold text-white shadow-md shadow-red-600/30 transition-[box-shadow,filter] hover:bg-red-700 hover:shadow-lg hover:shadow-red-600/40 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none";

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm & Run",
  cancelLabel = "Cancel",
  pending = false,
  variant = "primary",
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  // ESC closes (only when not mid-transition).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending, onCancel]);

  // Autofocus Cancel so destructive actions are never one-tap-away.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => cancelRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/45 p-4 backdrop-blur-[2px] sm:p-8"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="my-4 w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
      >
        <div className="flex items-start gap-4 px-6 py-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            <div id={descId} className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {description}
            </div>
          </div>
        </div>

        <div className="flex flex-row-reverse items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`${variant === "danger" ? DANGER_BUTTON : PRIMARY_ORANGE_CTA} inline-flex min-w-[10rem] items-center justify-center gap-2 px-4 py-2 text-sm`}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Running…
              </>
            ) : (
              confirmLabel
            )}
          </button>
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
