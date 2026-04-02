"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  SECURITY_AUDIT_ACTIONS,
  insertSecurityAudit,
  resolveActorEmployeeId,
} from "@/lib/audit/security-audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LocationManagerResult = { ok: true } | { ok: false; error: string };

async function gateOrgOwner(): Promise<LocationManagerResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return {
      ok: false,
      error: "Only organization owners can assign store leads.",
    };
  }
  return null;
}

/**
 * Set the accountable Store Manager for a location (`locations.manager_employee_id`).
 * Manager must be an active Store Manager assigned to that location.
 */
export async function updateLocationStoreManager(
  locationId: string,
  managerEmployeeId: string | null,
): Promise<LocationManagerResult> {
  const g = await gateOrgOwner();
  if (g) return g;

  const locId = locationId?.trim();
  if (!locId) return { ok: false, error: "Missing location." };

  const supabase = await createSupabaseServerClient();

  const { data: loc, error: locErr } = await supabase
    .from("locations")
    .select("id, name, manager_employee_id")
    .eq("id", locId)
    .maybeSingle();

  if (locErr) return { ok: false, error: locErr.message };
  if (!loc) return { ok: false, error: "Location not found." };

  const locName = String((loc as { name?: string }).name ?? "");
  const previousManagerId =
    (loc as { manager_employee_id?: string | null }).manager_employee_id ?? null;

  if (managerEmployeeId == null || managerEmployeeId.trim() === "") {
    const { error: updErr } = await supabase
      .from("locations")
      .update({ manager_employee_id: null })
      .eq("id", locId);
    if (updErr) return { ok: false, error: updErr.message };
    const actorId = await resolveActorEmployeeId(supabase);
    await insertSecurityAudit(supabase, {
      actorEmployeeId: actorId,
      action: SECURITY_AUDIT_ACTIONS.LOCATION_STORE_LEAD_CHANGED,
      locationId: locId,
      metadata: {
        location_name: locName,
        previous_manager_employee_id: previousManagerId,
        new_manager_employee_id: null,
      },
    });
    revalidatePath("/locations");
    revalidatePath("/security-audit");
    return { ok: true };
  }

  const mgrId = managerEmployeeId.trim();
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, role, status, location_id")
    .eq("id", mgrId)
    .maybeSingle();

  if (empErr) return { ok: false, error: empErr.message };
  if (!emp) return { ok: false, error: "Employee not found." };

  const status = String((emp as { status?: string }).status ?? "");
  if (status === "archived" || status === "inactive") {
    return { ok: false, error: "Cannot assign an archived or inactive employee as store lead." };
  }
  if (normalizeRoleLabel(String((emp as { role?: string }).role)) !== "store_manager") {
    return { ok: false, error: "Store lead must be a Store Manager." };
  }
  const empLoc = (emp as { location_id: string | null }).location_id;
  if (empLoc !== locId) {
    return {
      ok: false,
      error: "Store lead must belong to this store.",
    };
  }

  const { error: updErr } = await supabase
    .from("locations")
    .update({ manager_employee_id: mgrId })
    .eq("id", locId);

  if (updErr) return { ok: false, error: updErr.message };

  const actorId = await resolveActorEmployeeId(supabase);
  await insertSecurityAudit(supabase, {
    actorEmployeeId: actorId,
    action: SECURITY_AUDIT_ACTIONS.LOCATION_STORE_LEAD_CHANGED,
    targetEmployeeId: mgrId,
    locationId: locId,
    metadata: {
      location_name: locName,
      previous_manager_employee_id: previousManagerId,
      new_manager_employee_id: mgrId,
    },
  });

  revalidatePath("/locations");
  revalidatePath("/security-audit");
  return { ok: true };
}
