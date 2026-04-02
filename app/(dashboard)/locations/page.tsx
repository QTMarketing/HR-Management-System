import { StoreDirectoryClient } from "@/components/locations/store-directory-client";
import type { DirectoryEmployee } from "@/lib/users/directory-buckets";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { AdminAccess } from "@/lib/users/admin-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMPLOYEE_SELECT = [
  "id",
  "full_name",
  "email",
  "role",
  "status",
  "location_id",
  "first_name",
  "last_name",
].join(",");

export default async function LocationsPage() {
  await requirePermission(PERMISSIONS.USERS_VIEW);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);
  const canAssignStoreLead =
    !rbac.enabled || hasPermission(rbac, PERMISSIONS.ORG_OWNER);

  const { data: locRows, error: locErr } = await supabase
    .from("locations")
    .select("id, name, manager_employee_id")
    .order("sort_order", { ascending: true });

  const migrationHint = (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      If <code className="rounded bg-amber-100/80 px-1">manager_employee_id</code> is missing, apply
      migration{" "}
      <code className="rounded bg-amber-100/80 px-1">017_locations_store_manager.sql</code>.
    </p>
  );

  if (locErr?.message?.includes("manager_employee_id") || locErr?.code === "42703") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Stores</h1>
        {migrationHint}
      </div>
    );
  }

  const { data: empRows, error: empErr } = await supabase
    .from("employees")
    .select(EMPLOYEE_SELECT)
    .order("full_name", { ascending: true });

  const employees: DirectoryEmployee[] = (empRows ?? []).map((r) => {
    const rec = r as unknown as Record<string, unknown>;
    const lid = rec.location_id as string | null;
    return {
      id: String(rec.id),
      full_name: String(rec.full_name ?? ""),
      first_name: (rec.first_name as string | null) ?? null,
      last_name: (rec.last_name as string | null) ?? null,
      email: (rec.email as string | null) ?? null,
      role: String(rec.role ?? ""),
      status: String(rec.status ?? "active"),
      created_at: "",
      location_id: lid,
      direct_manager_id: null,
      mobile_phone: null,
      birth_date: null,
      locationName: null,
      title: null,
      employment_start_date: null,
      team: null,
      department: null,
      kiosk_code: null,
      employee_code: null,
      last_login: null,
      added_by: null,
      archived_at: null,
      archived_by: null,
      access_level: null,
      managed_groups: null,
      permissions_label: null,
      admin_access: null as AdminAccess | null,
      admin_tab_enabled: false,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Stores</h1>
        <p className="mt-1 text-sm text-slate-600">
          Assign the accountable Store Manager for each location (org chart). Product permissions for
          admins are still controlled under Users → Admins → Permissions.
        </p>
      </div>

      {empErr ? (
        <>
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {empErr.message}
          </p>
          {migrationHint}
        </>
      ) : (
        <StoreDirectoryClient
          locations={(locRows ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            manager_employee_id:
              (r as { manager_employee_id?: string | null }).manager_employee_id ?? null,
          }))}
          employees={employees}
          canAssignStoreLead={canAssignStoreLead}
        />
      )}
    </div>
  );
}
