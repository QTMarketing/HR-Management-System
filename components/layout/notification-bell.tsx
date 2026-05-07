"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, Check } from "lucide-react";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";

export type NotificationBellItem = {
  id: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

type Props = {
  /** Recent notifications (read + unread), most recent first. Empty when signed out / unlinked. */
  initialNotifications: NotificationBellItem[];
  /** Total unread count — may exceed initialNotifications.length when there are many. */
  initialUnreadCount: number;
};

/** Friendly relative time ("just now", "5m", "2h", "3d", or short date for older). */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 45) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)}d ago`;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function NotificationBell({ initialNotifications, initialUnreadCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Keep local state aligned with server props after a `router.refresh()`.
  useEffect(() => {
    setItems(initialNotifications);
    setUnreadCount(initialUnreadCount);
  }, [initialNotifications, initialUnreadCount]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleMarkRead = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    startTransition(async () => {
      const r = await markNotificationRead(id);
      if (!r.ok) {
        // Roll back on failure so the bell stays accurate.
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)));
        setUnreadCount((c) => c + 1);
      } else {
        router.refresh();
      }
    });
  };

  const handleMarkAll = () => {
    if (unreadCount === 0) return;
    const snapshot = items;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    startTransition(async () => {
      const r = await markAllNotificationsRead();
      if (!r.ok) {
        setItems(snapshot);
        setUnreadCount(snapshot.filter((n) => !n.is_read).length);
      } else {
        router.refresh();
      }
    });
  };

  const showBadge = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        aria-label={
          showBadge
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
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
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 pb-2 pt-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notifications
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {showBadge ? `${unreadCount} unread` : "You’re all caught up"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unreadCount === 0 || pending}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>

          <ul className="max-h-[min(70vh,22rem)] overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-500">
                No notifications yet.
              </li>
            ) : (
              items.map((n) => {
                const inner = (
                  <>
                    <span
                      className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                        n.is_read ? "bg-transparent" : "bg-orange-500"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            n.is_read ? "font-medium text-slate-700" : "font-semibold text-slate-900"
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[10px] font-medium text-slate-400">
                          {formatRelative(n.created_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">
                        {n.message}
                      </span>
                    </span>
                  </>
                );
                const baseClass =
                  "flex w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-orange-50/60";
                return (
                  <li key={n.id} className="border-b border-slate-100 last:border-b-0">
                    {n.link ? (
                      <Link
                        href={n.link}
                        className={baseClass}
                        onClick={() => {
                          setOpen(false);
                          if (!n.is_read) handleMarkRead(n.id);
                        }}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={baseClass}
                        onClick={() => {
                          if (!n.is_read) handleMarkRead(n.id);
                        }}
                      >
                        {inner}
                      </button>
                    )}
                    {n.is_read ? null : (
                      <div className="flex items-center justify-end gap-1 px-4 pb-2">
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          disabled={pending}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Check className="h-3 w-3" aria-hidden />
                          Mark as read
                        </button>
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
