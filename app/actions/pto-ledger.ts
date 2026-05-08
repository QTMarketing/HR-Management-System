"use server";

/**
 * PTO Ledger server actions.
 *
 * Reads from `pto_ledger_entries` (migration 054) — the append-only log that
 * already powers `pto_employee_balances`. We expose a small, UI-friendly
 * surface (`PtoLedgerEntry`, `LEDGER_TYPE_LABELS` — both in
 * `lib/pto/ledger-types.ts`) so the employee history table doesn't have to
 * know about every internal `entry_type`.
 *
 * Inserts go through the new `pto_ledger_entries_insert_adjustments` RLS
 * (migration 071) which restricts app-level inserts to `entry_type =
 * 'adjustment'` rows where the actor is the org owner OR a manager of the
 * target employee's location.
 */

import { revalidatePath } from "next/cache";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  LEDGER_TYPE_LABELS,
  isLedgerType,
  isPtoBucket,
  type PtoLedgerBucket,
  type PtoLedgerEntry,
} from "@/lib/pto/ledger-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GetPtoLedgerResult =
  | { ok: true; data: PtoLedgerEntry[] }
  | { ok: false; error: string };

export type AdjustPtoBalanceInput = {
  employeeId: string;
  bucket: PtoLedgerBucket;
  /** Hours. Positive = grant; negative = deduct. Cannot be zero. */
  changeAmount: number;
  description: string;
};

export type AdjustPtoBalanceResult =
  | { ok: true; entryId: string }
  | { ok: false; error: string };

function toNumber(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Default human-readable description when none was recorded on the row.
 * Mirrors the labels we render in the UI badges so the export reads cleanly.
 */
function fallbackDescription(type: keyof typeof LEDGER_TYPE_LABELS, bucket: PtoLedgerBucket): string {
  const label = LEDGER_TYPE_LABELS[type] ?? type;
  return bucket === "sick" ? `${label} (Sick)` : `${label} (Vacation)`;
}

/**
 * Read the full PTO ledger for one employee, newest first.
 *
 * RLS already restricts visibility (employees see their own; managers see
 * employees in locations they can edit). We don't double-gate here — this
 * server action just maps the rows into the UI shape.
 */
export async function getPtoLedger(employeeId: string): Promise<GetPtoLedgerResult> {
  const id = employeeId?.trim();
  if (!id) return { ok: false, error: "Missing employee id." };

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("pto_ledger_entries")
    .select("id, bucket, entry_type, amount_hours, effective_at, created_at, notes, metadata")
    .eq("employee_id", id)
    .order("effective_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };

  type Row = {
    id: string;
    bucket: string;
    entry_type: string;
    amount_hours: unknown;
    effective_at: string;
    created_at: string;
    notes: string | null;
    metadata: unknown;
  };

  const rows = (data ?? []) as Row[];
  const entries: PtoLedgerEntry[] = [];

  for (const r of rows) {
    if (!isPtoBucket(r.bucket) || !isLedgerType(r.entry_type)) continue;
    const change = toNumber(r.amount_hours);
    if (change === null) continue;

    let description = (r.notes ?? "").trim();
    if (!description) {
      // Pull a friendlier label from metadata.reason when present (rollover
      // grants/forfeits stash the year there). Otherwise fall back to a
      // generic "<Label> (Bucket)" stamp.
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const reason = typeof meta.reason === "string" ? meta.reason.trim() : "";
      const year = typeof meta.year === "number" ? meta.year : null;
      if (reason && year) description = `${reason} ${year}`;
      else if (reason) description = reason;
      else description = fallbackDescription(r.entry_type, r.bucket);
    }

    entries.push({
      id: r.id,
      bucket: r.bucket,
      type: r.entry_type,
      typeLabel: LEDGER_TYPE_LABELS[r.entry_type] ?? r.entry_type,
      changeAmount: change,
      description,
      effectiveAt: r.effective_at,
      createdAt: r.created_at,
    });
  }

  return { ok: true, data: entries };
}

/**
 * Manager/Owner-only manual adjustment. Inserts a single `entry_type =
 * 'adjustment'` row and stamps the actor as `created_by` so the audit log
 * + the new RLS policy align.
 */
export async function adjustPtoBalance(
  input: AdjustPtoBalanceInput,
): Promise<AdjustPtoBalanceResult> {
  const employeeId = input.employeeId?.trim();
  const bucket = input.bucket;
  const description = (input.description ?? "").trim();

  if (!employeeId) return { ok: false, error: "Missing employee id." };
  if (!isPtoBucket(bucket)) return { ok: false, error: "Invalid PTO bucket." };
  if (!Number.isFinite(input.changeAmount) || input.changeAmount === 0) {
    return { ok: false, error: "Adjustment must be a non-zero number of hours." };
  }
  if (Math.abs(input.changeAmount) > 10000) {
    return { ok: false, error: "Adjustment looks too large — double-check the value." };
  }
  if (description.length === 0) {
    return { ok: false, error: "Add a short reason so this adjustment is auditable." };
  }
  if (description.length > 2000) {
    return { ok: false, error: "Reason is too long (max 2000 characters)." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);

  // RBAC gate: gates RLS at the app boundary so non-managers get a clean
  // error, not a confusing RLS denial.
  if (
    ctx.enabled &&
    !hasPermission(ctx, PERMISSIONS.ORG_OWNER) &&
    !hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)
  ) {
    return {
      ok: false,
      error: "Only Owners and managers can adjust PTO balances.",
    };
  }

  const actorId = await resolveActorEmployeeId(supabase);
  if (!actorId) {
    return {
      ok: false,
      error: "Could not resolve your employee profile (login email must match employees.email).",
    };
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .from("pto_ledger_entries")
    .insert({
      employee_id: employeeId,
      bucket,
      entry_type: "adjustment",
      amount_hours: input.changeAmount,
      effective_at: nowIso,
      created_by: actorId,
      notes: description,
      metadata: { source: "adjust_pto_balance" },
    })
    .select("id")
    .maybeSingle();

  if (insErr) return { ok: false, error: insErr.message };
  const entryId = (inserted as { id?: string } | null)?.id;
  if (!entryId) return { ok: false, error: "Could not write the adjustment." };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.PTO_BALANCE_ADJUSTED,
    targetEmployeeId: employeeId,
    metadata: {
      pto_ledger_entry_id: entryId,
      bucket,
      change_amount: input.changeAmount,
      reason: description,
    },
  });

  revalidatePath("/");
  revalidatePath("/users/[employeeId]");
  revalidatePath("/pto-admin");

  return { ok: true, entryId };
}
