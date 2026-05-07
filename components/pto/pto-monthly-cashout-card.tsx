"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { runPtoMonthlyVacationCashout } from "@/app/actions/pto-monthly-cashout";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type Summary = {
  year: number;
  month: number;
  effective_at: string;
  payouts_inserted: number;
  hours_paid_out: number;
};

export function PtoMonthlyCashoutCard() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const yearId = useId();
  const monthId = useId();
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
      const r = await runPtoMonthlyVacationCashout(year, month);
      if (!r.ok) {
        setError(r.error);
        setConfirmOpen(false);
        return;
      }
      setSummary(r.summary);
      setConfirmOpen(false);
    });
  }

  // 1-indexed month → long-form name for the modal copy.
  const monthLong = MONTHS_LONG[Math.max(0, Math.min(11, month - 1))];

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <form onSubmit={onSubmit} noValidate>
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              Monthly vacation cash-out
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Convert unused vacation time into a payout entry for the selected month&apos;s payroll.
              You can safely click this multiple times; it will not duplicate payouts for the same
              month.
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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Month
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.year}-{String(summary.month).padStart(2, "0")}
                </p>
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
                  Payout rows inserted
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.payouts_inserted}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Hours paid out
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.hours_paid_out.toFixed(1)}h
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
            <label htmlFor={monthId} className="flex w-full flex-col gap-1.5 sm:w-32">
              <span className="text-xs font-semibold text-slate-700">Month</span>
              <select
                id={monthId}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                disabled={disabled}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
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
                    <Banknote className="h-4 w-4" aria-hidden />
                    Run cash-out
                  </>
                )}
              </button>
            </div>
          </div>
          {!summary && !error ? (
            <p className="mt-3 text-[11px] text-slate-500 sm:text-right">
              Tip: Run this right after your payroll cut-off date to cash out any unused vacation time.
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
            You are about to process the{" "}
            <strong className="font-semibold">
              {monthLong} {year} vacation cash-out
            </strong>
            . This will permanently update the ledger for all eligible employees. Are you sure you want
            to proceed?
          </>
        }
      />
    </section>
  );
}
