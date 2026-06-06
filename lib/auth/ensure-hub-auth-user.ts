import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Ensure Supabase Auth has a confirmed user for Hub SSO email lookup. */
export async function ensureHubAuthUser(
  admin: SupabaseClient,
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalized = email.trim().toLowerCase();

  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listErr) {
    return { ok: false, message: listErr.message };
  }

  const existing =
    listed.users.find((u) => (u.email ?? "").toLowerCase() === normalized) ?? null;

  if (existing) {
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
    });
    if (updErr) {
      return { ok: false, message: updErr.message };
    }
    return { ok: true };
  }

  const password = randomBytes(32).toString("base64url");
  const { error: createErr } = await admin.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
  });

  if (createErr) {
    return { ok: false, message: createErr.message };
  }

  return { ok: true };
}
