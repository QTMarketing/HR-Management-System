"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BulkEmployeeRow = {
  firstName: string;
  lastName: string;
  phoneDial: string;
  phoneNational: string;
  birthday: string;
  employmentStart: string;
  directManagerId: string;
};

export type BulkCreateResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

async function assertCanManageUsers(): Promise<BulkCreateResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.USERS_MANAGE)) {
    return { ok: false, error: "You don’t have permission to add users." };
  }
  return null;
}

/**
 * Inserts employees from the bulk-add modal. Resolves store from header scope or from the
 * selected Store Manager when “All locations” is active.
 */
export async function bulkCreateEmployees(
  rows: BulkEmployeeRow[],
  assignmentLocationId: string | null,
  scopeAll: boolean,
): Promise<BulkCreateResult> {
  const gate = await assertCanManageUsers();
  if (gate) return gate;

  if (rows.length === 0) {
    return { ok: false, error: "No rows to create." };
  }

  const supabase = await createSupabaseServerClient();
  const inserts: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const first = r.firstName.trim();
    const last = r.lastName.trim();
    const digits = r.phoneNational.replace(/\D/g, "");
    if (!first || !last || digits.length < 7) {
      return {
        ok: false,
        error: `Row ${i + 1}: first name, last name, and a valid mobile number are required.`,
      };
    }

    const mobile_phone = `${r.phoneDial.trim()}${digits}`;
    const directManagerId = r.directManagerId.trim() || null;

    let locationId: string | null = assignmentLocationId;

    if (scopeAll) {
      if (!directManagerId) {
        return {
          ok: false,
          error: `Row ${i + 1}: choose a direct manager (store) when the directory is set to All locations.`,
        };
      }
      const { data: mgr, error: mgrErr } = await supabase
        .from("employees")
        .select("id, location_id, role, status")
        .eq("id", directManagerId)
        .maybeSingle();

      if (mgrErr || !mgr) {
        return { ok: false, error: `Row ${i + 1}: direct manager not found.` };
      }
      const st = String((mgr as { status?: string }).status ?? "");
      if (st === "archived") {
        return { ok: false, error: `Row ${i + 1}: direct manager is archived.` };
      }
      const lid = (mgr as { location_id: string | null }).location_id;
      if (!lid) {
        return { ok: false, error: `Row ${i + 1}: direct manager has no store assignment.` };
      }
      if (normalizeRoleLabel(String((mgr as { role?: string }).role)) !== "store_manager") {
        return { ok: false, error: `Row ${i + 1}: direct manager must be a Store Manager.` };
      }
      locationId = lid;
    } else {
      if (!assignmentLocationId) {
        return { ok: false, error: "Select a single store in the header before adding users." };
      }
      if (directManagerId) {
        const { data: mgr, error: mgrErr } = await supabase
          .from("employees")
          .select("id, location_id, role, status")
          .eq("id", directManagerId)
          .maybeSingle();

        if (mgrErr || !mgr) {
          return { ok: false, error: `Row ${i + 1}: direct manager not found.` };
        }
        if ((mgr as { location_id: string | null }).location_id !== assignmentLocationId) {
          return {
            ok: false,
            error: `Row ${i + 1}: direct manager must belong to the selected store.`,
          };
        }
        if (normalizeRoleLabel(String((mgr as { role?: string }).role)) !== "store_manager") {
          return { ok: false, error: `Row ${i + 1}: direct manager must be a Store Manager.` };
        }
      }
      locationId = assignmentLocationId;
    }

    const full_name = `${first} ${last}`.trim();
    const birth_date = r.birthday.trim() || null;
    const employment_start_date = r.employmentStart.trim() || null;

    const position = "Employee";
    inserts.push({
      full_name,
      first_name: first,
      last_name: last,
      mobile_phone,
      birth_date,
      employment_start_date,
      role: position,
      title: position,
      location_id: locationId,
      status: "active",
      direct_manager_id: directManagerId,
    });
  }

  const { error } = await supabase.from("employees").insert(inserts);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/users");
  return { ok: true, created: inserts.length };
}
