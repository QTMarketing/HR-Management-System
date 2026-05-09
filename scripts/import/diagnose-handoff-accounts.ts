/**
 * One-shot diagnostic for the HR beta handoff.
 *
 * Lists every Supabase Auth user that *also* has a matching `public.employees`
 * row, buckets them into "manager-capable" vs "employee POV", and prints the
 * top candidates per bucket. Read-only — no inserts, no password resets.
 *
 * Usage:
 *   npx tsx scripts/import/diagnose-handoff-accounts.ts
 */

import { createClient } from "@supabase/supabase-js";
import { getSupabaseScriptEnv } from "./load-supabase-env";

type Emp = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  status: string | null;
  admin_access: Record<string, Record<string, boolean>> | null;
  location_id: string | null;
};

type Loc = { id: string; label: string | null };

function isManagerLike(e: Emp): boolean {
  const r = (e.role ?? "").toLowerCase();
  if (
    r.includes("manager") ||
    r.includes("owner") ||
    r.includes("admin")
  ) {
    return true;
  }
  const a = e.admin_access ?? {};
  for (const scope of Object.values(a)) {
    if (scope && typeof scope === "object") {
      for (const v of Object.values(scope)) {
        if (v === true) return true;
      }
    }
  }
  return false;
}

async function main() {
  const { url, serviceKey } = getSupabaseScriptEnv();
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Connected to ${url}`);

  // Page through auth.users via admin API
  const auth: { id: string; email: string; confirmed: boolean }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email) {
        auth.push({
          id: u.id,
          email: u.email.toLowerCase(),
          confirmed: Boolean(u.email_confirmed_at),
        });
      }
    }
    if (data.users.length < 200) break;
    if (page > 25) break;
  }

  const { data: emps, error: empErr } = await admin
    .from("employees")
    .select("id, email, full_name, role, status, admin_access, location_id");
  if (empErr) throw empErr;

  const { data: locs } = await admin.from("locations").select("id, label");
  const locById = new Map<string, string>();
  for (const l of (locs ?? []) as Loc[]) {
    if (l?.id) locById.set(l.id, l.label ?? "—");
  }

  const empByEmail = new Map<string, Emp>();
  for (const e of (emps ?? []) as Emp[]) {
    if (e.email) empByEmail.set(e.email.toLowerCase(), e);
  }

  type Joined = {
    email: string;
    confirmed: boolean;
    employee: Emp | null;
    store: string;
    isManager: boolean;
  };

  const joined: Joined[] = auth.map((a) => {
    const e = empByEmail.get(a.email) ?? null;
    return {
      email: a.email,
      confirmed: a.confirmed,
      employee: e,
      store: e?.location_id ? (locById.get(e.location_id) ?? "—") : "—",
      isManager: e ? isManagerLike(e) : false,
    };
  });

  const usable = joined.filter(
    (j) => j.confirmed && j.employee && j.employee.status === "active",
  );
  const managers = usable.filter((j) => j.isManager);
  const employees = usable.filter((j) => !j.isManager);

  console.log(`\n=== Auth users with active employee row ===`);
  console.log(`  total: ${usable.length}`);
  console.log(`  managers/admins: ${managers.length}`);
  console.log(`  employees only:  ${employees.length}`);

  console.log(`\n=== MANAGER-CAPABLE candidates ===`);
  if (!managers.length) {
    console.log("  (none)");
  } else {
    for (const m of managers.slice(0, 10)) {
      console.log(
        `  ${m.email.padEnd(40)} | role="${m.employee?.role ?? "—"}" | store=${m.store}`,
      );
    }
  }

  console.log(`\n=== EMPLOYEE-ONLY candidates ===`);
  if (!employees.length) {
    console.log("  (none — nobody who can log in is rank-and-file)");
  } else {
    for (const e of employees.slice(0, 10)) {
      console.log(
        `  ${e.email.padEnd(40)} | role="${e.employee?.role ?? "—"}" | store=${e.store}`,
      );
    }
  }

  // For employee POV, also print top non-manager employees who DON'T have
  // auth — those are candidates we could provision in 30 seconds.
  const nonAuthEmps = ((emps ?? []) as Emp[]).filter(
    (e) =>
      e.email &&
      e.status === "active" &&
      !auth.some((a) => a.email === e.email!.toLowerCase()) &&
      !isManagerLike(e),
  );
  console.log(
    `\n=== Employees with no auth row (could provision via the QA script) ===`,
  );
  console.log(`  total: ${nonAuthEmps.length}`);
  for (const e of nonAuthEmps.slice(0, 5)) {
    console.log(
      `  ${(e.email ?? "").padEnd(40)} | ${e.full_name ?? "—"} | role="${e.role ?? "—"}"`,
    );
  }
}

main().catch((err) => {
  console.error("Diagnostic failed:", err instanceof Error ? err.message : err);
  process.exit(2);
});
