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

export type ArchiveTimeEntryResult = { ok: true } | { ok: false; error: string };

async function gateManageTime(): Promise<ArchiveTimeEntryResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return {
      ok: false,
      error: "You need time clock management permission to archive punches.",
    };
  }
  return null;
}

/**
 * Soft-archive a punch row (retain for audit; hidden from active views).
 */
export async function archiveTimeEntry(entryId: string, locationId: string): Promise<ArchiveTimeEntryResult> {
  const g = await gateManageTime();
  if (g) return g;

  const id = entryId?.trim();
  const locId = locationId?.trim();
  if (!id || !locId) return { ok: false, error: "Missing entry or location." };

  const supabase = await createSupabaseServerClient();

  const { data: row, error: fetchErr } = await supabase
    .from("time_entries")
    .select("id, location_id, employee_id, time_clock_id, archived_at, clock_out_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "Time entry not found." };

  const r = row as {
    location_id: string;
    archived_at: string | null;
    clock_out_at: string | null;
    employee_id: string;
    time_clock_id: string;
  };

  if (r.location_id !== locId) {
    return { ok: false, error: "Entry does not belong to this location." };
  }
  if (r.archived_at) {
    return { ok: false, error: "This entry is already archived." };
  }

  const now = new Date().toISOString();
  const actorId = await resolveActorEmployeeId(supabase);

  const patch: Record<string, unknown> = {
    archived_at: now,
    archived_by: actorId,
  };
  if (!r.clock_out_at) {
    patch.clock_out_at = now;
    patch.status = "closed";
  }

  const { error: updErr } = await supabase.from("time_entries").update(patch).eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.TIME_ENTRY_ARCHIVED,
    targetEmployeeId: r.employee_id,
    locationId: locId,
    metadata: {
      time_entry_id: id,
      time_clock_id: r.time_clock_id,
    },
  });

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${r.time_clock_id}`);
  revalidatePath("/activity");
  revalidatePath("/reports/labor");
  revalidatePath("/security-audit");
  return { ok: true };
}
