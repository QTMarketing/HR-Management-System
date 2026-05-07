/**
 * Seed PTO opening balances into `public.pto_ledger_entries` via the owner-only RPC:
 *   public.pto_seed_opening_balances(jsonb)
 *
 * CSV format (columns):
 * - employee_id (uuid)
 * - vacation_hours (number)
 * - sick_hours (number)
 * - effective_at (optional ISO timestamp; if omitted, defaults to now())
 *
 * Safety:
 * - Reads CSV from an arbitrary local path (outside the repo is fine).
 * - Does NOT print any IDs/PII to stdout; prints counts only.
 *
 * Usage:
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
 *   npx tsx scripts/import/pto_opening_balances_from_csv.ts \
 *     --csv "/path/to/opening_balances.csv"
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseScriptEnv } from "./load-supabase-env";

type Row = {
  employee_id: string;
  bucket: "vacation" | "sick";
  amount_hours: number;
  effective_at?: string;
};

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const rec: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) rec[header[i]] = (cols[i] ?? "").trim();
    out.push(rec);
  }
  return out;
}

// Minimal CSV parser: handles commas + quoted fields.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function toNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function main() {
  const csvPath = argValue("--csv");
  if (!csvPath) {
    throw new Error('Missing --csv "/path/to/file.csv"');
  }

  const { url, serviceKey } = getSupabaseScriptEnv();

  const abs = path.resolve(csvPath);
  const raw = fs.readFileSync(abs, "utf8");
  const records = parseCsv(raw);

  let rows: Row[] = [];
  let skipped = 0;
  for (const r of records) {
    const employeeId = (r.employee_id ?? "").trim();
    const vac = toNum(r.vacation_hours ?? "") ?? 0;
    const sick = toNum(r.sick_hours ?? "") ?? 0;
    const effectiveAt = (r.effective_at ?? "").trim() || undefined;

    if (!employeeId) {
      skipped++;
      continue;
    }

    if (vac > 0) {
      rows.push({ employee_id: employeeId, bucket: "vacation", amount_hours: vac, effective_at: effectiveAt });
    }
    if (sick > 0) {
      rows.push({ employee_id: employeeId, bucket: "sick", amount_hours: sick, effective_at: effectiveAt });
    }

    if (vac <= 0 && sick <= 0) skipped++;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Chunk to avoid payload limits.
  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase.rpc("pto_seed_opening_balances", {
      p_rows: chunk,
    });
    if (error) throw new Error(error.message);
    inserted += Number(data ?? 0);
  }

  // Only print aggregate counts (no employee ids / PII).
  process.stdout.write(
    `done: attempted=${rows.length} inserted=${inserted} skipped=${skipped}\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exit(1);
});

