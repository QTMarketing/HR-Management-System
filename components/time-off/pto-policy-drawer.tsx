"use client";

import { Info, Plus, Trash2, X } from "lucide-react";
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

type Ladder = {
  cohort: PtoCohort;
  startYears: number; // earliest year of service that earns leave
  startDays: number; // days/year at startYears
  maxYears: number; // year where leave reaches its maximum
  maxDays: number; // days/year at maxYears
};

const COHORT_LABEL: Record<PtoCohort, string> = {
  employee: "Employees",
  manager: "Managers",
  all: "All staff",
};
const COHORT_ORDER: ReadonlyArray<PtoCohort> = ["manager", "employee", "all"];

function uniqueId(): string {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
}

/** Reduce a list of per-year tiers into one ladder per cohort. */
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
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const round1 = (n: number) => Math.round(n * 10) / 10;
    ladders.push({
      cohort,
      startYears: first.minYearsOfService,
      startDays: round1((first.annualHours || 0) / Math.max(1, dayHrs)),
      maxYears: last.minYearsOfService,
      maxDays: round1((last.annualHours || 0) / Math.max(1, dayHrs)),
    });
  }
  return ladders;
}

/** Expand a ladder into per-year tiers (linear, +step / year). */
function ladderToTiers(ladder: Ladder, dayHrs: number): DraftTier[] {
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
    return { cohort, startYears: 2, startDays: 5, maxYears: 2, maxDays: 5 };
  }
  if (cohort === "manager") {
    return { cohort, startYears: 1, startDays: 5, maxYears: 6, maxDays: 10 };
  }
  return { cohort, startYears: 2, startDays: 5, maxYears: 7, maxDays: 10 };
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

  // Cohorts not yet present in the ladder list (so we know which can be added).
  const usedCohorts = new Set(ladders.map((l) => l.cohort));
  const addableCohorts: PtoCohort[] = COHORT_ORDER.filter(
    (c) => !usedCohorts.has(c),
  );

  function addLadder(cohort: PtoCohort) {
    setLadders((prev) => [...prev, defaultLadderForBucket(bucket, cohort)]);
  }

  function updateLadder(cohort: PtoCohort, patch: Partial<Ladder>) {
    setLadders((prev) => prev.map((l) => (l.cohort === cohort ? { ...l, ...patch } : l)));
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

              {ladders.map((l) => (
                <LadderCard
                  key={l.cohort}
                  ladder={l}
                  isVacation={isVacation}
                  onChange={(patch) => updateLadder(l.cohort, patch)}
                  onRemove={() => removeLadder(l.cohort)}
                />
              ))}

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

function LadderCard({
  ladder,
  isVacation,
  onChange,
  onRemove,
}: {
  ladder: Ladder;
  isVacation: boolean;
  onChange: (patch: Partial<Ladder>) => void;
  onRemove: () => void;
}) {
  const span = Math.max(0, Math.floor(ladder.maxYears) - Math.floor(ladder.startYears));
  const stepPerYear = span > 0 ? (ladder.maxDays - ladder.startDays) / span : 0;
  const flat = span === 0 || stepPerYear === 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{COHORT_LABEL[ladder.cohort]}</p>
          <p className="text-[11px] text-slate-500">
            {flat
              ? `${ladder.startDays} day${ladder.startDays === 1 ? "" : "s"} a year after ${ladder.startYears} year${ladder.startYears === 1 ? "" : "s"} of work.`
              : `Starts at ${ladder.startDays} days, grows to ${ladder.maxDays} days a year, +${stepPerYear === 1 ? "1" : stepPerYear.toFixed(2)} day per year between year ${ladder.startYears} and year ${ladder.maxYears}.`}
          </p>
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
