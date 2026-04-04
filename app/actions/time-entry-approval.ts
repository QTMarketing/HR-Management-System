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

export type TimeEntryApprovalResult = { ok: true } | { ok: false; error: string };

async function gateManageTime(): Promise<TimeEntryApprovalResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return {
      ok: false,
      error: "You need time clock management permission to approve punches.",
    };
  }
  return null;
}

export async function approveTimeEntry(entryId: string, locationId: string): Promise<TimeEntryApprovalResult> {
  const g = await gateManageTime();
  if (g) return g;

  const id = entryId?.trim();
  const locId = locationId?.trim();
  if (!id || !locId) return { ok: false, error: "Missing entry or location." };

  const supabase = await createSupabaseServerClient();
  const actorId = await resolveActorEmployeeId(supabase);

  const { data: row, error: fetchErr } = await supabase
    .from("time_entries")
    .select("id, location_id, employee_id, time_clock_id, archived_at, status, clock_out_at, approved_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "Time entry not found." };

  const r = row as {
    location_id: string;
    employee_id: string;
    time_clock_id: string;
    archived_at: string | null;
    status: string;
    clock_out_at: string | null;
    approved_at: string | null;
  };

  if (r.location_id !== locId) {
    return { ok: false, error: "Entry does not belong to this location." };
  }
  if (r.archived_at) {
    return { ok: false, error: "Archived punches cannot be approved." };
  }
  if (r.status !== "closed" || !r.clock_out_at) {
    return { ok: false, error: "Only completed punches can be approved." };
  }
  if (r.approved_at) {
    return { ok: false, error: "This punch is already approved." };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("time_entries")
    .update({
      approved_at: now,
      approved_by: actorId,
    })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.TIME_ENTRY_APPROVED,
    targetEmployeeId: r.employee_id,
    locationId: locId,
    metadata: {
      time_entry_id: id,
      time_clock_id: r.time_clock_id,
    },
  });

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${r.time_clock_id}`);
  revalidatePath("/reports/labor");
  revalidatePath("/security-audit");
  return { ok: true };
}

export async function unapproveTimeEntry(entryId: string, locationId: string): Promise<TimeEntryApprovalResult> {
  const g = await gateManageTime();
  if (g) return g;

  const id = entryId?.trim();
  const locId = locationId?.trim();
  if (!id || !locId) return { ok: false, error: "Missing entry or location." };

  const supabase = await createSupabaseServerClient();
  const actorId = await resolveActorEmployeeId(supabase);

  const { data: row, error: fetchErr } = await supabase
    .from("time_entries")
    .select("id, location_id, employee_id, time_clock_id, archived_at, approved_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "Time entry not found." };

  const r = row as {
    location_id: string;
    employee_id: string;
    time_clock_id: string;
    archived_at: string | null;
    approved_at: string | null;
  };

  if (r.location_id !== locId) {
    return { ok: false, error: "Entry does not belong to this location." };
  }
  if (r.archived_at) {
    return { ok: false, error: "Archived punches cannot be changed." };
  }
  if (!r.approved_at) {
    return { ok: false, error: "This punch is not approved." };
  }

  const { error: updErr } = await supabase
    .from("time_entries")
    .update({
      approved_at: null,
      approved_by: null,
    })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.TIME_ENTRY_UNAPPROVED,
    targetEmployeeId: r.employee_id,
    locationId: locId,
    metadata: {
      time_entry_id: id,
      time_clock_id: r.time_clock_id,
    },
  });

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${r.time_clock_id}`);
  revalidatePath("/reports/labor");
  revalidatePath("/security-audit");
  return { ok: true };
}
