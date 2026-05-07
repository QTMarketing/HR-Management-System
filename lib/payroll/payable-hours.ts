/**
 * Track A — Payable hours rollup.
 *
 * Single source of truth for: "given the punches, breaks, holidays, and approved
 * PTO for one employee in a pay period, how many hours do we owe them and at
 * what rate?". Returns a *Loud Fallback* signal so the UI can scream when no
 * real wage is on file.
 *
 * Inputs are pre-computed minutes/hours so this stays Postgres-free, easy to
 * unit test, and reusable from any context (server action, RSC, route handler).
 *
 * Hard rule: never silently substitute a wage. If `hourly_rate` is null/0/NaN,
 * we drop to DEMO_FALLBACK_HOURLY_RATE *and* set `isUsingFallbackRate = true`
 * so callers can render the warning.
 */

/** Marked, deliberately round demo rate. Do NOT change without updating the UI badge copy. */
export const DEMO_FALLBACK_HOURLY_RATE = 15;

/** What an HR system shows next to the money so no one ships it as real payroll. */
export const DEMO_FALLBACK_BADGE_LABEL = "⚠️ DEMO RATE — UPDATE IN PROFILE";

/** Federal FLSA default. Used as the seed default for `payroll_policies.weekly_ot_threshold`. */
export const DEFAULT_WEEKLY_OT_THRESHOLD_HOURS = 40;

/** Time-and-a-half. Used as the seed default for `payroll_policies.ot_multiplier`. */
export const OVERTIME_RATE_MULTIPLIER = 1.5;

/**
 * Track C — runtime shape of a `payroll_policies` row, decoupled from any
 * Supabase-generated type so this file stays pure/portable.
 *
 * `weeklyOtThreshold` and `otMultiplier` are required at runtime because we
 * always seed a global row in migration 070. `dailyOtThreshold` stays nullable
 * (e.g. CA 8h is opt-in).
 */
export type PayrollPolicy = {
  /** Hours of *worked* time per week above which excess is OT-eligible. */
  weeklyOtThreshold: number;
  /** Optional daily threshold (e.g. CA 8h). NULL = no daily OT. */
  dailyOtThreshold: number | null;
  /** Multiplier applied to OT hours. Default 1.5x. */
  otMultiplier: number;
};

/** Hard fallback policy used when no DB row is in scope (defensive only). */
export const DEFAULT_PAYROLL_POLICY: PayrollPolicy = {
  weeklyOtThreshold: DEFAULT_WEEKLY_OT_THRESHOLD_HOURS,
  dailyOtThreshold: null,
  otMultiplier: OVERTIME_RATE_MULTIPLIER,
};

export type PayableHoursInput = {
  /**
   * Net worked minutes for the period — already minus unpaid breaks. (Use
   * `EnrichedPunchRow.workedMinutes` summed across the period.)
   */
  workedMinutes: number;
  /** Approved paid time off hours overlapping the period (PTO + Sick, not "Unpaid leave"). */
  approvedPtoHours: number;
  /** Paid holiday hours auto-credited for the period (e.g. store closed = 8h). */
  paidHolidayHours: number;
  /**
   * Wage from `employees.hourly_rate`. Null/undefined/0 trips the loud fallback.
   * Negative values are clamped to 0 then treated as missing (also trips fallback).
   */
  hourlyRate: number | null | undefined;
  /**
   * Per-clock / per-location OT policy resolved from `payroll_policies`. When
   * omitted, falls back to `DEFAULT_PAYROLL_POLICY` (FLSA 40h @ 1.5x). Only
   * `workedHours` count toward thresholds — PTO and paid holidays never push
   * someone into overtime.
   */
  policy?: Partial<PayrollPolicy> | null;
  /**
   * @deprecated Use `policy.weeklyOtThreshold`. Kept temporarily for any
   * caller that still passes the scalar; will be removed once all sites
   * migrate.
   */
  weeklyOtThreshold?: number;
};

