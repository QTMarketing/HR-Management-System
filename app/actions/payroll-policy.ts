"use server";

/**
 * Track C — server actions for the global payroll policy (PTO Admin → Payroll
 * & OT Rules card). Owner-only. Writes go through Supabase + RLS so the same
 * gate applies even if the action is invoked outside the app.
 */

import { revalidatePath } from "next/cache";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getGlobalPayrollPolicy,
  type PayrollPolicyRow,
} from "@/lib/payroll/policy";

export type UpdateGlobalPayrollPolicyInput = {
  weeklyOtThreshold: number;
  /** `null` clears any daily-OT rule; `0` is rejected as invalid. */
  dailyOtThreshold: number | null;
  otMultiplier: number;
};

export type UpdateGlobalPayrollPolicyResult =
  | { ok: true; row: PayrollPolicyRow }
  | { ok: false; error: string };

function validate(input: UpdateGlobalPayrollPolicyInput): string | null {
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

/**
 * Update (or upsert) the **global** payroll policy. Store-specific overrides
 * live in the same table but aren't editable from this UI yet.
 */
export async function updateGlobalPayrollPolicy(
  input: UpdateGlobalPayrollPolicyInput,
): Promise<UpdateGlobalPayrollPolicyResult> {
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

  const before = await getGlobalPayrollPolicy(supabase);

  // Migration 070 seeds a global row, but be defensive in case it hasn't run
  // (or someone deleted it manually) — we'll insert one then.
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
    const u = updated as PayrollPolicyRow;
    row = {
      id: u.id,
      location_id: u.location_id,
      weekly_ot_threshold: Number(u.weekly_ot_threshold),
      daily_ot_threshold:
        u.daily_ot_threshold === null ? null : Number(u.daily_ot_threshold),
      ot_multiplier: Number(u.ot_multiplier),
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("payroll_policies")
      .insert({
        location_id: null,
        weekly_ot_threshold: input.weeklyOtThreshold,
        daily_ot_threshold: input.dailyOtThreshold,
        ot_multiplier: input.otMultiplier,
      })
      .select("id, location_id, weekly_ot_threshold, daily_ot_threshold, ot_multiplier, created_at, updated_at")
      .maybeSingle();
    if (insErr) return { ok: false, error: insErr.message };
    if (!inserted) return { ok: false, error: "Could not create payroll policy." };
    const u = inserted as PayrollPolicyRow;
    row = {
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

  const actorId = await resolveActorEmployeeId(supabase);
  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.PAYROLL_POLICY_UPDATED,
    metadata: {
      payroll_policy_id: row.id,
      scope: "global",
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

  // OT math affects the timesheet panel + payroll CSV, so blow those caches.
  revalidatePath("/pto-admin");
  revalidatePath("/time-clock");

  return { ok: true, row };
}
