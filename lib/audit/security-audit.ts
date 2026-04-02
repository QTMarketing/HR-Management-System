import type { SupabaseClient } from "@supabase/supabase-js";

export const SECURITY_AUDIT_ACTIONS = {
  ADMIN_ACCESS_UPDATED: "admin_access_updated",
  EMPLOYEE_PROMOTED_STORE_MANAGER: "employee_promoted_store_manager",
  LOCATION_STORE_LEAD_CHANGED: "location_store_lead_changed",
  ORGANIZATION_OWNER_CHANGED: "organization_owner_changed",
  EMPLOYEE_ARCHIVED: "employee_archived",
  TIME_ENTRY_ARCHIVED: "time_entry_archived",
} as const;

export type SecurityAuditAction =
  (typeof SECURITY_AUDIT_ACTIONS)[keyof typeof SECURITY_AUDIT_ACTIONS];

export async function resolveActorEmployeeId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const email = user.email.trim().toLowerCase();
  const { data } = await supabase.from("employees").select("id").ilike("email", email).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Best-effort audit write; logs server-side if insert fails (change already applied). */
export async function insertSecurityAudit(
  supabase: SupabaseClient,
  params: {
    actorEmployeeId: string | null;
    action: SecurityAuditAction;
    targetEmployeeId?: string | null;
    locationId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("security_audit_events").insert({
    actor_employee_id: params.actorEmployeeId,
    action: params.action,
    target_employee_id: params.targetEmployeeId ?? null,
    location_id: params.locationId ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) console.error("[security_audit]", error.message);
}
