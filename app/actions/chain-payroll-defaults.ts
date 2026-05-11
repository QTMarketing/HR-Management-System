"use server";

/**
 * Region-level (chain) payroll defaults.
 *
 * The two retail banners — East and West — historically run on different
 * payroll calendars. Today the only setting we expose for region-level
 * configuration is **Week starts on**: East defaults to Thursday and West
 * to Monday. Saving here propagates the new week start to every
 * `time_clocks` row in that chain so individual clocks stay aligned with
 * the regional policy without manual fan-out.
 *
 * Write access is gated to Owners (`org.owner`) and every change is logged
 * to `security_audit_events` for the governance trail.
 *
 * The reader is resilient: it works even if migration 074 (which created
 * `chain_payroll_defaults`) hasn't been applied yet — in that case we fall
 * back to the chain slug ('east' → Thu, 'west' → Mon) so the UI still
 * renders and saves still propagate to clocks.
 */

import { revalidatePath, updateTag } from "next/cache";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import { TIME_CLOCKS_TAG, timeClockTag } from "@/lib/cache/tags";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizePeriodConfig,
  type TimesheetPeriodKind,
} from "@/lib/time-clock/timesheet-period";

export type ChainPayrollDefault = {
  chainId: string;
  chainName: string;
  chainSlug: string;
  weekStartsOn: number;
};

export type GetChainPayrollDefaultsResult =
  | { ok: true; defaults: ChainPayrollDefault[] }
  | { ok: false; error: string };

export type SaveRegionWeekStartResult =
  | { ok: true; appliedClocks: number }
  | { ok: false; error: string };

/**
 * Hard-coded fallback so the UI is functional on day one even before the
 * `chain_payroll_defaults` table exists. East starts Thursday (4), West
 * starts Monday (1); anything else defaults to Monday.
 */
function fallbackWeekStartForSlug(slug: string): number {
  const s = (slug ?? "").toLowerCase();
  if (s.includes("east")) return 4;
  if (s.includes("west")) return 1;
  return 1;
}

function asWso(raw: unknown, fallback: number): number {
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= 6
    ? raw
    : fallback;
}

/**
 * Lists one row per chain with its current Week starts on value. Reads from
 * `chain_payroll_defaults` when present; gracefully falls back to the chain
 * slug when the table is missing or empty.
 */
export async function getChainPayrollDefaults(): Promise<GetChainPayrollDefaultsResult> {
  const supabase = await createSupabaseServerClient();

  const { data: chainsRaw, error: chErr } = await supabase
    .from("chains")
    .select("id, name, slug, sort_order")
    .order("sort_order", { ascending: true });
  if (chErr) return { ok: false, error: chErr.message };

  // Best-effort fetch of the defaults table. If the migration hasn't been
  // applied yet, the query errors — we swallow it and rely on slug fallbacks.
  let defaultsRaw: Record<string, unknown>[] = [];
  try {
    const { data, error } = await supabase
      .from("chain_payroll_defaults")
      .select("chain_id, week_starts_on");
    if (!error && Array.isArray(data)) {
      defaultsRaw = data as Record<string, unknown>[];
    }
  } catch {
    // Defaults table missing: fall back below.
  }

  const byChain = new Map<string, Record<string, unknown>>();
  for (const r of defaultsRaw) {
    const id = String(r.chain_id);
    byChain.set(id, r);
  }

  const out: ChainPayrollDefault[] = (
    (chainsRaw ?? []) as { id: string; name: string; slug: string }[]
  ).map((c) => {
    const row = byChain.get(c.id);
    const fallback = fallbackWeekStartForSlug(c.slug);
    return {
      chainId: c.id,
      chainName: c.name,
      chainSlug: c.slug,
      weekStartsOn: asWso(row?.week_starts_on, fallback),
    };
  });

  return { ok: true, defaults: out };
}

async function gateOwner(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.RBAC_ENABLED !== "true") return { ok: true };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return {
      ok: false,
      error: "Only Organization Owners can edit region payroll defaults.",
    };
  }
  return { ok: true };
}

