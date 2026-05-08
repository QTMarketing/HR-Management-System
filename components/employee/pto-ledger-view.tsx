"use client";

/**
 * PTO ledger history table for the Employee Hub.
 *
 * Pure presentation — accepts a pre-loaded list of `PtoLedgerEntry` rows from
 * the server action `getPtoLedger`. A "Refresh" button re-fetches via the
 * same action so balances and history stay in sync after a request is
 * approved or a manager logs an adjustment.
 */

import { History, Loader2, Minus, Palmtree, Plus, RefreshCcw, Thermometer } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { getPtoLedger } from "@/app/actions/pto-ledger";
import type { PtoLedgerEntry } from "@/lib/pto/ledger-types";

const PAGE_SIZE = 8;

type Props = {
  employeeId: string;
  initialEntries: PtoLedgerEntry[];
  /** Optional error from the initial server load — if present, we show it. */
  initialError?: string | null;
};

function fmtHours(n: number): string {
  const abs = Math.abs(n).toFixed(2);
  return `${n >= 0 ? "+" : "-"}${abs} hrs`;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function bucketIcon(bucket: PtoLedgerEntry["bucket"]) {
  if (bucket === "vacation")
    return <Palmtree className="h-3.5 w-3.5 text-emerald-700" aria-hidden />;
  return <Thermometer className="h-3.5 w-3.5 text-sky-700" aria-hidden />;
}

export function PtoLedgerView({ employeeId, initialEntries, initialError = null }: Props) {
  const [entries, setEntries] = useState<PtoLedgerEntry[]>(initialEntries);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(
    () => (showAll ? entries : entries.slice(0, PAGE_SIZE)),
    [entries, showAll],
  );
  const hiddenCount = entries.length - visible.length;

  const refresh = () => {
    startTransition(async () => {
      const r = await getPtoLedger(employeeId);
      if (r.ok) {
        setEntries(r.data);
        setError(null);
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <section
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:p-5"
      aria-labelledby="emp-hub-ledger-heading"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-900 ring-1 ring-violet-200/80">
          <History className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="emp-hub-ledger-heading" className="text-sm font-semibold text-slate-900">
                Time off history
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Every accrual, request, adjustment, and payout that affected your balances.
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
              )}
              {pending ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {error ? (
            <p
              className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {entries.length === 0 ? (
            <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-600">
              No ledger activity yet. Once you earn time off or get a request approved, it will show up
              here.
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Change</th>
                    <th className="hidden px-3 py-2 sm:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((e) => {
                    const positive = e.changeAmount > 0;
                    const badgeClass = positive
                      ? "bg-emerald-50 text-emerald-900 ring-emerald-200/80"
                      : "bg-rose-50 text-rose-900 ring-rose-200/80";
                    const Icon = positive ? Plus : Minus;
                    return (
                      <tr key={e.id} className="text-slate-800">
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 tabular-nums">
                          {fmtWhen(e.effectiveAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
                            {bucketIcon(e.bucket)}
                            {e.typeLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${badgeClass}`}
                          >
                            <Icon className="h-3 w-3" aria-hidden />
                            {fmtHours(e.changeAmount)}
                          </span>
                        </td>
                        <td className="hidden truncate px-3 py-2.5 text-slate-600 sm:table-cell">
                          {e.description}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hiddenCount > 0 ? (
                <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="text-xs font-semibold text-orange-700 hover:text-orange-900"
                  >
                    Show {hiddenCount} more
                  </button>
                </div>
              ) : null}
              {showAll && entries.length > PAGE_SIZE ? (
                <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll(false)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Show less
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
