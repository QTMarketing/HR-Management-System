"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveTimeClockTimesheetPeriod } from "@/app/actions/time-clock-period";
import type { TimesheetPeriodConfig, TimesheetPeriodKind } from "@/lib/time-clock/timesheet-period";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

type Props = {
  timeClockId: string;
  initialKind: TimesheetPeriodKind;
  initialConfig: TimesheetPeriodConfig;
  canEdit: boolean;
};

export function TimeClockSettingsForm({
  timeClockId,
  initialKind,
  initialConfig,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<TimesheetPeriodKind>(initialKind);
  const [splitDay, setSplitDay] = useState(
    String(initialConfig.split_after_day ?? 15),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function buildConfig(): TimesheetPeriodConfig | null {
    if (kind !== "semi_monthly" && kind !== "custom") return null;
    const n = Number.parseInt(splitDay, 10);
    if (!Number.isFinite(n) || n < 1 || n > 27) {
      return { split_after_day: 15 };
    }
    return { split_after_day: n };
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Timesheet period</h2>
      <p className="mt-1 text-sm text-slate-500">
        Default range for the Timesheets tab for this clock. Managers can still switch range in the
        toolbar; this sets the default and the calendar navigation.
      </p>

      {!canEdit ? (
        <p className="mt-4 text-sm text-slate-600">
          You don’t have permission to edit time clock settings.
        </p>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            setMsg(null);
            startTransition(async () => {
              const r = await saveTimeClockTimesheetPeriod({
                timeClockId,
                timesheet_period_kind: kind,
                timesheet_period_config: buildConfig(),
              });
              if (!r.ok) {
                setErr(r.error);
                return;
              }
              setMsg("Saved.");
              router.refresh();
            });
          }}
        >
          <div>
            <label htmlFor="period-kind" className="block text-sm font-medium text-slate-700">
              Period type
            </label>
            <select
              id="period-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as TimesheetPeriodKind)}
              className="mt-1 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="weekly">Weekly (Mon–Sun)</option>
              <option value="monthly">Monthly (calendar month)</option>
              <option value="semi_monthly">Semi-monthly (two halves per month)</option>
              <option value="custom">Custom (split day, same as semi)</option>
            </select>
          </div>

          {(kind === "semi_monthly" || kind === "custom") && (
            <div>
              <label htmlFor="split-day" className="block text-sm font-medium text-slate-700">
                First half ends on day (1–27)
              </label>
              <input
                id="split-day"
                type="number"
                min={1}
                max={27}
                value={splitDay}
                onChange={(e) => setSplitDay(e.target.value)}
                className="mt-1 w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums"
              />
              <p className="mt-1 text-xs text-slate-500">
                Second half runs from the next day through month end (e.g. 15 → 1–15 and 16–last).
              </p>
            </div>
          )}

          {err ? (
            <p className="text-sm text-red-700" role="alert">
              {err}
            </p>
          ) : null}
          {msg ? (
            <p className="text-sm text-emerald-800" role="status">
              {msg}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className={`${PRIMARY_ORANGE_CTA} inline-flex items-center justify-center px-4 py-2.5 text-sm disabled:opacity-50`}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
