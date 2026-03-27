"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Stored `employees.role` value — normalized as store_manager in app RBAC. */
const STORE_MANAGER_ROLE_LABEL = "Store Manager";

async function gateUsersManage(): Promise<ActionResult> {
  if (process.env.RBAC_ENABLED !== "true") return { ok: true };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.USERS_MANAGE)) {
    return { ok: false, error: "You need users.manage permission to change admin roles." };
  }
  return { ok: true };
}

/**
 * Promote an active directory user to Store Manager (Admins tab).
 */
export async function promoteEmployeeToAdmin(employeeId: string): Promise<ActionResult> {
  const gated = await gateUsersManage();
  if (!gated.ok) return gated;

  const id = employeeId?.trim();
  if (!id) return { ok: false, error: "Select an employee." };

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
    return { ok: false, error: "Cannot promote archived or inactive users." };
  }

  const roleKey = normalizeRoleLabel(String((row as { role?: string }).role ?? ""));
  if (roleKey === "store_manager") {
    return { ok: false, error: "This person is already a Store Manager." };
  }

  const { error: updErr } = await supabase
    .from("employees")
    .update({
      role: STORE_MANAGER_ROLE_LABEL,
      access_level: "Store admin",
      managed_groups: "All groups",
      permissions_label: "All features",
      admin_tab_enabled: true,
    })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/users");
  return { ok: true };
}
