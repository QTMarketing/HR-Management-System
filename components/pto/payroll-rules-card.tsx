"use client";

/**
 * Track C — "Payroll & OT Rules" card on the PTO Admin page.
 *
 * Surfaces the `payroll_policies` table at two scopes:
 *   - `All Locations (Default)` → the global row (`location_id IS NULL`).
 *   - A specific store              → that store's override row, falling back
 *                                     to the global values when no override
 *                                     exists yet.
 *
 * UI/UX contract preserved during the layout overhaul:
 *   - `useTransition` (`pending` state) drives Save button.
 *   - Inputs stay as raw strings; numeric coercion happens only at submit time.
 *   - Native `<form onSubmit>` so Enter submits.
 *   - Save is disabled while pristine (no edits vs the active baseline).
 */

import { ChevronDown, Globe2, Loader2, Save, Store } from "lucide-react";
import { useCallback, useId, useMemo, useState, useTransition } from "react";
import {
  getLocationPayrollPolicy,
  saveLocationPayrollPolicy,
  updateGlobalPayrollPolicy,
} from "@/app/actions/payroll-policy";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

export type PayrollRulesCardInitial = {
  weeklyOtThreshold: number;
  dailyOtThreshold: number | null;
  otMultiplier: number;
  updatedAt?: string | null;
};

export type PayrollRulesLocationOption = {
  id: string;
  name: string;
};

const GLOBAL_VALUE = "__global__";

type Baseline = PayrollRulesCardInitial & {
  /** "location" = explicit override row exists; "global" = falling back. */
  source: "location" | "global" | "fallback";
};

type Props = {
  initial: PayrollRulesCardInitial;
  /** When `false`, the form is read-only — non-owners see the values but can't change them. */
  canEdit: boolean;
  /** Locations available for per-store overrides. Empty = no selector rendered. */
  locations?: PayrollRulesLocationOption[];
};

function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function eqNum(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a === b;
}

export function PayrollRulesCard({ initial, canEdit, locations = [] }: Props) {
  const [scope, setScope] = useState<string>(GLOBAL_VALUE);
  const [scopeLoading, setScopeLoading] = useState(false);

  const [baseline, setBaseline] = useState<Baseline>({
    ...initial,
    source: "global",
  });
  const [weekly, setWeekly] = useState<string>(String(initial.weeklyOtThreshold));
  const [daily, setDaily] = useState<string>(
    initial.dailyOtThreshold == null ? "" : String(initial.dailyOtThreshold),
  );
  const [mult, setMult] = useState<string>(String(initial.otMultiplier));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt ?? null);
  const [success, setSuccess] = useState<string | null>(null);

  const scopeId = useId();
  const weeklyId = useId();
  const dailyId = useId();
  const multId = useId();

  const isLocationScope = scope !== GLOBAL_VALUE;
  const selectedLocationName =
    locations.find((l) => l.id === scope)?.name ?? null;

  const isDirty = useMemo(() => {
    return (
      !eqNum(parseNumber(weekly), baseline.weeklyOtThreshold) ||
      !eqNum(parseNumber(daily), baseline.dailyOtThreshold) ||
      !eqNum(parseNumber(mult), baseline.otMultiplier)
    );
  }, [weekly, daily, mult, baseline]);

  /** Push a fresh baseline + form values for a freshly-loaded scope. */
  const applyBaseline = useCallback((b: Baseline) => {
    setBaseline(b);
    setWeekly(String(b.weeklyOtThreshold));
    setDaily(b.dailyOtThreshold == null ? "" : String(b.dailyOtThreshold));
    setMult(String(b.otMultiplier));
    setSavedAt(b.updatedAt ?? null);
  }, []);

  const onScopeChange = useCallback(
    (next: string) => {
      setScope(next);
      setError(null);
      setSuccess(null);
      if (next === GLOBAL_VALUE) {
        // We don't have a fresh server fetch for the global row here, so use
        // the prop `initial` as the canonical baseline. (Page-level RSC is
        // already revalidated after a save, so navigating away/back updates it.)
        applyBaseline({ ...initial, source: "global" });
        return;
      }
      setScopeLoading(true);
      void (async () => {
        const r = await getLocationPayrollPolicy(next);
        setScopeLoading(false);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const row = r.row;
        if (!row) {
          // No override AND no global row — extremely rare; surface defaults
          // from `initial` so the user can still type values.
          applyBaseline({ ...initial, source: "fallback" });
          return;
        }
        applyBaseline({
          weeklyOtThreshold: row.weekly_ot_threshold,
          dailyOtThreshold: row.daily_ot_threshold,
          otMultiplier: row.ot_multiplier,
          updatedAt: row.updated_at ?? null,
          source: r.source,
        });
      })();
    },
    [applyBaseline, initial],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || pending) return;

    setError(null);
    setSuccess(null);

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
    const dailyNum = parseNumber(daily);

    startTransition(async () => {
      const result = isLocationScope
        ? await saveLocationPayrollPolicy(scope, {
            weeklyOtThreshold: weeklyNum,
            dailyOtThreshold: dailyNum,
            otMultiplier: multNum,
          })
        : await updateGlobalPayrollPolicy({
            weeklyOtThreshold: weeklyNum,
            dailyOtThreshold: dailyNum,
            otMultiplier: multNum,
          });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const updatedAt = result.row.updated_at ?? new Date().toISOString();
      applyBaseline({
        weeklyOtThreshold: weeklyNum,
        dailyOtThreshold: dailyNum,
        otMultiplier: multNum,
        updatedAt,
        source: isLocationScope ? "location" : "global",
      });
      setSavedAt(updatedAt);
      setSuccess(
        isLocationScope
          ? `Saved override for ${selectedLocationName ?? "this store"}.`
          : "Saved global rules. They apply to all stores without an override.",
      );
    });
  }

  const inputsDisabled = !canEdit || pending || scopeLoading;
  const saveDisabled = inputsDisabled || !isDirty;
  const showFallbackHint = isLocationScope && baseline.source !== "location";

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
                Set how regular and overtime hours are calculated in the timesheet and payroll exports.
                Pick <strong>All Locations (Default)</strong> to edit the company-wide rules, or pick a
                specific store to add an override.
              </p>
            </div>
            {savedAt ? (
              <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Updated {new Date(savedAt).toLocaleString()}
              </p>
            ) : null}
          </div>

          {locations.length > 0 ? (
            <div className="mt-4">
              <label htmlFor={scopeId} className="text-xs font-semibold text-slate-700">
                Select Location to Edit Policy
              </label>
              <div className="relative mt-1.5 max-w-md">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {isLocationScope ? (
                    <Store className="h-4 w-4" aria-hidden />
                  ) : (
                    <Globe2 className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <select
                  id={scopeId}
                  value={scope}
                  onChange={(e) => onScopeChange(e.target.value)}
                  disabled={inputsDisabled}
                  className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value={GLOBAL_VALUE}>All Locations (Default)</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>
              {showFallbackHint ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  No override yet for <strong>{selectedLocationName}</strong> — you&apos;re viewing the
                  global defaults. Save to create a store-specific policy.
                </p>
              ) : null}
            </div>
          ) : null}

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
              {success}
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
                    {isLocationScope ? "Save store rules" : "Save global rules"}
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-500 lg:text-right">
            {isLocationScope
              ? `Override applies only to ${selectedLocationName ?? "this store"}. Other stores keep using the global rules.`
              : "These rules apply to every store that doesn't have its own override."}
          </p>
        </div>
      </form>
    </section>
  );
}
