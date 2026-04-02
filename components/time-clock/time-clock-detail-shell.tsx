"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition, type ReactNode } from "react";

type View = "today" | "timesheets" | "settings";

type Props = {
  clockId: string;
  clockName: string;
  locationName: string;
  todayContent: ReactNode;
  timesheetsContent: ReactNode;
  settingsContent: ReactNode;
  /** Show Settings tab (time clock management). */
  canManage: boolean;
};

export function TimeClockDetailShell({
  clockId,
  clockName,
  locationName,
  todayContent,
  timesheetsContent,
  settingsContent,
  canManage,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const rawView = searchParams.get("view");
  const view: View =
    rawView === "timesheets" ? "timesheets" : rawView === "settings" ? "settings" : "today";

  const setView = useCallback(
    (next: View) => {
      startTransition(() => {
        const q = new URLSearchParams(searchParams.toString());
        if (next === "today") {
          q.delete("view");
        } else {
          q.set("view", next);
        }
        const suffix = q.toString();
        router.push(suffix ? `/time-clock/${clockId}?${suffix}` : `/time-clock/${clockId}`);
      });
    },
    [clockId, router, searchParams],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/time-clock"
            className="text-sm font-medium text-orange-700 hover:text-orange-900"
          >
            ← All time clocks
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{clockName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {locationName} · open punches and schedules for this clock only.
          </p>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <nav className="flex flex-wrap gap-6" aria-label="Time clock views">
          <button
            type="button"
            disabled={pending}
            onClick={() => setView("today")}
            className={`border-b-2 pb-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              view === "today"
                ? "border-orange-500 text-orange-950"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setView("timesheets")}
            className={`border-b-2 pb-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              view === "timesheets"
                ? "border-orange-500 text-orange-950"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Timesheets
          </button>
          {canManage ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setView("settings")}
              className={`border-b-2 pb-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                view === "settings"
                  ? "border-orange-500 text-orange-950"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Settings
            </button>
          ) : null}
        </nav>
      </div>

      {view === "today" ? todayContent : view === "timesheets" ? timesheetsContent : settingsContent}
    </div>
  );
}
