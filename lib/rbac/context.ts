import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from "./permissions";
import { normalizeRoleLabel, permissionsForRoleKey, type AppRoleKey } from "./matrix";
import { storeManagerPermissionsFromAccess } from "@/lib/users/admin-access";

export type RbacContext = {
  /** When false, all permissions are granted (legacy dev / anon-friendly). */
  enabled: boolean;
  permissions: Permission[];
  roleKey: AppRoleKey | null;
  employeeId: string | null;
  /** Signed in but no `employees` row matching email */
  needsEmployeeProfile: boolean;
};

function isRbacEnabled(): boolean {
  return process.env.RBAC_ENABLED === "true";
}

/**
 * Resolves permissions for the current session.
 * - RBAC off: full access (same as today).
 * - RBAC on, no session: caller should redirect to `/login` (see dashboard layout).
 * - RBAC on, session: match `auth.users.email` to `employees.email` for role.
 */
export const getRbacContext = cache(
  async (supabase: SupabaseClient, user: User | null): Promise<RbacContext> => {
    const enabled = isRbacEnabled();

    if (!enabled) {
      return {
        enabled: false,
        permissions: ALL_PERMISSIONS,
        roleKey: null,
        employeeId: null,
        needsEmployeeProfile: false,
      };
    }

    if (!user?.email) {
      return {
        enabled: true,
        permissions: [],
        roleKey: null,
        employeeId: null,
        needsEmployeeProfile: false,
      };
    }

    const email = user.email.trim().toLowerCase();

    const { data: row, error } = await supabase
      .from("employees")
      .select("id, role, admin_access")
      .ilike("email", email)
      .maybeSingle();

    if (error) {
      return {
        enabled: true,
        permissions: [PERMISSIONS.DASHBOARD_VIEW],
        roleKey: null,
        employeeId: null,
        needsEmployeeProfile: true,
      };
    }

    const rec = row as { id?: string; role?: string; admin_access?: unknown } | null;
    if (!rec?.id) {
      return {
        enabled: true,
        permissions: [PERMISSIONS.DASHBOARD_VIEW],
        roleKey: null,
        employeeId: null,
        needsEmployeeProfile: true,
      };
    }

    const roleKey = normalizeRoleLabel(rec.role);
    const permissions =
      roleKey === "owner"
        ? permissionsForRoleKey("owner")
        : roleKey === "store_manager"
          ? storeManagerPermissionsFromAccess(rec.admin_access)
          : permissionsForRoleKey(roleKey);
    return {
      enabled: true,
      permissions,
      roleKey,
      employeeId: rec.id,
      needsEmployeeProfile: false,
    };
  },
);

export function hasPermission(ctx: RbacContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}
