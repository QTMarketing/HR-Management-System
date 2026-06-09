/**
 * Spot-check annual_grant rows vs pto_entitlement_hours_for_employee for a calendar year.
 * Usage: npx tsx scripts/pto-validate-accrual.ts --year 2026
 */

import { createClient } from "@supabase/supabase-js";
import { getSupabaseScriptEnv } from "./import/load-supabase-env";

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

async function main() {
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  if (!Number.isInteger(year)) throw new Error("Pass --year YYYY");

  const { url, serviceKey } = getSupabaseScriptEnv();
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  const asOf = `${year}-01-01`;
  const yearStart = `${year}-01-01T00:00:00.000Z`;
  const yearEnd = `${year + 1}-01-01T00:00:00.000Z`;

  const { data: emps, error } = await sb.from("employees").select("id, email").eq("status", "active");
  if (error) throw error;

  let mismatches = 0;
  const bad: string[] = [];

  for (const emp of emps ?? []) {
    for (const bucket of ["vacation", "sick"] as const) {
      const { data: ent, error: entErr } = await sb.rpc("pto_entitlement_hours_for_employee", {
        p_employee_id: emp.id,
        p_bucket: bucket,
        p_as_of: asOf,
      });
      if (entErr) throw entErr;

      const { data: grants } = await sb
        .from("pto_ledger_entries")
        .select("amount_hours")
        .eq("employee_id", emp.id)
        .eq("bucket", bucket)
        .eq("entry_type", "annual_grant")
        .gte("effective_at", yearStart)
        .lt("effective_at", yearEnd);

      const entitlement = Number(ent ?? 0);
      const grant = grants?.[0]?.amount_hours ?? null;

      const ok =
        entitlement <= 0 ? grant === null : Number(grant) === entitlement;

      if (!ok) {
        mismatches++;
        if (bad.length < 15) {
          bad.push(
            `${emp.email} ${bucket}: entitlement=${entitlement} grant=${grant ?? "none"}`,
          );
        }
      }
    }
  }

  const { count: grantRows } = await sb
    .from("pto_ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("entry_type", "annual_grant")
    .gte("effective_at", yearStart)
    .lt("effective_at", yearEnd);

  process.stdout.write(
    `year=${year} active_employees=${emps?.length ?? 0} annual_grant_rows=${grantRows ?? 0} mismatches=${mismatches}\n`,
  );
  if (bad.length) {
    process.stdout.write(`samples:\n${bad.map((b) => `  - ${b}`).join("\n")}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exit(1);
});
