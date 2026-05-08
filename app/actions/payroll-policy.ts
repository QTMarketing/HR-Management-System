"use server";

/**
 * Track C — server actions for the payroll policy table.
 *
 * Two scopes share one table (`payroll_policies`):
 *   - `location_id IS NULL` → the global default (org-wide).
 *   - `location_id = <uuid>` → store-specific override.
 *
 * The `lib/payroll/payable-hours.ts` calculator and the unified payroll CSV
 * already resolve "specific row wins, otherwise global". This module exposes:
 *   - `updatePayrollPolicy({ locationId, ... })` — internal generic upsert.
 *   - `updateGlobalPayrollPolicy({...})` — legacy wrapper for the global row
 *     (kept stable so existing imports don't break).
 *   - `saveLocationPayrollPolicy(locationId, policyData)` — admin form save.
 *   - `getLocationPayrollPolicy(locationId)` — admin form load (falls back
 *     to the global row if no override yet, with a `source` discriminator).
 *
 * Owner-only writes via RLS + RBAC. Reads are open to authenticated users.
 */

import { revalidatePath, updateTag } from "next/cache";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import { PAYROLL_POLICIES_TAG, payrollPolicyTag } from "@/lib/cache/tags";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getGlobalPayrollPolicy,
  getLocationPayrollPolicyRow,
  type PayrollPolicyRow,
} from "@/lib/payroll/policy";

export type PayrollPolicyInput = {
  weeklyOtThreshold: number;
  /** `null` clears any daily-OT rule; `0` is rejected as invalid. */
  dailyOtThreshold: number | null;
  otMultiplier: number;
};

export type UpdatePayrollPolicyResult =
  | { ok: true; row: PayrollPolicyRow }
  | { ok: false; error: string };

/** Backwards-compatible alias kept for callers that already imported it. */
export type UpdateGlobalPayrollPolicyInput = PayrollPolicyInput;
export type UpdateGlobalPayrollPolicyResult = UpdatePayrollPolicyResult;

function validate(input: PayrollPolicyInput): string | null {
  if (
    typeof input.weeklyOtThreshold !== "number" ||
    !Number.isFinite(input.weeklyOtThreshold) ||
    input.weeklyOtThreshold < 0
  ) {
    return "Weekly OT threshold must be a non-negative number.";
  }
  if (input.weeklyOtThreshold > 168) {
    return "Weekly OT threshold can't exceed 168 hours (one full week).";
  }
  if (input.dailyOtThreshold !== null) {
    if (
      typeof input.dailyOtThreshold !== "number" ||
      !Number.isFinite(input.dailyOtThreshold) ||
      input.dailyOtThreshold <= 0
    ) {
      return "Daily OT threshold must be a positive number, or leave it blank to disable.";
    }
    if (input.dailyOtThreshold > 24) {
      return "Daily OT threshold can't exceed 24 hours.";
    }
  }
  if (
    typeof input.otMultiplier !== "number" ||
    !Number.isFinite(input.otMultiplier) ||
    input.otMultiplier < 1
  ) {
    return "OT multiplier must be 1.0 or greater (e.g. 1.5 for time-and-a-half).";
  }
  if (input.otMultiplier > 5) {
    return "OT multiplier above 5x looks like a typo — double-check the value.";
  }
  return null;
}

