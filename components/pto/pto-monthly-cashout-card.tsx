"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { runPtoMonthlyVacationCashout } from "@/app/actions/pto-monthly-cashout";
import { logManualPtoAutomationRun } from "@/app/actions/pto-automation";
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

function formatEffectiveAt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

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
      const periodKey = `${year}-${String(month).padStart(2, "0")}`;
      if (!r.ok) {
        await logManualPtoAutomationRun({
          jobType: "monthly_cashout",
          periodKey,
          status: "failed",
          summary: {},
          errorMessage: r.error,
        });
        setError(r.error);
        setConfirmOpen(false);
        return;
      }
      await logManualPtoAutomationRun({
        jobType: "monthly_cashout",
        periodKey,
        status: "success",
        summary: r.summary as unknown as Record<string, unknown>,
      });
      setSummary(r.summary);
      setConfirmOpen(false);
    });
  }

  const monthLong = MONTHS_LONG[Math.max(0, Math.min(11, month - 1))];

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <form onSubmit={onSubmit} noValidate>
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Monthly vacation payout</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Convert unused vacation into a payroll payout for the selected month. Safe to run again —
              duplicate payouts for the same month are prevented.
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
                <p className="text-xs font-semibold text-slate-500">Pay period</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {MONTHS_LONG[Math.max(0, Math.min(11, summary.month - 1))]} {summary.year}
                </p>
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
                <p className="text-xs font-semibold text-slate-500">Employees paid out</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.payouts_inserted}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">Hours paid out</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                  {summary.hours_paid_out.toFixed(1)} h
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:px-6">
          <p className="text-xs text-slate-500">
            Run after your payroll cut-off for the month, once vacation balances are final.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <label htmlFor={yearId} className="w-full sm:w-36">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Year</span>
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
            <label htmlFor={monthId} className="w-full sm:w-44">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Month</span>
              <select
                id={monthId}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                disabled={disabled}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {MONTHS_LONG[idx]}
                  </option>
                ))}
              </select>
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
                    <Banknote className="h-4 w-4" aria-hidden />
                    Process payout
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
        title="Process monthly vacation payout?"
        description={
          <>
            This will create payroll payout entries for unused vacation in{" "}
            <strong className="font-semibold">
              {monthLong} {year}
            </strong>{" "}
            for all eligible employees. This cannot be undone from this screen.
          </>
        }
      />
    </section>
  );
}
