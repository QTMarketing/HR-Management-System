"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmployeeProfilePayload = {
  first_name: string;
  last_name: string;
  mobile_phone: string;
  email: string;
  employment_start_date: string;
  role: string;
  location_id: string;
  direct_manager_id: string;
  birth_date: string;
  employee_code: string;
};

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

async function gateManage(): Promise<ProfileActionResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.USERS_MANAGE)) {
    return { ok: false, error: "You don’t have permission to edit users." };
  }
  return null;
}

export async function updateEmployeeProfile(
  employeeId: string,
  payload: EmployeeProfilePayload,
): Promise<ProfileActionResult> {
  const supabase0 = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase0.auth.getUser();
  const ctx0 = await getRbacContext(supabase0, user);

  const g = await gateManage();
  if (g) return g;

  const id = employeeId?.trim();
  if (!id) return { ok: false, error: "Missing employee." };

  const { data: existingRow, error: existingErr } = await supabase0
    .from("employees")
    .select("role")
    .eq("id", id)
    .maybeSingle();

  if (existingErr) return { ok: false, error: existingErr.message };

  const prevKey = normalizeRoleLabel(String((existingRow as { role?: string })?.role ?? ""));
  const nextKey = normalizeRoleLabel(payload.role.trim() || "Employee");
  if (prevKey === "owner" || nextKey === "owner") {
    if (!hasPermission(ctx0, PERMISSIONS.ORG_OWNER)) {
      return {
        ok: false,
        error:
          "Only organization owners can assign or remove the organization owner role. Use Organization owner on this page, or ask an owner.",
      };
    }
  }

  const first = payload.first_name.trim();
  const last = payload.last_name.trim();
  if (!first || !last) {
    return { ok: false, error: "First and last name are required." };
  }

  const locationId = payload.location_id.trim();
  if (!locationId) {
    return { ok: false, error: "Store is required." };
  }

  const directManagerId = payload.direct_manager_id.trim() || null;
  if (directManagerId) {
    const supabase = await createSupabaseServerClient();
    const { data: mgr } = await supabase
      .from("employees")
      .select("id, location_id, role")
      .eq("id", directManagerId)
      .maybeSingle();
    if (!mgr) return { ok: false, error: "Direct manager not found." };
    if ((mgr as { location_id: string | null }).location_id !== locationId) {
      return { ok: false, error: "Direct manager must work at the selected store." };
    }
    if (normalizeRoleLabel(String((mgr as { role?: string }).role)) !== "store_manager") {
      return { ok: false, error: "Direct manager must be a Store Manager." };
    }
  }

  const supabase = supabase0;
  const full_name = `${first} ${last}`.trim();
  const email = payload.email.trim() || null;
  const mobile_phone = payload.mobile_phone.trim() || null;
  const positionLabel = payload.role.trim() || "Employee";
  const employee_code = payload.employee_code.trim() || null;
  const birth_date = payload.birth_date.trim() || null;
  const employment_start_date = payload.employment_start_date.trim() || null;

  const { error } = await supabase
    .from("employees")
    .update({
      full_name,
      first_name: first,
      last_name: last,
      mobile_phone,
      email,
      title: positionLabel,
      role: positionLabel,
      location_id: locationId,
      direct_manager_id: directManagerId,
      birth_date,
      employment_start_date,
      employee_code,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  return { ok: true };
}