/**
 * Owner-only save. Updates the region's Week starts on and bulk-applies it to
 * every `time_clocks` in that chain — preserving each clock's existing pay
 * frequency / anchor date / monthly cutoff. Resilient: if
 * `chain_payroll_defaults` does not exist yet, we still propagate to clocks
 * (the table write is best-effort).
 */
export async function saveRegionWeekStart(input: {
  chainId: string;
  weekStartsOn: number;
}): Promise<SaveRegionWeekStartResult> {
  const gate = await gateOwner();
  if (!gate.ok) return gate;

  const chainId = input.chainId?.trim();
  if (!chainId) return { ok: false, error: "Missing chain." };
  const wso = Number.isInteger(input.weekStartsOn) ? input.weekStartsOn : -1;
  if (wso < 0 || wso > 6) {
    return { ok: false, error: "Invalid week start." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: chainRow, error: chErr } = await supabase
    .from("chains")
    .select("id, name, slug")
    .eq("id", chainId)
    .maybeSingle();
  if (chErr) return { ok: false, error: chErr.message };
  if (!chainRow) return { ok: false, error: "Chain not found." };

  const actorId = await resolveActorEmployeeId(supabase);

  // 1) Best-effort write to chain_payroll_defaults (no-op if table missing).
  try {
    await supabase.from("chain_payroll_defaults").upsert(
      {
        chain_id: chainId,
        week_starts_on: wso,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      },
      { onConflict: "chain_id" },
    );
  } catch {
    // Defaults table missing: that's OK; we still apply to clocks below.
  }

  // 2) Collect every time clock in this chain.
  const { data: locRows, error: locErr } = await supabase
    .from("locations")
    .select("id")
    .eq("chain_id", chainId);
  if (locErr) return { ok: false, error: locErr.message };
  const locationIds = (locRows ?? [])
    .map((l) => String((l as { id?: string }).id ?? ""))
    .filter(Boolean);

  let appliedClocks = 0;
  let clockIds: string[] = [];
  if (locationIds.length > 0) {
    const { data: clockRows, error: tcErr } = await supabase
      .from("time_clocks")
      .select("id, timesheet_period_kind, timesheet_period_config")
      .in("location_id", locationIds);
    if (tcErr) return { ok: false, error: tcErr.message };

    type Row = {
      id: string;
      timesheet_period_kind?: string | null;
      timesheet_period_config?: unknown;
    };
    const rows = (clockRows ?? []) as Row[];
    clockIds = rows.map((r) => r.id);

    // Bulk update each clock's week_starts_on while preserving everything else.
    for (const r of rows) {
      const kind = (r.timesheet_period_kind ?? "weekly") as TimesheetPeriodKind;
      const prior = normalizePeriodConfig(r.timesheet_period_config, kind);
      const nextConfig = { ...prior, week_starts_on: wso };
      const { error: updErr } = await supabase
        .from("time_clocks")
        .update({ timesheet_period_config: nextConfig })
        .eq("id", r.id);
      if (updErr) return { ok: false, error: updErr.message };
      appliedClocks++;
    }
  }

  // 3) Owner-only audit trail.
  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.CHAIN_PAYROLL_DEFAULTS_UPDATED,
    metadata: {
      chain_id: chainId,
      chain_name: (chainRow as { name?: string }).name ?? null,
      chain_slug: (chainRow as { slug?: string }).slug ?? null,
      week_starts_on: wso,
      applied_clocks: appliedClocks,
    },
  });

  // 4) Invalidate caches so every clock in this chain refreshes on next view.
  for (const id of clockIds) {
    revalidatePath(`/time-clock/${id}`);
    updateTag(timeClockTag(id));
  }
  revalidatePath("/time-clock");
  revalidatePath("/security-audit");
  updateTag(TIME_CLOCKS_TAG);

  return { ok: true, appliedClocks };
}
