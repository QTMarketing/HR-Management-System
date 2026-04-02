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

export type OrgOwnerActionResult = { ok: true } | { ok: false; error: string };

const ORG_OWNER_ROLE_LABEL = "Org Owner";
const DEFAULT_AFTER_REVOKE_ROLE = "Employee";

async function gate(): Promise<OrgOwnerActionResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return {
      ok: false,
      error: "Only organization owners can grant or remove organization owner access.",
    };
  }
  return null;
}

/** Grant or remove company-wide owner role (`employees.role` → Org Owner). */
export async function setEmployeeOrgOwner(
  employeeId: string,
  makeOwner: boolean,
): Promise<OrgOwnerActionResult> {
  const g = await gate();
  if (g) return g;

  const id = employeeId?.trim();
  if (!id) return { ok: false, error: "Missing employee." };

  const supabase = await createSupabaseServerClient();

  const { data: row, error: fetchErr } = await supabase
    .from("employees")
    .select("id, role, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "Employee not found." };

  const status = String((row as { status?: string }).status ?? "");
  if (status === "archived" || status === "inactive") {
    return { ok: false, error: "Cannot change owner status for archived or inactive users." };
  }

  const prevRole = String((row as { role?: string }).role ?? "");
  const wasOwner = normalizeRoleLabel(prevRole) === "owner";

  if (makeOwner && wasOwner) {
    return { ok: false, error: "This person is already an organization owner." };
  }
  if (!makeOwner && !wasOwner) {
    return { ok: false, error: "This person is not an organization owner." };
  }

  if (!makeOwner) {
    const { data: allRows, error: listErr } = await supabase.from("employees").select("id, role, status");
    if (listErr) return { ok: false, error: listErr.message };
    const activeOwners = (allRows ?? []).filter((r) => {
      const st = String((r as { status?: string }).status ?? "active");
      if (st === "archived" || st === "inactive") return false;
      return normalizeRoleLabel(String((r as { role?: string }).role ?? "")) === "owner";
    });
    if (activeOwners.length <= 1) {
      return {
        ok: false,
        error: "Keep at least one organization owner. Add another owner before removing this one.",
      };
    }
  }

  const newRole = makeOwner ? ORG_OWNER_ROLE_LABEL : DEFAULT_AFTER_REVOKE_ROLE;

  const { error: updErr } = await supabase
    .from("employees")
    .update({ role: newRole })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  const actorId = await resolveActorEmployeeId(supabase);
  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.ORGANIZATION_OWNER_CHANGED,
    targetEmployeeId: id,
    metadata: {
      previous_role: prevRole,
      new_role: newRole,
      organization_owner: makeOwner,
    },
  });

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  revalidatePath("/security-audit");
  return { ok: true };
}
