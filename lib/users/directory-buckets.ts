import { normalizeRoleLabel } from "@/lib/rbac/matrix";

export type DirectoryEmployee = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
  location_id: string | null;
  locationName: string | null;
  title: string | null;
  employment_start_date: string | null;
  team: string | null;
  department: string | null;
  kiosk_code: string | null;
  last_login: string | null;
  added_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  access_level: string | null;
  managed_groups: string | null;
  permissions_label: string | null;
  admin_tab_enabled: boolean | null;
};

export type DirectoryTab = "users" | "admins" | "archived";

export function bucketForEmployee(e: DirectoryEmployee): DirectoryTab {
  if (e.status === "archived" || e.status === "inactive") return "archived";
  if (normalizeRoleLabel(e.role) === "store_manager") return "admins";
  return "users";
}

export function displayFirst(e: DirectoryEmployee): string {
  const t = e.first_name?.trim();
  if (t) return t;
  const parts = e.full_name.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? "—";
}

export function displayLast(e: DirectoryEmployee): string {
  const t = e.last_name?.trim();
  if (t) return t;
  const parts = e.full_name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return "—";
  return parts.slice(1).join(" ");
}

export function initialsFor(e: DirectoryEmployee): string {
  const a = displayFirst(e)[0] ?? "?";
  const b = displayLast(e)[0];
  return (a + (b ?? "")).toUpperCase();
}
