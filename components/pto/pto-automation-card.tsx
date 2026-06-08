"use client";

import { CalendarClock, Loader2, Play, Save } from "lucide-react";
import { useId, useState, useTransition } from "react";
import {
  loadPtoAutomationPageData,
  runPtoAutomationNow,
  updatePtoAutomationSettings,
  type PtoAutomationPageData,
} from "@/app/actions/pto-automation";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

type Props = {
  initial: PtoAutomationPageData;
  canEdit: boolean;
};

function formatJobType(job: string): string {
  if (job === "year_rollover") return "Annual time off grant";
  if (job === "monthly_cashout") return "Monthly vacation payout";
  return job;
}

function formatTrigger(trigger: string): string {
  if (trigger === "cron") return "Scheduled";
  if (trigger === "manual") return "Manual";
  return trigger;
}

function formatStatus(status: string): string {
  if (status === "success") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return status;
}

function formatRunResult(job: string, status: string, detail?: string | null): string {
  const label = formatJobType(job);
  const state = formatStatus(status).toLowerCase();
  if (detail) return `${label} ${state} — ${detail}`;
  return `${label} ${state}`;
}

export function PtoAutomationCard({ initial, canEdit }: Props) {
  const [data, setData] = useState(initial);
  const [yearAuto, setYearAuto] = useState(initial.settings?.yearRolloverAutoEnabled ?? true);
  const [monthAuto, setMonthAuto] = useState(initial.settings?.monthlyCashoutAutoEnabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const yearId = useId();
  const monthId = useId();

  const tz = data.settings?.timezone ?? "UTC";

  function refreshData() {
    void loadPtoAutomationPageData().then(setData);
  }

  function saveSettings() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await updatePtoAutomationSettings({
        yearRolloverAutoEnabled: yearAuto,
        monthlyCashoutAutoEnabled: monthAuto,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("Automation settings saved.");
      refreshData();
    });
  }

  function runDueNow() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await runPtoAutomationNow();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const lines = r.results.map((x) => formatRunResult(x.job, x.status, x.detail));
      setSuccess(lines.join(" · ") || "Scheduled tasks finished.");
      refreshData();
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <CalendarClock className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Time off automation</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Automatically process annual time off grants on January 1 and optional monthly vacation
              payouts on your configured schedule. All times use your policy timezone ({tz}).
            </p>
          </div>
        </div>

        {error ? (
          <p
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {success}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
            <input
              id={yearId}
              type="checkbox"
              checked={yearAuto}
              onChange={(e) => setYearAuto(e.target.checked)}
              disabled={!canEdit || pending}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Automatic annual time off grant (January 1)
              </span>
              <span className="block text-xs text-slate-500">
                Reset unused balances and grant new time off for the year according to your PTO policy.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
            <input
              id={monthId}
              type="checkbox"
              checked={monthAuto}
              onChange={(e) => setMonthAuto(e.target.checked)}
              disabled={!canEdit || pending}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Automatic monthly vacation payout
              </span>
              <span className="block text-xs text-slate-500">
                Convert unused vacation into payroll payouts each month per your cash-out policy.
              </span>
            </span>
          </label>
        </div>

        {!canEdit ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            View only. Organization owners can change automation settings.
          </p>
        ) : null}

        {data.recentRuns.length > 0 ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Task</th>
                  <th className="px-3 py-2.5">Period</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {new Date(run.started_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {formatJobType(run.job_type)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-700">{run.period_key}</td>
                    <td className="px-3 py-2.5 text-slate-600">{formatTrigger(run.triggered_by)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          run.status === "success"
                            ? "text-emerald-700"
                            : run.status === "failed"
                              ? "text-red-700"
                              : "text-slate-600"
                        }
                      >
                        {formatStatus(run.status)}
                        {run.error_message ? ` — ${run.error_message}` : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 text-xs text-slate-500">No automated runs recorded yet.</p>
        )}
      </div>

      {canEdit ? (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Save your preferences, or run any due tasks immediately without waiting for the schedule.
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={saveSettings}
                disabled={pending}
                className={`${PRIMARY_ORANGE_CTA} inline-flex items-center gap-2 px-4 py-2 text-sm`}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save settings
              </button>
              <button
                type="button"
                onClick={runDueNow}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run scheduled tasks now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