function rowFromDbResponse(u: PayrollPolicyRow): PayrollPolicyRow {
  return {
    id: u.id,
    location_id: u.location_id,
    weekly_ot_threshold: Number(u.weekly_ot_threshold),
    daily_ot_threshold:
      u.daily_ot_threshold === null ? null : Number(u.daily_ot_threshold),
    ot_multiplier: Number(u.ot_multiplier),
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

/**
 * Upsert a payroll policy for either the global scope (`locationId === null`)
 * or a specific store. Owner-only.
 */
export async function updatePayrollPolicy(
  input: PayrollPolicyInput & { locationId: string | null },
): Promise<UpdatePayrollPolicyResult> {
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return { ok: false, error: "Only Organization Owners can edit payroll rules." };
  }

  const locationId = input.locationId ? input.locationId.trim() : null;

  // If a location was passed, sanity-check it exists. Doing this *before*
  // the upsert gives a much clearer error than a generic FK violation.
  if (locationId) {
    const { data: locRow, error: locErr } = await supabase
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .maybeSingle();
    if (locErr) return { ok: false, error: locErr.message };
    if (!locRow) return { ok: false, error: "Selected location not found." };
  }

  const before = locationId
    ? await getLocationPayrollPolicyRow(supabase, locationId)
    : await getGlobalPayrollPolicy(supabase);

  let row: PayrollPolicyRow | null = null;

  if (before) {
    const { data: updated, error: upErr } = await supabase
      .from("payroll_policies")
      .update({
        weekly_ot_threshold: input.weeklyOtThreshold,
        daily_ot_threshold: input.dailyOtThreshold,
        ot_multiplier: input.otMultiplier,
      })
      .eq("id", before.id)
      .select("id, location_id, weekly_ot_threshold, daily_ot_threshold, ot_multiplier, created_at, updated_at")
      .maybeSingle();
    if (upErr) return { ok: false, error: upErr.message };
    if (!updated) return { ok: false, error: "Could not update payroll policy." };
    row = rowFromDbResponse(updated as PayrollPolicyRow);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("payroll_policies")
      .insert({
        location_id: locationId,
        weekly_ot_threshold: input.weeklyOtThreshold,
        daily_ot_threshold: input.dailyOtThreshold,
        ot_multiplier: input.otMultiplier,
      })
      .select("id, location_id, weekly_ot_threshold, daily_ot_threshold, ot_multiplier, created_at, updated_at")
      .maybeSingle();
    if (insErr) return { ok: false, error: insErr.message };
    if (!inserted) return { ok: false, error: "Could not create payroll policy." };
    row = rowFromDbResponse(inserted as PayrollPolicyRow);
  }

  const actorId = await resolveActorEmployeeId(supabase);
  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.PAYROLL_POLICY_UPDATED,
    locationId: locationId ?? null,
    metadata: {
      payroll_policy_id: row.id,
      scope: locationId ? "location" : "global",
      location_id: locationId ?? null,
      before: before
        ? {
            weekly_ot_threshold: before.weekly_ot_threshold,
            daily_ot_threshold: before.daily_ot_threshold,
            ot_multiplier: before.ot_multiplier,
          }
        : null,
      after: {
        weekly_ot_threshold: row.weekly_ot_threshold,
        daily_ot_threshold: row.daily_ot_threshold,
        ot_multiplier: row.ot_multiplier,
      },
    },
  });

  revalidatePath("/pto-admin");
  revalidatePath("/time-clock");
  // Tag-based fan-out: invalidate the specific scope (location row or
  // global) and the broad "all policies" bucket so any cached payroll
  // calculator picks up the new threshold instantly. Critical when a
  // global rule changes — every store needs to see the new OT cap.
  updateTag(payrollPolicyTag(locationId));
  updateTag(PAYROLL_POLICIES_TAG);

  return { ok: true, row };
}

/** Backwards-compatible: update the global (`location_id IS NULL`) row. */
export async function updateGlobalPayrollPolicy(
  input: PayrollPolicyInput,
): Promise<UpdatePayrollPolicyResult> {
  return updatePayrollPolicy({ ...input, locationId: null });
}

/** Save a per-location payroll policy override (owner-only). */
export async function saveLocationPayrollPolicy(
  locationId: string,
  policyData: PayrollPolicyInput,
): Promise<UpdatePayrollPolicyResult> {
  const id = locationId?.trim();
  if (!id) return { ok: false, error: "Missing location id." };
  return updatePayrollPolicy({ ...policyData, locationId: id });
}

export type LocationPolicyResult =
  | {
      ok: true;
      /** "location" = explicit override exists; "global" = falling back. */
      source: "location" | "global" | "fallback";
      row: PayrollPolicyRow | null;
    }
  | { ok: false; error: string };

/**
 * Load the policy for a specific location. If no override exists, falls back
 * to the global row so the admin form has sensible starting values when the
 * user picks a fresh location.
 */
export async function getLocationPayrollPolicy(
  locationId: string,
): Promise<LocationPolicyResult> {
  const id = locationId?.trim();
  if (!id) return { ok: false, error: "Missing location id." };

  const supabase = await createSupabaseServerClient();
  const specific = await getLocationPayrollPolicyRow(supabase, id);
  if (specific) return { ok: true, source: "location", row: specific };

  const global = await getGlobalPayrollPolicy(supabase);
  if (global) return { ok: true, source: "global", row: global };

  return { ok: true, source: "fallback", row: null };
}
