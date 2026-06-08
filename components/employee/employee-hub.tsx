"use client";

import { CalendarClock, CalendarPlus, ChevronRight, Palmtree, Thermometer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { getPtoBalancesForEmployee, type GetPtoBalancesResult } from "@/app/actions/pto-balances";
import { PtoLedgerView } from "@/components/employee/pto-ledger-view";
import type { PtoLedgerEntry } from "@/lib/pto/ledger-types";
import { EmployeeTimeOffRequestModal } from "@/components/time-clock/employee-time-off-request-modal";
import { TimeClockSelfServe } from "@/components/time-clock/time-clock-self-serve";
import type {
  EmployeeHubSelfServeProps,
  EmployeeNextShift,
  LoadEmployeeHubDataResult,
} from "@/lib/employee/load-employee-hub-data";
import {
  consumeRequestTimeOffFlag,
  REQUEST_TIME_OFF_EVENT,
} from "@/lib/ui/request-time-off-signal";

type Props = {
  /** `employees.id` for the signed-in person (not auth user id). */
  employeeId: string;
  hub: LoadEmployeeHubDataResult;
  initialPto: GetPtoBalancesResult;
  /** Pre-loaded ledger entries (newest first). Empty array when none / on error. */
  initialLedger: PtoLedgerEntry[];
  /** Server-side error from the ledger load, if any. */
  initialLedgerError?: string | null;
};

function fmtHours(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} hrs`;
}

function fmtShiftRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  if (sameDay) {
    return `${s.toLocaleString(undefined, dateOpts)} · ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${s.toLocaleString(undefined, { ...dateOpts, ...timeOpts })} → ${e.toLocaleString(undefined, { ...dateOpts, ...timeOpts })}`;
}

export function EmployeeHub({
  employeeId,
  hub,
  initialPto,
  initialLedger,
  initialLedgerError = null,
}: Props) {
  const router = useRouter();
  const [pto, setPto] = useState<GetPtoBalancesResult>(initialPto);
  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const [ptoPending, startPtoTransition] = useTransition();

  const refreshPto = useCallback(() => {
    startPtoTransition(async () => {
      const res = await getPtoBalancesForEmployee(employeeId);
      setPto(res);
    });
  }, [employeeId]);

  // Open the time-off modal when triggered from outside the hub
  // (Cmd+K command palette → "Request Time Off"). Two channels:
  //  1) sessionStorage flag set before navigating to "/" from another route.
  //  2) Custom event for when the user is already on "/".
  useEffect(() => {
    if (consumeRequestTimeOffFlag()) {
      setTimeOffOpen(true);
    }
    function onOpen() {
      setTimeOffOpen(true);
    }
    window.addEventListener(REQUEST_TIME_OFF_EVENT, onOpen);
    return () => window.removeEventListener(REQUEST_TIME_OFF_EVENT, onOpen);
  }, []);

  const vacationHours = pto.ok ? pto.vacationHours : null;
  const sickHours = pto.ok ? pto.sickHours : null;

  const nextShiftCard = useMemo(() => {
    const s: EmployeeNextShift | null = hub.nextShift;
    if (!s) {
      return (
        <p className="text-sm text-slate-600">
          No upcoming shifts on your schedule. Check back later or ask your manager if something looks wrong.
        </p>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-900">{fmtShiftRange(s.shiftStart, s.shiftEnd)}</p>
        {s.locationName ? (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Store:</span> {s.locationName}
          </p>
        ) : null}
        {s.notes?.trim() ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
            {s.notes.trim()}
          </p>
        ) : null}
      </div>
    );
  }, [hub.nextShift]);

  const selfServeProps: EmployeeHubSelfServeProps | null = hub.selfServe;

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8 md:max-w-3xl md:space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">Home</h1>
        <p className="text-sm text-slate-600">Clock in or out, then check your shifts and time off.</p>
      </header>

      {/* Section 1 — Clock (primary action) */}
      <section
        className="space-y-2 rounded-2xl border-2 border-orange-200/90 bg-gradient-to-b from-orange-50/80 to-white p-1 shadow-sm"
        aria-labelledby="emp-hub-clock-heading"
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <h2 id="emp-hub-clock-heading" className="text-sm font-semibold text-slate-900">
            Time clock
          </h2>
          <Link
            href="/my-punches"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-orange-800 hover:text-orange-950"
          >
            My punches
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {hub.clockMissingMessage ? (
          <div className="mx-1 mb-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            {hub.clockMissingMessage}
          </div>
        ) : selfServeProps ? (
          <div className="px-1 pb-1">
            <TimeClockSelfServe {...selfServeProps} />
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {/* Section 2 — Next shift */}
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:p-5"
          aria-labelledby="emp-hub-shift-heading"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-800 ring-1 ring-sky-200/80">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="emp-hub-shift-heading" className="text-sm font-semibold text-slate-900">
                Next shift
              </h2>
              <p className="mt-1 text-xs text-slate-500">Your next scheduled start time.</p>
              <div className="mt-4">{nextShiftCard}</div>
            </div>
          </div>
        </section>

        {/* Section 3 — Time off */}
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:p-5"
          aria-labelledby="emp-hub-pto-heading"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80">
              <Palmtree className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="emp-hub-pto-heading" className="text-sm font-semibold text-slate-900">
                Time off balances
              </h2>
              <p className="mt-1 text-xs text-slate-500">Available hours from your ledger.</p>

              {!pto.ok ? (
                <p className="mt-3 text-sm text-red-700">{pto.error}</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  <li className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <Palmtree className="h-4 w-4 text-emerald-700" aria-hidden />
                      Vacation
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                      {fmtHours(vacationHours ?? 0)}
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <Thermometer className="h-4 w-4 text-sky-700" aria-hidden />
                      Sick
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                      {fmtHours(sickHours ?? 0)}
                    </span>
                  </li>
                </ul>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={!hub.timeOffLocationId || ptoPending}
                  onClick={() => setTimeOffOpen(true)}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  Request time off
                </button>
                <button
                  type="button"
                  disabled={ptoPending}
                  onClick={() => refreshPto()}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  {ptoPending ? "Refreshing…" : "Refresh balances"}
                </button>
              </div>
              {!hub.timeOffLocationId ? (
                <p className="mt-2 text-xs text-amber-800">Time off requests need a home store on your profile.</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {/* Section 4 — PTO history / accrual ledger */}
      <PtoLedgerView
        employeeId={employeeId}
        initialEntries={initialLedger}
        initialError={initialLedgerError}
      />

      {hub.timeOffLocationId ? (
        <EmployeeTimeOffRequestModal
          open={timeOffOpen}
          onClose={() => setTimeOffOpen(false)}
          locationId={hub.timeOffLocationId}
          employeeId={employeeId}
          onSaved={() => {
            refreshPto();
            router.refresh();
          }}
        />
      ) : null}

      {/* Mobile-only Quick-Action FAB — opens the same modal as the inline button. */}
      <button
        type="button"
        onClick={() => setTimeOffOpen(true)}
        disabled={!hub.timeOffLocationId}
        aria-haspopup="dialog"
        aria-label="Request time off"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-orange-600 text-white shadow-xl shadow-orange-600/30 transition active:scale-95 hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
      >
        <CalendarPlus className="h-6 w-6" aria-hidden />
      </button>
    </div>
  );
}