export type PayableHoursResult = {
  /** workedMinutes -> hours, rounded to 0.01h. */
  workedHours: number;
  /** min(workedHours, threshold). Worked-only — does NOT include PTO/holiday. */
  regularHours: number;
  /** max(0, workedHours - threshold). Paid at 1.5x. */
  overtimeHours: number;
  /** Pass-through for the breakdown UI. */
  approvedPtoHours: number;
  paidHolidayHours: number;
  /** regularHours + overtimeHours + approvedPtoHours + paidHolidayHours, rounded to 0.01h. */
  totalPayableHours: number;
  /** What we actually multiplied by — the real rate or the DEMO fallback. */
  hourlyRate: number;
  /** When true, the UI MUST render a `DEMO RATE` warning badge next to the money. */
  isUsingFallbackRate: boolean;
  /** Threshold actually applied (after defaulting). Useful for the UI to show "(over 40h/wk)". */
  weeklyOtThreshold: number;
  /** Multiplier actually applied (typically 1.5). Surfaced for UI tooltip math. */
  otMultiplier: number;
  /** (regular + PTO + holiday) * rate, rounded to 0.01. */
  estimatedRegularPay: number;
  /** overtime * rate * otMultiplier, rounded to 0.01. */
  estimatedOvertimePay: number;
  /** estimatedRegularPay + estimatedOvertimePay, rounded to 0.01. */
  estimatedGrossPay: number;
};

/** Round to 2 decimals without floating-point fuzz like 24.299999999999997. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Sanitize a rate input. Returns `{ rate, isFallback }`. */
function resolveHourlyRate(raw: number | null | undefined): { rate: number; isFallback: boolean } {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return { rate: DEMO_FALLBACK_HOURLY_RATE, isFallback: true };
  }
  return { rate: raw, isFallback: false };
}

/**
 * Coerce a partial policy override into a runtime policy with no holes. Bad
 * or missing values fall back to `DEFAULT_PAYROLL_POLICY`. Use the fetch
 * helper in `lib/payroll/policy.ts` for raw DB rows (it handles Postgres
 * `numeric` strings before calling this).
 */
export function resolvePayrollPolicy(
  source: Partial<PayrollPolicy> | null | undefined,
): PayrollPolicy {
  const weeklyRaw = source?.weeklyOtThreshold;
  const dailyRaw = source?.dailyOtThreshold;
  const multRaw = source?.otMultiplier;

  const weekly =
    typeof weeklyRaw === "number" && Number.isFinite(weeklyRaw) && weeklyRaw >= 0
      ? weeklyRaw
      : DEFAULT_PAYROLL_POLICY.weeklyOtThreshold;

  let daily: number | null;
  if (dailyRaw === null || dailyRaw === undefined) {
    daily = null;
  } else if (typeof dailyRaw === "number" && Number.isFinite(dailyRaw) && dailyRaw > 0) {
    daily = dailyRaw;
  } else {
    daily = null;
  }

  const mult =
    typeof multRaw === "number" && Number.isFinite(multRaw) && multRaw >= 1
      ? multRaw
      : DEFAULT_PAYROLL_POLICY.otMultiplier;

  return { weeklyOtThreshold: weekly, dailyOtThreshold: daily, otMultiplier: mult };
}

/**
 * Compute total payable hours and an estimated gross pay for one employee in
 * one pay period. The function is pure — caller pre-rolls the inputs.
 *
 * @example
 * ```ts
 * const r = calculatePayableHours({
 *   workedMinutes: 2400, // 40h
 *   approvedPtoHours: 8,
 *   paidHolidayHours: 0,
 *   hourlyRate: emp.hourly_rate,
 * });
 * if (r.isUsingFallbackRate) showDemoBadge();
 * ```
 */
