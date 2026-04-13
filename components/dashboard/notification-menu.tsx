"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  /** Pending employee time-off requests (manager scope). */
  pendingTimeOffCount: number;
  /** When true, show PTO summary + link to Time Clock. */
  canManageTimeOff: boolean;
};

/**
 * Header bell — MVP “notification hub”: real pending PTO count for managers + link to Activity.
 * Full in-app/email notifications are deferred (time-attendance Phase 6).
 */
export function NotificationMenu({ pendingTimeOffCount, canManageTimeOff }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const showBadge = canManageTimeOff && pendingTimeOffCount > 0;
  const badgeLabel =
    pendingTimeOffCount > 99 ? "99+" : String(pendingTimeOffCount);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {showBadge ? (
          <span
            className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
            aria-hidden
          >
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="border-b border-slate-100 px-3 pb-2 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alerts</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">What needs attention</p>
          </div>

          <div className="max-h-[min(70vh,16rem)] overflow-y-auto px-1 py-1">
            {canManageTimeOff ? (
              pendingTimeOffCount > 0 ? (
                <Link
                  href="/time-clock"
                  className="block rounded-lg px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-orange-50"
                  onClick={() => setOpen(false)}
                >
                  <span className="font-semibold text-orange-800">
                    {pendingTimeOffCount} pending time off request
                    {pendingTimeOffCount === 1 ? "" : "s"}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600">
                    Open Time Clock to approve or deny (uses your current location filter).
                  </span>
                </Link>
              ) : (
                <p className="px-3 py-2 text-sm text-slate-600">
                  No pending time off requests for your current store filter.
                </p>
              )
            ) : (
              <p className="px-3 py-2 text-sm text-slate-600">
                Approval alerts appear here when you can manage time off for your team.
              </p>
            )}

            <Link
              href="/activity"
              className="mt-1 block rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              View full activity feed
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                Clock-ins, breaks, and recent events across locations.
              </span>
            </Link>
          </div>

          <p className="border-t border-slate-100 px-3 py-2 text-[10px] leading-snug text-slate-400">
            Email and push notifications are planned later. This panel shows live data for your team.
          </p>
        </div>
      ) : null}
    </div>
  );
}
