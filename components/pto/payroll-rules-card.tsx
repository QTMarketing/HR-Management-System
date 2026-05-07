"use client";

/**
 * Track C — "Payroll & OT Rules" card on the PTO Admin page.
 *
 * Surfaces the global `payroll_policies` row (weekly OT threshold, optional
 * daily threshold, OT multiplier) and lets owners edit it. The form is a thin
 * wrapper around `updateGlobalPayrollPolicy`; per-location overrides aren't
 * editable from this UI yet (they're still stored in the same table).
 *
 * UI/UX contract preserved during the layout overhaul:
 *   - `useTransition` (`pending` state) drives Save button.
 *   - Inputs stay as raw strings; numeric coercion happens only at submit time.
 *   - Native `<form onSubmit>` so Enter submits.
 *   - Save is disabled while pristine (no edits vs `initial`).
 */

import { useId, useMemo, useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { updateGlobalPayrollPolicy } from "@/app/actions/payroll-policy";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

export type PayrollRulesCardInitial = {
  weeklyOtThreshold: number;
  dailyOtThreshold: number | null;
  otMultiplier: number;
  updatedAt?: string | null;
};

type Props = {
  initial: PayrollRulesCardInitial;
  /** When `false`, the form is read-only — non-owners see the values but can't change them. */
  canEdit: boolean;
};

/** Coerce a string `<input>` value into a finite number or `null`. */
function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Tiny number-equality helper — treats null/null as equal. */
function eqNum(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a === b;
}

export function PayrollRulesCard({ initial, canEdit }: Props) {
  // Baseline used for the dirty-check; refreshed on save success so the button
  // can disable again until the user makes another edit.
  const [baseline, setBaseline] = useState<PayrollRulesCardInitial>(initial);

  const [weekly, setWeekly] = useState<string>(String(initial.weeklyOtThreshold));
  const [daily, setDaily] = useState<string>(
    initial.dailyOtThreshold == null ? "" : String(initial.dailyOtThreshold),
  );
  const [mult, setMult] = useState<string>(String(initial.otMultiplier));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt ?? null);
  const [success, setSuccess] = useState(false);

  const weeklyId = useId();
  const dailyId = useId();
  const multId = useId();

  const isDirty = useMemo(() => {
    return (
      !eqNum(parseNumber(weekly), baseline.weeklyOtThreshold) ||
      !eqNum(parseNumber(daily), baseline.dailyOtThreshold) ||
      !eqNum(parseNumber(mult), baseline.otMultiplier)
    );
  }, [weekly, daily, mult, baseline]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || pending) return;

    setError(null);
    setSuccess(false);

    const weeklyNum = parseNumber(weekly);
    if (weeklyNum === null) {
      setError("Weekly OT threshold is required (e.g. 40).");
      return;
    }
    const multNum = parseNumber(mult);
    if (multNum === null) {
      setError("OT multiplier is required (e.g. 1.5).");
      return;
    }
    const dailyNum = parseNumber(daily); // null when blank → daily OT disabled

    startTransition(async () => {
      const r = await updateGlobalPayrollPolicy({
        weeklyOtThreshold: weeklyNum,
        dailyOtThreshold: dailyNum,
        otMultiplier: multNum,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const updatedAt = r.row.updated_at ?? new Date().toISOString();
      setSavedAt(updatedAt);
      setBaseline({
        weeklyOtThreshold: weeklyNum,
        dailyOtThreshold: dailyNum,
        otMultiplier: multNum,
        updatedAt,
      });
      setSuccess(true);
    });
  }

  const inputsDisabled = !canEdit || pending;
  const saveDisabled = !canEdit || pending || !isDirty;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <form onSubmit={onSubmit} noValidate>
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">
                Payroll &amp; Overtime Rules
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Set the global rules for how regular and overtime hours are calculated in the timesheet
                and payroll exports.
              </p>
            </div>
            {savedAt ? (
              <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Updated {new Date(savedAt).toLocaleString()}
              </p>
            ) : null}
          </div>

          {!canEdit ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              You can view these settings, but only Organization Owners can change them.
            </p>
          ) : null}

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
              Saved. The timesheet panel and payroll CSV will use these thresholds on the next refresh.
            </p>
          ) : null}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-end">
            <label htmlFor={weeklyId} className="flex w-full flex-col gap-1.5 lg:w-44">
              <span className="text-xs font-semibold text-slate-700">
                Weekly OT threshold (h)
              </span>
              <input
                id={weeklyId}
                type="number"
                inputMode="decimal"
                min={0}
                max={168}
                step={0.5}
                value={weekly}
                onChange={(e) => setWeekly(e.target.value)}
                disabled={inputsDisabled}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="40"
                aria-describedby={`${weeklyId}-help`}
              />
              <span id={`${weeklyId}-help`} className="text-[11px] text-slate-500">
                Standard weekly threshold is 40 hours.
              </span>
            </label>

            <label htmlFor={dailyId} className="flex w-full flex-col gap-1.5 lg:w-48">
              <span className="text-xs font-semibold text-slate-700">
                Daily OT threshold (h, optional)
              </span>
              <input
                id={dailyId}
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
                disabled={inputsDisabled}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="(blank = none)"
                aria-describedby={`${dailyId}-help`}
              />
              <span id={`${dailyId}-help`} className="text-[11px] text-slate-500">
                Leave blank to disable.
              </span>
            </label>

            <label htmlFor={multId} className="flex w-full flex-col gap-1.5 lg:w-40">
              <span className="text-xs font-semibold text-slate-700">OT multiplier</span>
              <input
                id={multId}
                type="number"
                inputMode="decimal"
                min={1}
                max={5}
                step={0.05}
                value={mult}
                onChange={(e) => setMult(e.target.value)}
                disabled={inputsDisabled}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="1.5"
                aria-describedby={`${multId}-help`}
              />
              <span id={`${multId}-help`} className="text-[11px] text-slate-500">
                1.5 = time-and-a-half.
              </span>
            </label>

            <div className="flex items-end pb-[1.4rem] lg:pb-[1.4rem]">
              <button
                type="submit"
                disabled={saveDisabled}
                className={`${PRIMARY_ORANGE_CTA} inline-flex min-w-[8.5rem] items-center justify-center gap-2 px-4 py-2 text-sm`}
                title={
                  !isDirty && canEdit && !pending
                    ? "Make a change first to enable saving."
                    : undefined
                }
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden />
                    Save rules
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-500 lg:text-right">
            These rules apply company-wide to all locations.
          </p>
        </div>
      </form>
    </section>
  );
}