export function calculatePayableHours(input: PayableHoursInput): PayableHoursResult {
  const workedMinutes = Math.max(0, Number.isFinite(input.workedMinutes) ? input.workedMinutes : 0);
  const approvedPtoHours = Math.max(
    0,
    Number.isFinite(input.approvedPtoHours) ? input.approvedPtoHours : 0,
  );
  const paidHolidayHours = Math.max(
    0,
    Number.isFinite(input.paidHolidayHours) ? input.paidHolidayHours : 0,
  );

  // Resolve the active policy: explicit `policy` arg wins, with the legacy
  // scalar `weeklyOtThreshold` patched on top for any straggler call sites.
  const policy = resolvePayrollPolicy({
    ...(input.policy ?? {}),
    ...(typeof input.weeklyOtThreshold === "number"
      ? { weeklyOtThreshold: input.weeklyOtThreshold }
      : {}),
  });
  const { weeklyOtThreshold, otMultiplier } = policy;

  const workedHours = round2(workedMinutes / 60);

  // CRITICAL: only worked hours count toward the OT threshold. PTO and paid
  // holidays must never push someone into overtime — that's the FLSA rule and
  // the bug we're explicitly trying to prevent.
  const regularHours = round2(Math.min(workedHours, weeklyOtThreshold));
  const overtimeHours = round2(Math.max(0, workedHours - weeklyOtThreshold));

  const totalPayableHours = round2(
    regularHours + overtimeHours + approvedPtoHours + paidHolidayHours,
  );

  const { rate, isFallback } = resolveHourlyRate(input.hourlyRate);

  // Regular pay covers reg-rate buckets: regular worked + PTO + holiday.
  // Overtime pay multiplies only the OT-worked bucket by the policy multiplier.
  const estimatedRegularPay = round2(
    (regularHours + approvedPtoHours + paidHolidayHours) * rate,
  );
  const estimatedOvertimePay = round2(overtimeHours * rate * otMultiplier);
  const estimatedGrossPay = round2(estimatedRegularPay + estimatedOvertimePay);

  return {
    workedHours,
    regularHours,
    overtimeHours,
    approvedPtoHours: round2(approvedPtoHours),
    paidHolidayHours: round2(paidHolidayHours),
    totalPayableHours,
    hourlyRate: rate,
    isUsingFallbackRate: isFallback,
    weeklyOtThreshold,
    otMultiplier,
    estimatedRegularPay,
    estimatedOvertimePay,
    estimatedGrossPay,
  };
}

/**
 * Aggregate of per-employee results. Useful for the period summary strip
 * ("12 employees · 480h payable · $7,200 gross · 4 on demo rate").
 */
export type PayableHoursSummary = {
  employeeCount: number;
  totalPayableHours: number;
  /** Sum of regular (reg + PTO + holiday) hours across employees. */
  regularHours: number;
  /** Sum of overtime hours across employees. */
  overtimeHours: number;
  estimatedGrossPay: number;
  estimatedRegularPay: number;
  estimatedOvertimePay: number;
  /** How many employees in the rollup are still on the demo fallback rate. */
  employeesOnFallbackRate: number;
  /** How many employees crossed the OT threshold this period. */
  employeesWithOvertime: number;
};

export function summarizePayableHours(rows: PayableHoursResult[]): PayableHoursSummary {
  let totalPayableHours = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let estimatedGrossPay = 0;
  let estimatedRegularPay = 0;
  let estimatedOvertimePay = 0;
  let employeesOnFallbackRate = 0;
  let employeesWithOvertime = 0;
  for (const r of rows) {
    totalPayableHours += r.totalPayableHours;
    regularHours += r.regularHours;
    overtimeHours += r.overtimeHours;
    estimatedGrossPay += r.estimatedGrossPay;
    estimatedRegularPay += r.estimatedRegularPay;
    estimatedOvertimePay += r.estimatedOvertimePay;
    if (r.isUsingFallbackRate) employeesOnFallbackRate += 1;
    if (r.overtimeHours > 0) employeesWithOvertime += 1;
  }
  return {
    employeeCount: rows.length,
    totalPayableHours: round2(totalPayableHours),
    regularHours: round2(regularHours),
    overtimeHours: round2(overtimeHours),
    estimatedGrossPay: round2(estimatedGrossPay),
    estimatedRegularPay: round2(estimatedRegularPay),
    estimatedOvertimePay: round2(estimatedOvertimePay),
    employeesOnFallbackRate,
    employeesWithOvertime,
  };
}

/** "12h 30m" — convenience for the few UI spots that prefer hours+minutes over decimal hours. */
export function formatPayableHoursLabel(totalHours: number): string {
  const safe = Math.max(0, Number.isFinite(totalHours) ? totalHours : 0);
  const h = Math.floor(safe);
  const m = Math.round((safe - h) * 60);
  if (m === 60) return `${h + 1}h 0m`;
  return `${h}h ${m}m`;
}

/** "$1,234.56" — locale-agnostic for now (en-US). Swap to org currency when we model it. */
export function formatGrossPayLabel(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
