import type { SupabaseClient } from "@supabase/supabase-js";

type EmployeeRow = {
  id: string;
  email: string | null;
  status: string;
};

export type HubSsoAccountError =
  | "sso_no_employee"
  | "sso_account_ambiguous"
  | "sso_account_conflict"
  | "sso_inactive_employee";

export type ResolvedHubSsoAccount = {
  employeeId: string;
  email: string;
  linkedVia: "hub_user_id" | "email_auto";
};

type HubAccountLinkRow = {
  employee_id: string;
  hub_email: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function loadActiveEmployee(
  admin: SupabaseClient,
  employeeId: string,
): Promise<EmployeeRow | null> {
  const { data, error } = await admin
    .from("employees")
    .select("id, email, status")
    .eq("id", employeeId)
    .maybeSingle();

  if (error || !data) return null;
  return data as EmployeeRow;
}

async function findLinkByHubUserId(
  admin: SupabaseClient,
  hubUserId: string,
): Promise<HubAccountLinkRow | null> {
  const { data, error } = await admin
    .from("hub_account_links")
    .select("employee_id, hub_email")
    .eq("hub_user_id", hubUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data as HubAccountLinkRow;
}

async function findActiveEmployeesByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<EmployeeRow[]> {
  const { data, error } = await admin
    .from("employees")
    .select("id, email, status")
    .ilike("email", email);

  if (error || !data) return [];
  return (data as EmployeeRow[]).filter((row) => row.status === "active");
}

async function upsertHubAccountLink(
  admin: SupabaseClient,
  input: {
    hubUserId: string;
    employeeId: string;
    hubEmail: string;
    linkedVia: "hub_user_id" | "email_auto";
  },
): Promise<"ok" | "conflict"> {
  const now = new Date().toISOString();
  const { error } = await admin.from("hub_account_links").upsert(
    {
      hub_user_id: input.hubUserId,
      employee_id: input.employeeId,
      hub_email: input.hubEmail,
      linked_via: input.linkedVia,
      updated_at: now,
    },
    { onConflict: "hub_user_id" },
  );

  if (!error) return "ok";

  if (error.code === "23505") {
    return "conflict";
  }

  console.error("[HR_SSO] hub_account_links upsert failed", {
    hubUserId: input.hubUserId,
    employeeId: input.employeeId,
    message: error.message,
  });
  return "conflict";
}

function employeeSessionEmail(employee: EmployeeRow, fallbackEmail: string): string | null {
  const fromRow = employee.email?.trim().toLowerCase();
  if (fromRow) return fromRow;
  return normalizeEmail(fallbackEmail);
}

/**
 * CPS-aligned Hub SSO account resolution:
 * 1) hub_user_id link → active employee
 * 2) else exact email on active employees → auto-link when exactly one
 * 3) else block
 */
export async function resolveHubSsoAccount(
  admin: SupabaseClient,
  payload: { sub: string; email: string },
): Promise<
  | { ok: true; account: ResolvedHubSsoAccount }
  | { ok: false; code: HubSsoAccountError }
> {
  const hubUserId = payload.sub.trim();
  const hubEmail = normalizeEmail(payload.email);

  if (!hubUserId || !hubEmail) {
    return { ok: false, code: "sso_no_employee" };
  }

  const existingLink = await findLinkByHubUserId(admin, hubUserId);
  if (existingLink) {
    const employee = await loadActiveEmployee(admin, existingLink.employee_id);
    if (!employee) {
      return { ok: false, code: "sso_no_employee" };
    }
    if (employee.status !== "active") {
      return { ok: false, code: "sso_inactive_employee" };
    }

    const sessionEmail = employeeSessionEmail(employee, hubEmail);
    if (!sessionEmail) {
      return { ok: false, code: "sso_no_employee" };
    }

    if (existingLink.hub_email !== hubEmail) {
      await admin
        .from("hub_account_links")
        .update({ hub_email: hubEmail, updated_at: new Date().toISOString() })
        .eq("hub_user_id", hubUserId);
    }

    return {
      ok: true,
      account: {
        employeeId: employee.id,
        email: sessionEmail,
        linkedVia: "hub_user_id",
      },
    };
  }

  const matches = await findActiveEmployeesByEmail(admin, hubEmail);
  if (matches.length === 0) {
    return { ok: false, code: "sso_no_employee" };
  }
  if (matches.length > 1) {
    return { ok: false, code: "sso_account_ambiguous" };
  }

  const employee = matches[0]!;
  const sessionEmail = employeeSessionEmail(employee, hubEmail);
  if (!sessionEmail) {
    return { ok: false, code: "sso_no_employee" };
  }

  const linkResult = await upsertHubAccountLink(admin, {
    hubUserId,
    employeeId: employee.id,
    hubEmail,
    linkedVia: "email_auto",
  });

  if (linkResult === "conflict") {
    return { ok: false, code: "sso_account_conflict" };
  }

  return {
    ok: true,
    account: {
      employeeId: employee.id,
      email: sessionEmail,
      linkedVia: "email_auto",
    },
  };
}
