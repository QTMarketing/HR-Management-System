"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { runPtoYearRollover } from "@/app/actions/pto-rollover";
import { logManualPtoAutomationRun } from "@/app/actions/pto-automation";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Summary = {
  year: number;
  effective_at: string;
  grants_inserted: number;
  forfeits_inserted: number;
};

function formatEffectiveAt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

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
    setError(null);
    setSummary(null);
    setConfirmOpen(true);
  }

  function runConfirmed() {
    startTransition(async () => {
      const r = await runPtoYearRollover(year);
      if (!r.ok) {
        await logManualPtoAutomationRun({
          jobType: "year_rollover",
          periodKey: String(year),
          status: "failed",
          summary: {},
          errorMessage: r.error,
        });
        setError(r.error);
        setConfirmOpen(false);
        return;
      }
      await logManualPtoAutomationRun({
        jobType: "year_rollover",
        periodKey: String(year),
        status: "success",
        summary: r.summary as unknown as Record<string, unknown>,
      });
      setSummary(r.summary);
      setConfirmOpen(false);
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <form onSubmit={onSubmit} noValidate>
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Year-end time off reset</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Process the annual reset for all eligible employees: clear unused balances from the selected
              year and grant new time off for the upcoming year. Safe to run again — duplicate entries are
              prevented.
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">Plan year</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{summary.year}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">Effective date</p>
                <p
                  className="mt-1 truncate text-sm font-semibold text-slate-900"
                  title={summary.effective_at}
                >
                  {formatEffectiveAt(summary.effective_at)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">New grants posted</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.grants_inserted}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">Balances reset</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.forfeits_inserted}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:px-6">
          <p className="text-xs text-slate-500">
            Run at the start of your new calendar year after you have confirmed your PTO policy for the
            year.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <label htmlFor={yearId} className="w-full sm:w-36">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Plan year</span>
              <input
                id={yearId}
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={disabled}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <button
              type="submit"
              disabled={disabled}
              className={`${PRIMARY_ORANGE_CTA} inline-flex h-10 min-w-[10rem] shrink-0 items-center justify-center gap-2 px-4 text-sm`}
            >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Processing…
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4" aria-hidden />
                    Process year-end reset
                  </>
                )}
              </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => {
          if (!pending) setConfirmOpen(false);
        }}
        onConfirm={runConfirmed}
        pending={pending}
        title="Process year-end time off reset?"
        description={
          <>
            This will update time off balances for all eligible employees for plan year{" "}
            <strong className="font-semibold">{year}</strong>. Unused balances will be cleared and new
            grants will be posted. This cannot be undone from this screen.
          </>
        }
      />
    </section>
  );
}
