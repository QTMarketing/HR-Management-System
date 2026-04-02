"use server";

import { revalidatePath } from "next/cache";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ArchiveResult = { ok: true } | { ok: false; error: string };

async function gateManage(): Promise<ArchiveResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.USERS_MANAGE)) {
    return { ok: false, error: "You don’t have permission to archive users." };
  }
  return null;
}

/**
 * Soft-archive an employee (no hard delete). Sets status + archived timestamps.
 */
export async function archiveEmployee(employeeId: string): Promise<ArchiveResult> {
  const g = await gateManage();
  if (g) return g;

  const id = employeeId?.trim();
  if (!id) return { ok: false, error: "Missing employee." };

  const supabase = await createSupabaseServerClient();

  const actorId = await resolveActorEmployeeId(supabase);
  if (actorId === id) {
    return { ok: false, error: "You can’t archive your own account." };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("employees")
    .select("id, full_name, status, role")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "Employee not found." };

  const status = String((row as { status?: string }).status ?? "");
  if (status === "archived") {
    return { ok: false, error: "This user is already archived." };
  }

  const targetRole = String((row as { role?: string }).role ?? "");
  if (normalizeRoleLabel(targetRole) === "owner") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const ctx = await getRbacContext(supabase, user);
    if (!hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
      return {
        ok: false,
        error: "Only organization owners can archive another organization owner.",
      };
    }
  }

  let archivedByLabel = "System";
  if (actorId) {
    const { data: actorRow } = await supabase
      .from("employees")
      .select("full_name, email")
      .eq("id", actorId)
      .maybeSingle();
    if (actorRow) {
      const ar = actorRow as { full_name?: string; email?: string };
      archivedByLabel = (ar.full_name?.trim() || ar.email?.trim() || actorId) as string;
    }
  }

  const now = new Date().toISOString();

  const { error: updErr } = await supabase
    .from("employees")
    .update({
      status: "archived",
      archived_at: now,
      archived_by: archivedByLabel,
    })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.EMPLOYEE_ARCHIVED,
    targetEmployeeId: id,
    metadata: {
      full_name: (row as { full_name?: string }).full_name ?? null,
      previous_status: status,
    },
  });

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  revalidatePath("/locations");
  revalidatePath("/security-audit");
  return { ok: true };
}
