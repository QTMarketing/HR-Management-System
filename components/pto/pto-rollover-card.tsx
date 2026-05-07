"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { runPtoYearRollover } from "@/app/actions/pto-rollover";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Summary = {
  year: number;
  effective_at: string;
  grants_inserted: number;
  forfeits_inserted: number;
};

export function PtoRolloverCard() {
  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState<number>(thisYear);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const yearId = useId();
  const disabled = pending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    // Don't fire the action; show the safety modal first.
    setError(null);
    setSummary(null);
    setConfirmOpen(true);
  }

  function runConfirmed() {
    startTransition(async () => {
      const r = await runPtoYearRollover(year);
      if (!r.ok) {
        setError(r.error);
        setConfirmOpen(false);
        return;
      }
      setSummary(r.summary);
      setConfirmOpen(false);
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <form onSubmit={onSubmit} noValidate>
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Annual PTO rollover</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Process the end-of-year time off reset. This will forfeit any unused balances from the
              selected year and issue new grants for the upcoming year. You can safely click this
              multiple times if needed; the system is smart enough not to duplicate grants or forfeits.
            </p>
          </div>

          {error ? (
            <p
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {summary ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Year</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{summary.year}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Effective at
                </p>
                <p
                  className="mt-1 truncate text-sm font-semibold text-slate-900"
                  title={summary.effective_at}
                >
                  {summary.effective_at || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Grants inserted
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.grants_inserted}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Forfeits inserted
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.forfeits_inserted}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <label htmlFor={yearId} className="flex w-full flex-col gap-1.5 sm:w-32">
              <span className="text-xs font-semibold text-slate-700">Year</span>
              <input
                id={yearId}
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={disabled}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <div className="flex items-end pb-[0.05rem]">
              <button
                type="submit"
                disabled={disabled}
                className={`${PRIMARY_ORANGE_CTA} inline-flex min-w-[10rem] items-center justify-center gap-2 px-4 py-2 text-sm`}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Running…
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4" aria-hidden />
                    Run rollover
                  </>
                )}
              </button>
            </div>
          </div>
          {!summary && !error ? (
            <p className="mt-3 text-[11px] text-slate-500 sm:text-right">
              Tip: Run this at the start of your new calendar year to reset balances.
            </p>
          ) : null}
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => {
          if (!pending) setConfirmOpen(false);
        }}
        onConfirm={runConfirmed}
        pending={pending}
        title="Confirm Ledger Update"
        description={
          <>
            You are about to process the <strong className="font-semibold">{year} annual rollover</strong>.
            This will permanently update the ledger for all eligible employees. Are you sure you want to
            proceed?
          </>
        }
      />
    </section>
  );
}
