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
  clearLocationPayrollPolicy,
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

const FIELD_INPUT_CLASS =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const FIELD_LABEL_CLASS = "mb-1.5 block min-h-10 text-xs font-semibold leading-snug text-slate-700";

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
  /** Store ids that already have an explicit override row. */
  overrideLocationIds?: string[];
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

export function PayrollRulesCard({
  initial,
  canEdit,
  locations = [],
  overrideLocationIds = [],
}: Props) {
  const overrideSet = useMemo(() => new Set(overrideLocationIds), [overrideLocationIds]);
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
          ? `Custom rules saved for ${selectedLocationName ?? "this store"}.`
          : "Company-wide rules saved. They apply to every store without custom rules.",
      );
    });
  }

  const inputsDisabled = !canEdit || pending || scopeLoading;
  const saveDisabled = inputsDisabled || !isDirty;
  const showFallbackHint = isLocationScope && baseline.source !== "location";
  const hasExplicitOverride = isLocationScope && baseline.source === "location";

  function clearOverride() {
    if (!canEdit || !isLocationScope || pending) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await clearLocationPayrollPolicy(scope);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const globalBaseline: Baseline = { ...initial, source: "global" };
      applyBaseline(globalBaseline);
      setSuccess(
        `Custom rules removed for ${selectedLocationName ?? "this store"}. Company-wide rules apply now.`,
      );
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <form onSubmit={onSubmit} noValidate>
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">
                Payroll &amp; overtime
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Define when regular hours become overtime in timesheets and payroll exports. Use{" "}
                <strong>All locations</strong> for company-wide rules, or choose a store to apply custom
                rules for that location only.
              </p>
            </div>
            {savedAt ? (
              <p className="shrink-0 text-xs text-slate-500">
                Last saved {new Date(savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            ) : null}
          </div>

          {locations.length > 0 ? (
            <div className="mt-4">
              <label htmlFor={scopeId} className="text-xs font-semibold text-slate-700">
                Apply rules to
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
                  <option value={GLOBAL_VALUE}>All locations (default)</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {overrideSet.has(l.id) ? " · Custom rules" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>
              {showFallbackHint ? (
                <p className="mt-2 text-xs text-slate-500">
                  <strong>{selectedLocationName}</strong> uses company-wide rules today. Save changes here
                  to create store-specific rules.
                </p>
              ) : null}
            </div>
          ) : null}

          {!canEdit ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              View only. Organization owners can edit these settings.
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="sm:col-span-1 lg:col-span-3">
              <label htmlFor={weeklyId} className={FIELD_LABEL_CLASS}>
                Weekly overtime after (hours)
              </label>
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
                className={FIELD_INPUT_CLASS}
                placeholder="40"
                aria-describedby={`${weeklyId}-help`}
              />
            </div>

            <div className="sm:col-span-1 lg:col-span-3">
              <label htmlFor={dailyId} className={FIELD_LABEL_CLASS}>
                Daily overtime after (hours)
              </label>
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
                className={FIELD_INPUT_CLASS}
                placeholder="Not used"
                aria-describedby={`${dailyId}-help`}
              />
            </div>

            <div className="sm:col-span-1 lg:col-span-3">
              <label htmlFor={multId} className={FIELD_LABEL_CLASS}>
                Overtime rate
              </label>
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
                className={FIELD_INPUT_CLASS}
                placeholder="1.5"
                aria-describedby={`${multId}-help`}
              />
            </div>

            <div className="flex flex-wrap items-end justify-start gap-2 sm:col-span-2 lg:col-span-3 lg:justify-end">
              <button
                type="submit"
                disabled={saveDisabled}
                className={`${PRIMARY_ORANGE_CTA} inline-flex h-10 min-w-[8.5rem] items-center justify-center gap-2 px-4 text-sm`}
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
                    {isLocationScope ? "Save store rules" : "Save company rules"}
                  </>
                )}
              </button>
              {isLocationScope && hasExplicitOverride && canEdit ? (
                <button
                  type="button"
                  disabled={pending || scopeLoading}
                  onClick={clearOverride}
                  className="inline-flex h-10 min-w-[8.5rem] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Use company rules
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <p id={`${weeklyId}-help`} className="text-xs leading-snug text-slate-500 sm:col-span-1 lg:col-span-3">
              Most employers use 40 hours per week.
            </p>
            <p id={`${dailyId}-help`} className="text-xs leading-snug text-slate-500 sm:col-span-1 lg:col-span-3">
              Optional. Leave blank if daily overtime does not apply.
            </p>
            <p id={`${multId}-help`} className="text-xs leading-snug text-slate-500 sm:col-span-1 lg:col-span-3">
              1.5 is time-and-a-half pay.
            </p>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            {isLocationScope
              ? `These rules apply only to ${selectedLocationName ?? "this store"}. All other stores follow company-wide rules.`
              : "Company-wide rules apply to every store unless that store has custom rules."}
          </p>
        </div>
      </form>
    </section>
  );
}
