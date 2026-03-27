import { cookies } from "next/headers";
import { Suspense } from "react";
import { UsersDirectory } from "@/components/users/users-directory";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import type { DirectoryEmployee } from "@/lib/users/directory-buckets";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMPLOYEE_SELECT = [
                      "id",
                      "full_name",
                      "email",
                      "role",
                      "status",
                      "created_at",
                      "location_id",
                      "first_name",
                      "last_name",
                      "title",
                      "employment_start_date",
                      "team",
                      "department",
                      "kiosk_code",
                      "last_login",
                      "added_by",
                      "archived_at",
                      "archived_by",
                      "access_level",
                      "managed_groups",
                      "permissions_label",
                      "admin_tab_enabled",
                    ].join(",");

export default async function UsersPage() {
  await requirePermission(PERMISSIONS.USERS_VIEW);

  const supabase = await createSupabaseServerClient();

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  const locations: LocationRow[] = locationsForSession(
    (locRows ?? []).map((r) => ({ id: r.id, name: r.name })),
  );
  const cookieStore = await cookies();
  const selectedLocationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(selectedLocationId);
  const locationName =
    locations.find((l) => l.id === selectedLocationId)?.name ?? "All locations";

  const locNames = new Map((locRows ?? []).map((l) => [l.id, l.name] as const));

  let employeesQuery = supabase
    .from("employees")
    .select(EMPLOYEE_SELECT)
    .order("full_name", { ascending: true });
  if (!scopeAll) {
    employeesQuery = employeesQuery.eq("location_id", selectedLocationId);
  }
  const { data: rows, error } = await employeesQuery;

  const employees: DirectoryEmployee[] = (rows ?? []).map((r) => {
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
      created_at: String(rec.created_at ?? ""),
      location_id: lid,
      locationName: lid ? locNames.get(lid) ?? null : null,
      title: (rec.title as string | null) ?? null,
      employment_start_date: (rec.employment_start_date as string | null) ?? null,
      team: (rec.team as string | null) ?? null,
      department: (rec.department as string | null) ?? null,
      kiosk_code: (rec.kiosk_code as string | null) ?? null,
      last_login: (rec.last_login as string | null) ?? null,
      added_by: (rec.added_by as string | null) ?? null,
      archived_at: (rec.archived_at as string | null) ?? null,
      archived_by: (rec.archived_by as string | null) ?? null,
      access_level: (rec.access_level as string | null) ?? null,
      managed_groups: (rec.managed_groups as string | null) ?? null,
      permissions_label: (rec.permissions_label as string | null) ?? null,
      admin_tab_enabled: Boolean(rec.admin_tab_enabled),
    };
  });

  const migrationHint = (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      If you see a column error, run{" "}
      <code className="rounded bg-amber-100/80 px-1">
        supabase/migrations/009_employees_directory_connecteam.sql
      </code>{" "}
      in the Supabase SQL editor (after 003–008).
    </p>
  );

  return (
    <div className="space-y-4">
      {error ? (
        <>
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error.message}
          </p>
          {migrationHint}
        </>
      ) : (
        <Suspense
          fallback={
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Loading users…
            </div>
          }
        >
          <UsersDirectory employees={employees} locationLabel={locationName} />
        </Suspense>
      )}
    </div>
  );
}
