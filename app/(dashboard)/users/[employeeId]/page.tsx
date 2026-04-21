import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { EmployeeProfileClient } from "@/components/users/employee-profile-client";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const PROFILE_SELECT = [
  "id",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "role",
  "status",
  "created_at",
  "location_id",
  "direct_manager_id",
  "mobile_phone",
  "birth_date",
  "employment_start_date",
  "kiosk_code",
  "last_login",
  "added_by",
  "employee_code",
].join(",");

type ProfileRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  created_at: string | null;
  location_id: string | null;
  direct_manager_id: string | null;
  mobile_phone: string | null;
  birth_date: string | null;
  title: string | null;
  employment_start_date: string | null;
  kiosk_code: string | null;
  last_login: string | null;
  added_by: string | null;
  employee_code: string | null;
};

/** Compact numeric id for display (Connecteam-style), derived from UUID. */
function appUserIdFromUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 10);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return uuid.slice(0, 8);
  const compact = (n % 89_000_000) + 10_000_000;
  return String(compact);
}

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  await requirePermission(PERMISSIONS.USERS_VIEW);

  const { employeeId } = await params;
  const id = employeeId?.trim();
  if (!id) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);
  const canEdit = hasPermission(rbac, PERMISSIONS.USERS_MANAGE);
  const canSetOrgOwner = hasPermission(rbac, PERMISSIONS.ORG_OWNER);

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .neq("status", "archived")
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

  const { data: row, error } = await supabase
    .from("employees")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !row) notFound();

  const rec = row as unknown as ProfileRow;
  const locationId = rec.location_id ?? null;
  const isOrgOwner = normalizeRoleLabel(rec.role ?? "") === "owner";
  const employeeStatus = String(rec.status ?? "active");
  const isArchivedProfile = employeeStatus === "archived";
  const canArchiveUser = canEdit && !isArchivedProfile;
  const canEditForm = canEdit && !isArchivedProfile;
  if (!scopeAll && locationId !== selectedLocationId) {
    notFound();
  }

  const { data: memberRows } = await supabase
    .from("smart_group_members")
    .select("smart_group_id")
    .eq("employee_id", id);

  const groupIds = [...new Set((memberRows ?? []).map((m) => m.smart_group_id as string))];
  let groupNames: string[] = [];
  if (groupIds.length) {
    const { data: gRows } = await supabase
      .from("smart_groups")
      .select("id, name")
      .in("id", groupIds)
      .order("sort_order", { ascending: true });
    groupNames = (gRows ?? []).map((g) => String((g as { name?: string }).name ?? "")).filter(Boolean);
  }

  const { data: mgrRows } = await supabase
    .from("employees")
    .select("id, full_name, first_name, last_name, location_id, role")
    .eq("status", "active");

  const storeManagers = (mgrRows ?? [])
    .filter((m) => normalizeRoleLabel(String((m as { role?: string }).role)) === "store_manager")
    .map((m) => ({
      id: String((m as { id: string }).id),
      full_name: String((m as { full_name?: string }).full_name ?? ""),
      first_name: (m as { first_name: string | null }).first_name,
      last_name: (m as { last_name: string | null }).last_name,
      location_id: (m as { location_id: string | null }).location_id,
    }));

  const createdAt = rec.created_at ?? null;
  /** Request-time instant (avoid Date.now() in render — react-hooks/purity). */
  const asOfMs = new Date().getTime();
  let daysInSystem: number | null = null;
  if (createdAt) {
    const t = new Date(createdAt).getTime();
    if (!Number.isNaN(t)) {
      daysInSystem = Math.max(0, Math.floor((asOfMs - t) / 86_400_000));
    }
  }

  const addedViaLabel = rec.added_by?.trim() || "Account sign up";

  const initial = {
    id: rec.id,
    first_name: (rec.first_name ?? "").trim() || displayFirstFromRow(rec),
    last_name: (rec.last_name ?? "").trim() || displayLastFromRow(rec),
    mobile_phone: rec.mobile_phone ?? "",
    email: rec.email ?? "",
    employment_start_date: rec.employment_start_date
      ? String(rec.employment_start_date)
      : "",
    role: rec.role?.trim() || "Employee",
    location_id: locationId ?? "",
    direct_manager_id: rec.direct_manager_id ?? "",
    birth_date: rec.birth_date ? String(rec.birth_date) : "",
    employee_code: rec.employee_code ?? "",
    kiosk_code: rec.kiosk_code ?? "",
  };

  return (
    <EmployeeProfileClient
      initial={initial}
      locations={(locRows ?? []).map((l) => ({ id: l.id, name: l.name }))}
      storeManagers={storeManagers}
      groupNames={groupNames}
      canEdit={canEditForm}
      canArchiveUser={canArchiveUser}
      isArchivedProfile={isArchivedProfile}
      canSetOrgOwner={canSetOrgOwner && !isArchivedProfile}
      isOrgOwner={isOrgOwner}
      appUserIdDisplay={appUserIdFromUuid(rec.id)}
      daysInSystem={daysInSystem}
      addedViaLabel={addedViaLabel}
      lastLogin={rec.last_login ?? null}
    />
  );
}

function displayFirstFromRow(rec: ProfileRow): string {
  const full = (rec.full_name ?? "").trim();
  const parts = full.split(/\s+/).filter(Boolean);
  return parts[0] ?? "";
}

function displayLastFromRow(rec: ProfileRow): string {
  const full = (rec.full_name ?? "").trim();
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(1).join(" ");
}
