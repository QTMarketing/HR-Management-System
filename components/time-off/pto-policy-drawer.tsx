"use client";

import { Briefcase, Info, Plus, Store, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  replaceEntitlementTiers,
  updatePtoPolicySettings,
  type PtoBucket,
  type PtoCohort,
  type PtoEntitlementTier,
  type PtoPolicySummary,
} from "@/app/actions/pto-policy";

type Props = {
  open: boolean;
  bucket: PtoBucket;
  policy: PtoPolicySummary;
  onClose: () => void;
};

type DraftTier = {
  uid: string;
  cohort: PtoCohort;
  minYears: number;
  annualHours: number;
};

/**
 * Linear ladder: starts at `startYears` with `startDays`, climbs linearly
 * to `maxDays` at `maxYears`. Used for the store manager / store
 * employee cohorts, whose policy text reads "5 days at 1 year, +1 day
 * per year up to 10 days at 6 years".
 */
type LinearLadder = {
  cohort: PtoCohort;
  startYears: number;
  startDays: number;
  maxYears: number;
  maxDays: number;
};

/**
 * Stepped ladder: explicit breakpoints. Used for the office cohort,
 * whose policy is non-linear (1y→5d, 2y→10d, 5y→15d, 10y→20d) and can't
 * be expressed as a single linear slope.
 */
type SteppedLadder = {
  cohort: PtoCohort;
  kind: "stepped";
  steps: Array<{ uid: string; years: number; days: number }>;
};

type Ladder =
  | (LinearLadder & { kind: "linear" })
  | SteppedLadder;

const COHORT_LABEL: Record<PtoCohort, string> = {
  office: "Office",
  manager: "Store managers",
  employee: "Store employees",
  all: "All staff",
};
const COHORT_BLURB: Record<PtoCohort, string> = {
  office:
    "Head-office / HR / Accounting / corporate roles. Non-linear ladder with custom year breakpoints.",
  manager: "Anyone with a manager-level title at a store.",
  employee: "Hourly / part-time / full-time store staff.",
  all: "Applies to every active employee.",
};
const COHORT_ICON: Record<PtoCohort, React.ComponentType<{ className?: string }>> = {
  office: Briefcase,
  manager: Store,
  employee: Store,
  all: Store,
};
const COHORT_ORDER: ReadonlyArray<PtoCohort> = ["office", "manager", "employee", "all"];

/** Cohorts whose ladder is naturally non-linear (= stepped editor). */
const STEPPED_COHORTS: ReadonlySet<PtoCohort> = new Set(["office"]);

