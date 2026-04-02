"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import {
  type AdminAccess,
  accessEqualsFull,
  formatAdminAccessSummary,
  normalizeAdminAccess,
} from "@/lib/users/admin-access";

export type AdminAccessActionResult = { ok: true } | { ok: false; error: string };

async function gate(): Promise<AdminAccessActionResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return {
      ok: false,
      error: "Only organization owners can edit Store Manager module access.",
    };
  }
  return null;
}

export async function updateEmployeeAdminAccess(
  employeeId: string,
  payload: AdminAccess,
): Promise<AdminAccessActionResult> {
  const g = await gate();
  if (g) return g;

  const id = employeeId?.trim();
  if (!id) return { ok: false, error: "Missing employee." };

  const supabase = await createSupabaseServerClient();
  const { data: row, error: fetchErr } = await supabase
    .from("employees")
    .select("id, role, status, admin_access, permissions_label")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "Employee not found." };

  if (normalizeRoleLabel(String((row as { role?: string }).role)) !== "store_manager") {
    return { ok: false, error: "Access presets apply to Store Managers only." };
  }

  const normalized = normalizeAdminAccess(payload);
  const fullAccess = accessEqualsFull(normalized);
  const label = fullAccess ? "All features" : formatAdminAccessSummary(normalized);

  const prevAccess = (row as { admin_access?: unknown }).admin_access;
  const prevLabel = (row as { permissions_label?: string | null }).permissions_label ?? null;

  const { error: updErr } = await supabase
    .from("employees")
    .update({
      admin_access: fullAccess ? null : normalized,
      permissions_label: label,
    })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  const actorId = await resolveActorEmployeeId(supabase);
  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.ADMIN_ACCESS_UPDATED,
    targetEmployeeId: id,
    metadata: {
      before_summary: prevLabel ?? formatAdminAccessSummary(normalizeAdminAccess(prevAccess)),
      after_summary: label,
      before_access: prevAccess ?? null,
      after_access: fullAccess ? null : normalized,
    },
  });

  revalidatePath("/users");
  revalidatePath("/security-audit");
  return { ok: true };
}
