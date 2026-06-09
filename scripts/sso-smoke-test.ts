/**
 * Sign a Hub-style JWT and GET the HR SSO consume URL (smoke test).
 * Usage: npx tsx scripts/sso-smoke-test.ts --base https://hr-management-system-azure.vercel.app
 */

import { createHmac } from "crypto";
import { getSupabaseScriptEnv, loadRepoEnvFiles } from "./import/load-supabase-env";

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signHubSsoToken(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function main() {
  loadRepoEnvFiles();
  const base = (argValue("--base") ?? "http://localhost:3002").replace(/\/$/, "");
  const email = (argValue("--email") ?? "admin@quicktrack.com").trim().toLowerCase();
  const secret = process.env.SSO_SHARED_SECRET?.trim();
  if (!secret) throw new Error("SSO_SHARED_SECRET missing in .env.local");

  const now = Math.floor(Date.now() / 1000);
  const token = signHubSsoToken(
    {
      iss: "quicktrack-hub",
      aud: "staff-operations",
      sub: "smoke-test",
      email,
      name: "Smoke Test",
      role: "ADMIN",
      iat: now,
      exp: now + 300,
    },
    secret,
  );

  const url = `${base}/api/auth/sso/consume?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/")}`;
  const res = await fetch(url, { redirect: "manual" });

  process.stdout.write(`base=${base}\n`);
  process.stdout.write(`status=${res.status}\n`);
  process.stdout.write(`location=${res.headers.get("location") ?? "(none)"}\n`);

  const loc = res.headers.get("location") ?? "";
  if (loc.includes("error=sso_not_configured")) {
    process.stdout.write("result=FAIL secret not set on host\n");
    process.exit(1);
  }
  if (loc.includes("error=sso_invalid_token")) {
    process.stdout.write("result=FAIL secret mismatch or bad token\n");
    process.exit(1);
  }
  if (loc.includes("error=sso_no_employee")) {
    process.stdout.write("result=FAIL employee not in HR directory\n");
    process.exit(1);
  }
  if (res.status === 307 || res.status === 302) {
    if (loc.includes("/login?error=")) {
      process.stdout.write(`result=FAIL ${loc}\n`);
      process.exit(1);
    }
    process.stdout.write("result=OK redirect to app (session cookies set)\n");
    return;
  }
  process.stdout.write("result=UNEXPECTED\n");
  process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exit(1);
});
