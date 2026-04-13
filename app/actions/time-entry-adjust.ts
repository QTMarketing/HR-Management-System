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

export type AdjustTimeEntryResult = { ok: true } | { ok: false; error: string };

async function gateManageTime(): Promise<AdjustTimeEntryResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return {
      ok: false,
      error: "You need time clock management permission to adjust time entries.",
    };
  }
  return null;
}

/**
 * Manager in-place edit of clock times. Sets audit columns and clears approval so payroll must re-approve.
 */
export async function adjustTimeEntry(params: {
  entryId: string;
  locationId: string;
  /** ISO timestamp; omit to leave unchanged */
  clockInAt?: string | null;
  /** ISO timestamp; omit to leave unchanged */
  clockOutAt?: string | null;
  /** Required explanation for audit */
  editReason: string;
}): Promise<AdjustTimeEntryResult> {
  const g = await gateManageTime();
  if (g) return g;

  const id = params.entryId?.trim();
  const locId = params.locationId?.trim();
  const reason = params.editReason?.trim() ?? "";

  if (!id || !locId) return { ok: false, error: "Missing entry or location." };
  if (reason.length < 3) {
    return { ok: false, error: "Edit reason must be at least 3 characters." };
  }
  if (reason.length > 2000) {
    return { ok: false, error: "Edit reason is too long." };
  }

  const hasIn = params.clockInAt != null && params.clockInAt !== "";
  const hasOut = params.clockOutAt != null && params.clockOutAt !== "";
  if (!hasIn && !hasOut) {
    return { ok: false, error: "Provide a new clock-in and/or clock-out time." };
  }

  const supabase = await createSupabaseServerClient();
  const actorId = await resolveActorEmployeeId(supabase);
  if (!actorId) {
    return { ok: false, error: "Could not resolve your employee profile." };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("time_entries")
    .select(
      "id, location_id, employee_id, time_clock_id, archived_at, clock_in_at, clock_out_at, status",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "Time entry not found." };

  const r = row as {
    location_id: string;
    employee_id: string;
    time_clock_id: string;
    archived_at: string | null;
    clock_in_at: string;
    clock_out_at: string | null;
    status: string;
  };

  if (r.location_id !== locId) {
    return { ok: false, error: "Entry does not belong to this location." };
  }
  if (r.archived_at) {
    return { ok: false, error: "Archived entries cannot be edited." };
  }

  let nextIn = r.clock_in_at;
  let nextOut = r.clock_out_at;

  if (hasIn) {
    const t = Date.parse(params.clockInAt!);
    if (Number.isNaN(t)) return { ok: false, error: "Invalid clock-in time." };
    nextIn = new Date(t).toISOString();
  }
  if (hasOut) {
    const t = Date.parse(params.clockOutAt!);
    if (Number.isNaN(t)) return { ok: false, error: "Invalid clock-out time." };
    nextOut = new Date(t).toISOString();
  }

  if (nextOut != null) {
    const a = new Date(nextIn).getTime();
    const b = new Date(nextOut).getTime();
    if (b < a) {
      return { ok: false, error: "Clock-out must be on or after clock-in." };
    }
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    clock_in_at: nextIn,
    edited_at: now,
    edited_by: actorId,
    edit_reason: reason,
    approved_at: null,
    approved_by: null,
  };

  if (nextOut != null) {
    patch.clock_out_at = nextOut;
    patch.status = "closed";
  } else {
    patch.clock_out_at = null;
    patch.status = "open";
  }

  const { error: updErr } = await supabase.from("time_entries").update(patch).eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.TIME_ENTRY_ADJUSTED,
    targetEmployeeId: r.employee_id,
    locationId: locId,
    metadata: {
      time_entry_id: id,
      time_clock_id: r.time_clock_id,
      prior_clock_in_at: r.clock_in_at,
      prior_clock_out_at: r.clock_out_at,
      new_clock_in_at: nextIn,
      new_clock_out_at: nextOut,
    },
  });

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${r.time_clock_id}`);
  revalidatePath("/activity");
  revalidatePath("/reports/labor");
  revalidatePath("/security-audit");
  return { ok: true };
}
