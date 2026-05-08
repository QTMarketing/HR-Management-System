/**
 * One-shot QA helper: create (or reset) a Supabase Auth user atomically.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local (same as the
 * other scripts/import/*.ts tools). Idempotent — re-running just re-confirms
 * the email and resets the password.
 *
 * Usage:
 *   npx tsx scripts/import/create-qa-auth-user.ts \
 *     --email emily@quicktrackinc.com \
 *     --password "EmployeeQA2026!"
 *
 * Or with defaults (matches the geofence bypass + employees-row seed):
 *   npx tsx scripts/import/create-qa-auth-user.ts
 *
 * What it does:
 *   1. Looks up the user by email via the admin API.
 *   2. If missing  -> create with `email_confirm: true` (no inbox needed).
 *   3. If existing -> update password + force email_confirmed_at via update.
 *   4. Verifies via /token endpoint that the password actually works.
 *
 * Stdout is short + safe to log (only prints email + status, no password).
 */

import { createClient } from "@supabase/supabase-js";
import { getSupabaseScriptEnv } from "./load-supabase-env";

type Args = { email: string; password: string };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1 || i + 1 >= argv.length) return undefined;
    return argv[i + 1];
  };
  return {
    email: (get("--email") ?? "emily@quicktrackinc.com").trim().toLowerCase(),
    password: get("--password") ?? "EmployeeQA2026!",
  };
}

async function verifyLogin(
  url: string,
  anonOrServiceKey: string,
  email: string,
  password: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  // Hit /auth/v1/token directly so we don't need the anon key — the service-role
  // key works as the bearer for admin endpoints, but /token (sign-in) is a
  // public endpoint that needs the apikey header. Service role is accepted
  // here too, just don't expose this script outside of trusted contexts.
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonOrServiceKey,
    },
    body: JSON.stringify({ email, password }),
  });
  if (res.ok) return { ok: true, status: res.status };
  let message: string | undefined;
  try {
    const body = (await res.json()) as { error_description?: string; msg?: string };
    message = body.error_description ?? body.msg;
  } catch {
    /* ignore parse errors */
  }
  return { ok: false, status: res.status, message };
}

async function main() {
  const { email, password } = parseArgs();
  if (!email.includes("@")) {
    console.error("Refusing to run: --email must be a valid address.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Refusing to run: --password must be at least 8 characters.");
    process.exit(1);
  }

  const { url, serviceKey } = getSupabaseScriptEnv();
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The admin API has no "get by email" endpoint, so we paginate. The first
  // page is plenty for QA tooling that targets a single email.
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    console.error(`[qa-auth] listUsers failed: ${listErr.message}`);
    process.exit(2);
  }
  const target = email.toLowerCase();
  const existing =
    listed.users.find((u) => (u.email ?? "").toLowerCase() === target) ?? null;

  if (existing) {
    console.log(`[qa-auth] Found existing user ${email} (id=${existing.id}). Resetting…`);
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error(`[qa-auth] updateUserById failed: ${updErr.message}`);
      process.exit(2);
    }
    console.log(`[qa-auth] Password reset and email confirmed for ${email}.`);
  } else {
    console.log(`[qa-auth] No user found for ${email}. Creating…`);
    const { data, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !data.user) {
      console.error(`[qa-auth] createUser failed: ${createErr?.message ?? "unknown error"}`);
      process.exit(2);
    }
    console.log(`[qa-auth] Created ${email} (id=${data.user.id}).`);
  }

  // Best-effort smoke test: try to actually sign in. Catches the "password
  // looks set but doesn't actually work" case.
  const verify = await verifyLogin(url, serviceKey, email, password);
  if (verify.ok) {
    console.log(`[qa-auth] ✓ Sign-in verified — you can log in at /login now.`);
  } else {
    console.warn(
      `[qa-auth] ⚠ Sign-in verification returned HTTP ${verify.status}` +
        (verify.message ? `: ${verify.message}` : "") +
        ". The user is created, but try logging in via the UI to confirm.",
    );
  }
}

main().catch((err) => {
  console.error("[qa-auth] Unhandled error:", err instanceof Error ? err.message : err);
  process.exit(2);
});