function uniqueId(): string {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Reduce a list of per-year tiers into one ladder per cohort.
 *
 * Stepped cohorts (office) keep their explicit breakpoints — collapsing
 * them to a linear startDays/maxDays summary would lossily smooth a
 * non-linear policy. Linear cohorts (manager/employee) get reduced to
 * (startYears, startDays) → (maxYears, maxDays) and re-expanded on save.
 */
function tiersToLadders(tiers: PtoEntitlementTier[], dayHrs: number): Ladder[] {
  const byCohort = new Map<PtoCohort, PtoEntitlementTier[]>();
  for (const t of tiers) {
    const list = byCohort.get(t.cohort) ?? [];
    list.push(t);
    byCohort.set(t.cohort, list);
  }
  const ladders: Ladder[] = [];
  for (const cohort of COHORT_ORDER) {
    const list = byCohort.get(cohort);
    if (!list || list.length === 0) continue;
    const sorted = [...list].sort((a, b) => a.minYearsOfService - b.minYearsOfService);
    if (STEPPED_COHORTS.has(cohort)) {
      ladders.push({
        cohort,
        kind: "stepped",
        steps: sorted.map((t) => ({
          uid: uniqueId(),
          years: t.minYearsOfService,
          days: round1((t.annualHours || 0) / Math.max(1, dayHrs)),
        })),
      });
      continue;
    }
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    ladders.push({
      kind: "linear",
      cohort,
      startYears: first.minYearsOfService,
      startDays: round1((first.annualHours || 0) / Math.max(1, dayHrs)),
      maxYears: last.minYearsOfService,
      maxDays: round1((last.annualHours || 0) / Math.max(1, dayHrs)),
    });
  }
  return ladders;
}

/** Expand a ladder into per-year tier rows. */
function ladderToTiers(ladder: Ladder, dayHrs: number): DraftTier[] {
  // Stepped: one tier row per explicit breakpoint. The DB picks the
  // highest row with min_years_of_service <= yos, so 1y→5, 2y→10, 5y→15,
  // 10y→20 produces the right entitlement for every year in between.
  if (ladder.kind === "stepped") {
    return ladder.steps.map((s) => ({
      uid: uniqueId(),
      cohort: ladder.cohort,
      minYears: Math.max(0, Math.floor(s.years)),
      annualHours: Math.round(Math.max(0, s.days) * dayHrs * 100) / 100,
    }));
  }

  // Linear: one tier row per year in [startYears, maxYears].
  const startY = Math.max(0, Math.floor(ladder.startYears));
  const maxY = Math.max(startY, Math.floor(ladder.maxYears));
  const startD = Math.max(0, Number(ladder.startDays) || 0);
  const maxD = Math.max(0, Number(ladder.maxDays) || 0);

  if (maxY === startY) {
    return [
      {
        uid: uniqueId(),
        cohort: ladder.cohort,
        minYears: startY,
        annualHours: Math.round(startD * dayHrs * 100) / 100,
      },
    ];
  }

  const span = maxY - startY;
  const step = (maxD - startD) / span;
  const out: DraftTier[] = [];
  for (let i = 0; i <= span; i++) {
    const year = startY + i;
    const days = startD + step * i;
    out.push({
      uid: uniqueId(),
      cohort: ladder.cohort,
      minYears: year,
      annualHours: Math.round(days * dayHrs * 100) / 100,
    });
  }
  return out;
}

function laddersToTiers(ladders: Ladder[], dayHrs: number): DraftTier[] {
  const out: DraftTier[] = [];
  for (const l of ladders) {
    out.push(...ladderToTiers(l, dayHrs));
  }
  return out;
}

/** Default ladder used when adding a new cohort row. */
function defaultLadderForBucket(bucket: PtoBucket, cohort: PtoCohort): Ladder {
  if (bucket === "sick") {
    // Sick is flat across all cohorts: 5 days/yr after 2 years.
    return {
      kind: "linear",
      cohort,
      startYears: 2,
      startDays: 5,
      maxYears: 2,
      maxDays: 5,
    };
  }
  if (cohort === "office") {
    // HR's office vacation policy — exact breakpoints.
    return {
      cohort,
      kind: "stepped",
      steps: [
        { uid: uniqueId(), years: 1, days: 5 },
        { uid: uniqueId(), years: 2, days: 10 },
        { uid: uniqueId(), years: 5, days: 15 },
        { uid: uniqueId(), years: 10, days: 20 },
      ],
    };
  }
  if (cohort === "manager") {
    return {
      kind: "linear",
      cohort,
      startYears: 1,
      startDays: 5,
      maxYears: 6,
      maxDays: 10,
    };
  }
  return {
    kind: "linear",
    cohort,
    startYears: 2,
    startDays: 5,
    maxYears: 7,
    maxDays: 10,
  };
}

function isPositive(n: number | null): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

export function PtoPolicyDrawer({ open, bucket, policy, onClose }: Props) {
  const isVacation = bucket === "vacation";
  const bucketLabel = isVacation ? "Vacation" : "Sick";

  // Shared form state (the single org-wide policy, scoped via the active bucket).
  const [name, setName] = useState(policy.name);
  // Standard day hours and workdays are kept on the row but not edited here —
  // they're operational defaults set once during data setup.
  const standardDayHours = policy.standardDayHours;
  const workDays = policy.workDays;

  // Per-bucket settings.
  const initialBucketSettings = isVacation ? policy.vacation : policy.sick;
  const [unlimited, setUnlimited] = useState<boolean>(
    initialBucketSettings.maxAccrualHours == null,
  );
  const [maxBalance, setMaxBalance] = useState<number>(
    initialBucketSettings.maxAccrualHours ?? 80,
  );
  const [minRequest, setMinRequest] = useState<number | "">(
    initialBucketSettings.minRequestHours ?? "",
  );
  const [maxRequest, setMaxRequest] = useState<number | "">(
    initialBucketSettings.maxRequestHours ?? "",
  );

  // Vacation cash-out (only relevant when bucket = vacation).
  const [cashoutEnabled, setCashoutEnabled] = useState<boolean>(
    policy.vacation.cashoutEnabled,
  );
  const [cashoutDay, setCashoutDay] = useState<number>(policy.vacation.cashoutDay);
  const [cashoutMin, setCashoutMin] = useState<number>(
    policy.vacation.cashoutMinBalanceHours,
  );
  const [janPayoutWindow, setJanPayoutWindow] = useState<number>(
    policy.vacation.januaryPayoutWindowDays,
  );

  // Cohort ladders for this bucket (UI representation; expanded into per-year
  // tiers on save).
  const [ladders, setLadders] = useState<Ladder[]>(() =>
    tiersToLadders(
      isVacation ? policy.vacationTiers : policy.sickTiers,
      policy.standardDayHours,
    ),
  );

  // Re-sync state when drawer opens / bucket switches.
  useEffect(() => {
    if (!open) return;
    setName(policy.name);
    const b = isVacation ? policy.vacation : policy.sick;
    setUnlimited(b.maxAccrualHours == null);
    setMaxBalance(b.maxAccrualHours ?? 80);
    setMinRequest(b.minRequestHours ?? "");
    setMaxRequest(b.maxRequestHours ?? "");
    setCashoutEnabled(policy.vacation.cashoutEnabled);
    setCashoutDay(policy.vacation.cashoutDay);
    setCashoutMin(policy.vacation.cashoutMinBalanceHours);
    setJanPayoutWindow(policy.vacation.januaryPayoutWindowDays);
    setLadders(
      tiersToLadders(
        isVacation ? policy.vacationTiers : policy.sickTiers,
        policy.standardDayHours,
      ),
    );
    setError(null);
  }, [open, bucket, isVacation, policy]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dayHrs = standardDayHours > 0 ? standardDayHours : 8;

  // Which cohorts are allowed for this bucket. Vacation differentiates
  // office / store managers / store employees; sick is flat across the
  // whole company.
  const validForBucket: PtoCohort[] = isVacation
    ? ["office", "manager", "employee"]
    : ["all"];
  const usedCohorts = new Set(ladders.map((l) => l.cohort));
  const addableCohorts: PtoCohort[] = validForBucket.filter(
    (c) => !usedCohorts.has(c),
  );

  function addLadder(cohort: PtoCohort) {
    setLadders((prev) => [...prev, defaultLadderForBucket(bucket, cohort)]);
  }

  // Shape-agnostic merge — works for both linear and stepped ladders.
  function updateLadder(cohort: PtoCohort, patch: Partial<Ladder>) {
    setLadders((prev) =>
      prev.map((l) => (l.cohort === cohort ? ({ ...l, ...patch } as Ladder) : l)),
    );
  }

  function removeLadder(cohort: PtoCohort) {
    setLadders((prev) => prev.filter((l) => l.cohort !== cohort));
  }

  function handleSave() {
    setError(null);

    // Convert form -> server payload, scoped to the active bucket.
    const payload = {
      policyId: policy.id,
      name,
      standardDayHours: dayHrs,
      workDays,
      vacation: {
        maxAccrualHours: isVacation ? (unlimited ? null : Number(maxBalance) || 0) : policy.vacation.maxAccrualHours,
        minRequestHours: isVacation ? (minRequest === "" ? null : Number(minRequest)) : policy.vacation.minRequestHours,
        maxRequestHours: isVacation ? (maxRequest === "" ? null : Number(maxRequest)) : policy.vacation.maxRequestHours,
        cashoutEnabled,
        cashoutDay,
        cashoutMinBalanceHours: cashoutMin,
        januaryPayoutWindowDays: janPayoutWindow,
      },
      sick: {
        maxAccrualHours: !isVacation ? (unlimited ? null : Number(maxBalance) || 0) : policy.sick.maxAccrualHours,
        minRequestHours: !isVacation ? (minRequest === "" ? null : Number(minRequest)) : policy.sick.minRequestHours,
        maxRequestHours: !isVacation ? (maxRequest === "" ? null : Number(maxRequest)) : policy.sick.maxRequestHours,
      },
    };

    startTransition(async () => {
      const a = await updatePtoPolicySettings(payload);
      if (!a.ok) {
        setError(a.error);
        return;
      }

      // Expand ladders into per-year tier rows, then replace.
      const expandedTiers = laddersToTiers(ladders, dayHrs);
      const b = await replaceEntitlementTiers({
        policyId: policy.id,
        bucket,
        tiers: expandedTiers.map((r) => ({
          cohort: r.cohort,
          minYearsOfService: r.minYears,
          annualHours: r.annualHours,
        })),
      });
      if (!b.ok) {
        setError(b.error);
        return;
      }

      onClose();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close policy editor"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="pto-policy-drawer-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Time off policy
            </p>
            <h2
              id="pto-policy-drawer-title"
              className="mt-0.5 text-lg font-semibold text-slate-900"
            >
              {bucketLabel} leave policy
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {/* Policy reminder — short plain-English summary */}
          <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs text-blue-900">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <p className="leading-relaxed">
                {isVacation
                  ? "Each Jan 1, employees earn vacation based on how long they've worked here. Part-time staff get a smaller amount that matches their hours. Anything left at year-end is lost — but employees can ask for a pay-out during January."
                  : "Each year, employees earn sick days based on how long they've worked here. Anything left at year-end is lost."}
              </p>
            </div>
          </div>

          {/* A — Policy name (single field; the rest of "basics" was unused fluff) */}
          <Section title="Policy">
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Full-time employees"
                className={inputCls}
              />
            </Field>
          </Section>

          {/* B — How much leave is earned */}
          <Section
            title="How much leave is earned"
            subtitle={
              isVacation
                ? "Each role earns more days the longer they work here."
                : "How many sick days each role gets per year."
            }
          >
            <div className="space-y-3">
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Part-time staff automatically get a smaller amount that matches their hours.
                Someone working half-time earns half the days listed below.
              </p>

              {ladders.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                  No groups yet — add a cohort below.
                </p>
              ) : null}

              {ladders.map((l) =>
                l.kind === "stepped" ? (
                  <SteppedLadderCard
                    key={l.cohort}
                    ladder={l}
                    onChange={(next) => updateLadder(l.cohort, next)}
                    onRemove={() => removeLadder(l.cohort)}
                  />
                ) : (
                  <LinearLadderCard
                    key={l.cohort}
                    ladder={l}
                    isVacation={isVacation}
                    onChange={(patch) => updateLadder(l.cohort, patch)}
                    onRemove={() => removeLadder(l.cohort)}
                  />
                ),
              )}

              {addableCohorts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {addableCohorts.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => addLadder(c)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add {COHORT_LABEL[c]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Section>

          {/* C — Maximum balance */}
          <Section
            title="Maximum balance"
            subtitle={`The most ${bucketLabel.toLowerCase()} an employee can save up at one time.`}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUnlimited(false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    !unlimited
                      ? "border-orange-300 bg-orange-50 text-orange-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Set a maximum
                </button>
                <button
                  type="button"
                  onClick={() => setUnlimited(true)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    unlimited
                      ? "border-orange-300 bg-orange-50 text-orange-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  No maximum
                </button>
              </div>
              {!unlimited ? (
                <Field label="Most they can save up (hours)">
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={maxBalance}
                    onChange={(e) => setMaxBalance(Math.max(0, Number(e.target.value) || 0))}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    ≈ {((Number(maxBalance) || 0) / dayHrs).toFixed(1)} day
                    {(Number(maxBalance) || 0) / dayHrs === 1 ? "" : "s"}
                  </p>
                </Field>
              ) : null}
            </div>
          </Section>

          {/* D — Pay out unused vacation each month (vacation only) */}
          {isVacation ? (
            <Section
              title="Pay out unused vacation each month"
              subtitle="Automatically pays employees for any unused vacation hours at the start of every month."
            >
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <input
                    type="checkbox"
                    checked={cashoutEnabled}
                    onChange={(e) => setCashoutEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-sm font-semibold text-slate-800">
                    Pay out unused vacation each month
                  </span>
                </label>

                {cashoutEnabled ? (
                  <Field label="Pay-out day of month">
                    <input
                      type="number"
                      min={1}
                      max={28}
                      step={1}
                      value={cashoutDay}
                      onChange={(e) =>
                        setCashoutDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className={inputCls}
                    />
                  </Field>
                ) : null}
              </div>
            </Section>
          ) : null}

          {/* E — Year-end & when employees leave */}
          <Section title={isVacation ? "Year-end and when employees leave" : "Year-end"}>
            <div className="space-y-3">
              <p className="text-[12px] text-slate-600">
                Any unused {isVacation ? "vacation" : "sick"} time at year-end is lost — it does
                not carry into the next year.
              </p>

              {isVacation ? (
                <Field label="Pay-out window (days from Jan 1)">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    step={1}
                    value={janPayoutWindow}
                    onChange={(e) =>
                      setJanPayoutWindow(
                        Math.min(31, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                      )
                    }
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Employees can ask for a pay-out of last year&apos;s unused vacation during the
                    first{" "}
                    <span className="tabular-nums font-semibold text-slate-700">
                      {janPayoutWindow}
                    </span>{" "}
                    day{janPayoutWindow === 1 ? "" : "s"} of January.
                  </p>
                </Field>
              ) : null}

              {isVacation ? (
                <p className="text-[12px] text-slate-600">
                  When an employee leaves: if they resign, are laid off, or retire — their unused
                  vacation is paid out. If they are dismissed for cause — their unused vacation is
                  lost.
                </p>
              ) : null}
            </div>
          </Section>

          {/* F — How long a leave request can be */}
          <Section
            title="How long a leave request can be"
            subtitle="The shortest and longest amount of time off an employee can request at once."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Shortest leave allowed (hours)">
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  value={minRequest}
                  onChange={(e) =>
                    setMinRequest(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))
                  }
                  placeholder="No minimum"
                  className={inputCls}
                />
                {isPositive(typeof minRequest === "number" ? minRequest : null) ? (
                  <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    ≈ {((minRequest as number) / dayHrs).toFixed(2)} day(s)
                  </p>
                ) : null}
              </Field>
              <Field label="Longest leave allowed (hours)">
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  value={maxRequest}
                  onChange={(e) =>
                    setMaxRequest(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))
                  }
                  placeholder="No maximum"
                  className={inputCls}
                />
                {isPositive(typeof maxRequest === "number" ? maxRequest : null) ? (
                  <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    ≈ {((maxRequest as number) / dayHrs).toFixed(2)} day(s)
                  </p>
                ) : null}
              </Field>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex h-10 items-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 px-5 text-sm font-semibold text-white shadow-sm shadow-orange-600/30 hover:from-orange-500 hover:to-orange-700 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save policy"}
          </button>
        </div>
      </aside>
    </div>
  );
}

// ---------- Internal helpers / styles ---------------------------------------

const inputCls =
  "block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 py-5 first:pt-1 last:border-b-0">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function LinearLadderCard({
  ladder,
  isVacation,
  onChange,
  onRemove,
}: {
  ladder: LinearLadder & { kind: "linear" };
  isVacation: boolean;
  onChange: (patch: Partial<LinearLadder & { kind: "linear" }>) => void;
  onRemove: () => void;
}) {
  const span = Math.max(0, Math.floor(ladder.maxYears) - Math.floor(ladder.startYears));
  const stepPerYear = span > 0 ? (ladder.maxDays - ladder.startDays) / span : 0;
  const flat = span === 0 || stepPerYear === 0;
  const Icon = COHORT_ICON[ladder.cohort];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {COHORT_LABEL[ladder.cohort]}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {flat
                ? `${ladder.startDays} day${ladder.startDays === 1 ? "" : "s"} a year after ${ladder.startYears} year${ladder.startYears === 1 ? "" : "s"} of work.`
                : `Starts at ${ladder.startDays} days, grows to ${ladder.maxDays} days a year, +${stepPerYear === 1 ? "1" : stepPerYear.toFixed(2)} day per year between year ${ladder.startYears} and year ${ladder.maxYears}.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          aria-label={`Remove ${COHORT_LABEL[ladder.cohort]}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="After working for"
          suffix="years"
          min={0}
          step={1}
          value={ladder.startYears}
          onChange={(v) => onChange({ startYears: Math.max(0, Math.floor(v)) })}
        />
        <NumberField
          label="Starting days"
          suffix="days/yr"
          min={0}
          step={0.5}
          value={ladder.startDays}
          onChange={(v) => onChange({ startDays: Math.max(0, v) })}
        />
        {isVacation ? (
          <>
            <NumberField
              label="Reaches maximum at"
              suffix="years"
              min={0}
              step={1}
              value={ladder.maxYears}
              onChange={(v) => onChange({ maxYears: Math.max(0, Math.floor(v)) })}
            />
            <NumberField
              label="Maximum days"
              suffix="days/yr"
              min={0}
              step={0.5}
              value={ladder.maxDays}
              onChange={(v) => onChange({ maxDays: Math.max(0, v) })}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Stepped editor for non-linear ladders (currently office vacation).
 * Renders an explicit table of (year, days/yr) breakpoints. The DB
 * picks the highest breakpoint whose `min_years_of_service <= yos`, so
 * an office employee with 4 years of service gets the value from the
 * "After 2 years" row, and at 5 years the value from the "After 5 years"
 * row, etc.
 */
function SteppedLadderCard({
  ladder,
  onChange,
  onRemove,
}: {
  ladder: SteppedLadder;
  onChange: (patch: Partial<SteppedLadder>) => void;
  onRemove: () => void;
}) {
  const Icon = COHORT_ICON[ladder.cohort];
  // Sort copy for display so HR sees breakpoints in service-year order,
  // even if a new row was just appended out-of-order.
  const sortedSteps = [...ladder.steps].sort((a, b) => a.years - b.years);

  function updateStep(uid: string, patch: { years?: number; days?: number }) {
    onChange({
      steps: ladder.steps.map((s) =>
        s.uid === uid
          ? {
              ...s,
              years: patch.years != null ? Math.max(0, Math.floor(patch.years)) : s.years,
              days: patch.days != null ? Math.max(0, patch.days) : s.days,
            }
          : s,
      ),
    });
  }

  function addStep() {
    const lastYear = sortedSteps.length
      ? sortedSteps[sortedSteps.length - 1].years
      : 0;
    const lastDays = sortedSteps.length
      ? sortedSteps[sortedSteps.length - 1].days
      : 5;
    onChange({
      steps: [
        ...ladder.steps,
        { uid: uniqueId(), years: lastYear + 1, days: lastDays },
      ],
    });
  }

  function removeStep(uid: string) {
    if (ladder.steps.length <= 1) return; // keep at least one row
    onChange({ steps: ladder.steps.filter((s) => s.uid !== uid) });
  }

  return (
    <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {COHORT_LABEL[ladder.cohort]}
              </p>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200/80">
                Custom steps
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              {COHORT_BLURB[ladder.cohort]}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          aria-label={`Remove ${COHORT_LABEL[ladder.cohort]}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>After working for</span>
          <span>Receives</span>
          <span className="w-8" aria-hidden />
        </div>
        {sortedSteps.map((s) => (
          <div
            key={s.uid}
            className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={s.years}
                onChange={(e) => updateStep(s.uid, { years: Number(e.target.value) || 0 })}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 tabular-nums focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                aria-label="Years of service"
              />
              <span className="shrink-0 text-[11px] text-slate-500">yr</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={0.5}
                value={s.days}
                onChange={(e) => updateStep(s.uid, { days: Number(e.target.value) || 0 })}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 tabular-nums focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                aria-label="Days per year"
              />
              <span className="shrink-0 text-[11px] text-slate-500">days/yr</span>
            </div>
            <button
              type="button"
              onClick={() => removeStep(s.uid)}
              disabled={ladder.steps.length <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              aria-label="Remove breakpoint"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addStep}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-400 hover:bg-amber-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add breakpoint
        </button>
      </div>

      <p className="mt-3 rounded-md border border-amber-200/70 bg-amber-50/70 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900">
        Each row says &ldquo;after working <strong>this many years</strong>, the
        employee receives <strong>this many days</strong> per year.&rdquo; The
        value stays the same until the next breakpoint is reached.
      </p>
    </div>
  );
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={inputCls}
        />
        <span className="shrink-0 text-[11px] text-slate-500">{suffix}</span>
      </div>
    </div>
  );
}
