import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccess } from "@/lib/users/admin-access";
import type { DirectoryEmployee, EmployeeJobTitle } from "@/lib/users/directory-buckets";

const EMPLOYEE_SELECT = [
  "id",
  "full_name",
  "email",
  "role",
  "status",
  "created_at",
  "location_id",
  "direct_manager_id",
  "mobile_phone",
  "birth_date",
  "first_name",
  "last_name",
  "title",
  "employment_start_date",
  "team",
  "department",
  "kiosk_code",
  "employee_code",
  "last_login",
  "added_by",
  "archived_at",
  "archived_by",
  "access_level",
  "managed_groups",
  "permissions_label",
  "admin_access",
  "admin_tab_enabled",
].join(",");

export async function loadDirectoryEmployees(
  supabase: SupabaseClient,
  options?: { locationId?: string | null; scopeAll?: boolean },
): Promise<{ employees: DirectoryEmployee[]; error: string | null }> {
  const { data: locRows, error: locErr } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  if (locErr) return { employees: [], error: locErr.message };

  const locNames = new Map((locRows ?? []).map((l) => [l.id, l.name] as const));

  let employeesQuery = supabase.from("employees").select(EMPLOYEE_SELECT).order("full_name", {
    ascending: true,
  });
  if (options?.locationId && !options.scopeAll) {
    employeesQuery = employeesQuery.eq("location_id", options.locationId);
  }

  const { data: rows, error } = await employeesQuery;
  if (error) return { employees: [], error: error.message };

  const ids = (rows ?? []).map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
  const titleByEmployeeRank = new Map<
    string,
    { primary: EmployeeJobTitle | null; secondary: EmployeeJobTitle | null }
  >();

  if (ids.length > 0) {
    const { data: ejtRows } = await supabase
      .from("employee_job_titles")
      .select("employee_id, rank, job_title:job_titles(id,name)")
      .in("employee_id", ids);
    for (const row of (ejtRows ?? []) as unknown as Array<Record<string, unknown>>) {
      const employeeId = String(row.employee_id ?? "");
      const rank = Number(row.rank ?? 0);
      const jt = row.job_title as { id?: string; name?: string } | null;
      if (!employeeId || !jt?.id) continue;
      const entry = titleByEmployeeRank.get(employeeId) ?? { primary: null, secondary: null };
      const t: EmployeeJobTitle = { id: String(jt.id), name: String(jt.name ?? "").trim() };
      if (rank === 1) entry.primary = t;
      if (rank === 2) entry.secondary = t;
      titleByEmployeeRank.set(employeeId, entry);
    }
  }

  const employees: DirectoryEmployee[] = (rows ?? []).map((r) => {
    const rec = r as unknown as Record<string, unknown>;
    const lid = rec.location_id as string | null;
    const t = titleByEmployeeRank.get(String(rec.id)) ?? { primary: null, secondary: null };
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
      direct_manager_id: (rec.direct_manager_id as string | null) ?? null,
      mobile_phone: (rec.mobile_phone as string | null) ?? null,
      birth_date: (rec.birth_date as string | null) ?? null,
      locationName: lid ? locNames.get(lid) ?? null : null,
      title: (rec.title as string | null) ?? null,
      employment_start_date: (rec.employment_start_date as string | null) ?? null,
      team: (rec.team as string | null) ?? null,
      department: (rec.department as string | null) ?? null,
      kiosk_code: (rec.kiosk_code as string | null) ?? null,
      employee_code: (rec.employee_code as string | null) ?? null,
      last_login: (rec.last_login as string | null) ?? null,
      added_by: (rec.added_by as string | null) ?? null,
      archived_at: (rec.archived_at as string | null) ?? null,
      archived_by: (rec.archived_by as string | null) ?? null,
      access_level: (rec.access_level as string | null) ?? null,
      managed_groups: (rec.managed_groups as string | null) ?? null,
      permissions_label: (rec.permissions_label as string | null) ?? null,
      admin_access: (rec.admin_access as AdminAccess | null) ?? null,
      admin_tab_enabled: Boolean(rec.admin_tab_enabled),
      primaryJobTitle: t.primary,
      secondaryJobTitle: t.secondary,
    };
  });

  return { employees, error: null };
}

export async function loadCompanyName(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from("chains").select("name").order("created_at").limit(1).maybeSingle();
  const name = (data as { name?: string } | null)?.name?.trim();
  return name || "Organization";
}
