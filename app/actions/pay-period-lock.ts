"use server";

import { revalidatePath } from "next/cache";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PayPeriodLockResult = { ok: true; id: string } | { ok: false; error: string };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

async function gateOwner(): Promise<{ supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; actorId: string | null } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return { ok: false, error: "Only Organization Owners can lock or unlock pay periods." };
  }
  const actorId = await resolveActorEmployeeId(supabase);
  return { supabase, actorId };
}

function validateInputs(timeClockId: string, startDateYmd: string, endDateYmd: string): string | null {
  if (!timeClockId?.trim()) return "Missing time clock.";
  if (!YMD_RE.test(startDateYmd)) return "Invalid start date.";
  if (!YMD_RE.test(endDateYmd)) return "Invalid end date.";
  if (endDateYmd < startDateYmd) return "End date must be on or after start date.";
  return null;
}

/**
 * Lock a pay period. Idempotent — calling on an already-locked period is a no-op (returns ok).
 *
 * After this returns, the database trigger blocks any insert/update/delete on
 * `time_entries` whose `clock_in_at` falls between `startDateYmd` and `endDateYmd`
 * for this `time_clock_id`. Unlocking is the only way back.
 */
export async function lockPayPeriod(input: {
  timeClockId: string;
  startDateYmd: string;
  endDateYmd: string;
}): Promise<PayPeriodLockResult> {
  const err = validateInputs(input.timeClockId, input.startDateYmd, input.endDateYmd);
  if (err) return { ok: false, error: err };

  const gate = await gateOwner();
  if ("ok" in gate && gate.ok === false) return gate;
  const { supabase, actorId } = gate as Exclude<typeof gate, { ok: false; error: string }>;

  const now = new Date().toISOString();

  // Upsert: one row per (time_clock_id, start_date, end_date).
  const { data: existing, error: lookupErr } = await supabase
    .from("pay_periods")
    .select("id, status")
    .eq("time_clock_id", input.timeClockId)
    .eq("start_date", input.startDateYmd)
    .eq("end_date", input.endDateYmd)
    .maybeSingle();

  if (lookupErr) return { ok: false, error: lookupErr.message };

  let id: string | null = (existing as { id?: string } | null)?.id ?? null;

  if (id) {
    // Already exists — flip to locked if needed.
    if ((existing as { status?: string } | null)?.status !== "locked") {
      const { error: upErr } = await supabase
        .from("pay_periods")
        .update({ status: "locked", locked_at: now, locked_by: actorId })
        .eq("id", id);
      if (upErr) return { ok: false, error: upErr.message };
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("pay_periods")
      .insert({
        time_clock_id: input.timeClockId,
        start_date: input.startDateYmd,
        end_date: input.endDateYmd,
        status: "locked",
        locked_at: now,
        locked_by: actorId,
      })
      .select("id")
      .maybeSingle();
    if (insErr) return { ok: false, error: insErr.message };
    id = (inserted as { id?: string } | null)?.id ?? null;
    if (!id) return { ok: false, error: "Could not create pay period record." };
  }

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.PAY_PERIOD_LOCKED,
    metadata: {
      pay_period_id: id,
      time_clock_id: input.timeClockId,
      start_date: input.startDateYmd,
      end_date: input.endDateYmd,
    },
  });

  revalidatePath(`/time-clock/${input.timeClockId}`);
  revalidatePath("/time-clock");

  return { ok: true, id };
}

/**
 * Unlock a previously-locked pay period. Owner-only. Time entries inside the
 * window become editable again. Audited.
 */
export async function unlockPayPeriod(input: {
  timeClockId: string;
  startDateYmd: string;
  endDateYmd: string;
}): Promise<PayPeriodLockResult> {
  const err = validateInputs(input.timeClockId, input.startDateYmd, input.endDateYmd);
  if (err) return { ok: false, error: err };

  const gate = await gateOwner();
  if ("ok" in gate && gate.ok === false) return gate;
  const { supabase, actorId } = gate as Exclude<typeof gate, { ok: false; error: string }>;

  const { data: existing, error: lookupErr } = await supabase
    .from("pay_periods")
    .select("id, status")
    .eq("time_clock_id", input.timeClockId)
    .eq("start_date", input.startDateYmd)
    .eq("end_date", input.endDateYmd)
    .maybeSingle();

  if (lookupErr) return { ok: false, error: lookupErr.message };
  const row = existing as { id?: string; status?: string } | null;
  if (!row?.id) return { ok: false, error: "This pay period was never locked." };
  if (row.status !== "locked") return { ok: true, id: row.id };

  const { error: upErr } = await supabase
    .from("pay_periods")
    .update({ status: "open", locked_at: null, locked_by: null })
    .eq("id", row.id);
  if (upErr) return { ok: false, error: upErr.message };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.PAY_PERIOD_UNLOCKED,
    metadata: {
      pay_period_id: row.id,
      time_clock_id: input.timeClockId,
      start_date: input.startDateYmd,
      end_date: input.endDateYmd,
    },
  });

  revalidatePath(`/time-clock/${input.timeClockId}`);
  revalidatePath("/time-clock");

  return { ok: true, id: row.id };
}
