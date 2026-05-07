/**
 * Track C — payroll policy lookup helpers.
 *
 * Server-only. Reads `payroll_policies` and resolves the active policy for a
 * given location: store-specific row wins, otherwise the global (`location_id
 * IS NULL`) row. Used by:
 *   - the timesheet panel data loader (per-clock policy)
 *   - the unified payroll CSV builder
 *   - the PTO Admin "Payroll & OT Rules" form (read + write)
 *
 * Postgres `numeric` columns come back from supabase-js as strings, so we
 * coerce defensively before handing values off to `resolvePayrollPolicy`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PAYROLL_POLICY,
  resolvePayrollPolicy,
  type PayrollPolicy,
} from "@/lib/payroll/payable-hours";

/** Shape of a single `payroll_policies` row, decoupled from generated DB types. */
export type PayrollPolicyRow = {
  id: string;
  location_id: string | null;
  weekly_ot_threshold: number;
  daily_ot_threshold: number | null;
  ot_multiplier: number;
  created_at?: string;
  updated_at?: string;
};

/** Raw select projection — `numeric` lands as `string | number | null`. */
type RawRow = {
  id: string;
  location_id: string | null;
  weekly_ot_threshold: number | string | null;
  daily_ot_threshold: number | string | null;
  ot_multiplier: number | string | null;
  created_at?: string;
  updated_at?: string;
};

function toNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce a raw DB row (numeric-as-string tolerated) into a typed policy row. */
export function normalizePayrollPolicyRow(raw: RawRow): PayrollPolicyRow {
  return {
    id: raw.id,
    location_id: raw.location_id,
    weekly_ot_threshold:
      toNumberOrNull(raw.weekly_ot_threshold) ?? DEFAULT_PAYROLL_POLICY.weeklyOtThreshold,
    daily_ot_threshold: toNumberOrNull(raw.daily_ot_threshold),
    ot_multiplier:
      toNumberOrNull(raw.ot_multiplier) ?? DEFAULT_PAYROLL_POLICY.otMultiplier,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/** DB row → runtime `PayrollPolicy` object. */
export function policyFromRow(row: PayrollPolicyRow): PayrollPolicy {
  return resolvePayrollPolicy({
    weeklyOtThreshold: row.weekly_ot_threshold,
    dailyOtThreshold: row.daily_ot_threshold,
    otMultiplier: row.ot_multiplier,
  });
}

/**
 * Fetch the active OT policy for a given location.
 *
 * Resolution order:
 *   1. The store-specific row (`location_id = locationId`), if `locationId` is set.
 *   2. The global row (`location_id IS NULL`).
 *   3. `DEFAULT_PAYROLL_POLICY` as a last-resort code-side fallback.
 *
 * Always returns a usable policy — never throws.
 */
export async function getActivePayrollPolicy(
  supabase: SupabaseClient,
  locationId: string | null,
): Promise<{ policy: PayrollPolicy; source: "location" | "global" | "fallback"; row: PayrollPolicyRow | null }> {
  // Pull both candidate rows in one round-trip — RLS handles auth.
  const orFilter = locationId
    ? `location_id.eq.${locationId},location_id.is.null`
    : `location_id.is.null`;

  const { data, error } = await supabase
    .from("payroll_policies")
    .select("id, location_id, weekly_ot_threshold, daily_ot_threshold, ot_multiplier, created_at, updated_at")
    .or(orFilter);

  if (error || !data || data.length === 0) {
    return { policy: DEFAULT_PAYROLL_POLICY, source: "fallback", row: null };
  }

  const rows = data.map((r) => normalizePayrollPolicyRow(r as RawRow));

  if (locationId) {
    const specific = rows.find((r) => r.location_id === locationId);
    if (specific) {
      return { policy: policyFromRow(specific), source: "location", row: specific };
    }
  }

  const global = rows.find((r) => r.location_id === null);
  if (global) {
    return { policy: policyFromRow(global), source: "global", row: global };
  }

  return { policy: DEFAULT_PAYROLL_POLICY, source: "fallback", row: null };
}

/** Fetch ALL policies (global + every store). Used by the admin settings page. */
export async function listPayrollPolicies(
  supabase: SupabaseClient,
): Promise<PayrollPolicyRow[]> {
  const { data, error } = await supabase
    .from("payroll_policies")
    .select("id, location_id, weekly_ot_threshold, daily_ot_threshold, ot_multiplier, created_at, updated_at")
    .order("location_id", { ascending: true, nullsFirst: true });

  if (error || !data) return [];
  return data.map((r) => normalizePayrollPolicyRow(r as RawRow));
}

/** Read just the global row (creates none if missing — migration 070 seeds it). */
export async function getGlobalPayrollPolicy(
  supabase: SupabaseClient,
): Promise<PayrollPolicyRow | null> {
  const { data, error } = await supabase
    .from("payroll_policies")
    .select("id, location_id, weekly_ot_threshold, daily_ot_threshold, ot_multiplier, created_at, updated_at")
    .is("location_id", null)
    .maybeSingle();

  if (error || !data) return null;
  return normalizePayrollPolicyRow(data as RawRow);
}
