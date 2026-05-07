/**
 * Update employee store assignment(s) from a simple CSV.
 *
 * Why:
 * - Your Connecteam export can be messy (blank Store, inconsistent Groups), which can assign many people
 *   to the wrong store (e.g. store 18).
 * - This script lets you use a curated list as the source of truth.
 *
 * CSV columns (headers case-insensitive; spaces allowed):
 * - name (required) — employee full name as it appears in `employees.full_name`
 * - stores (optional) — comma-separated list: `18` or `HQ, Lama Wholesale` or `65, 67, 68`
 *
 * Behavior:
 * - Matches employees by `full_name` case-insensitive.
 * - If `stores` is non-empty:
 *   - Sets `employees.location_id` to the FIRST resolved store (primary/home store).
 *   - Upserts `employee_location_assignments` for ALL resolved stores (if the table exists).
 * - If `stores` is empty:
 *   - Leaves `employees.location_id` unchanged (so unassigned people stay visible in Users).
 *
 * Usage:
 *   npx tsx scripts/import/employee_store_overrides_from_csv.ts --csv "/path/to/overrides.csv" --dry-run
 *   npx tsx scripts/import/employee_store_overrides_from_csv.ts --csv "/path/to/overrides.csv"
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseScriptEnv } from "./load-supabase-env";

type Loc = { id: string; name: string; slug: string };

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

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

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "");
}

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  // Some exports have a title line before the header (e.g. "Store Data - Assigned").
  const first = splitCsvLine(lines[0]).map((h) => h.trim());
  const second = lines.length >= 2 ? splitCsvLine(lines[1]).map((h) => h.trim()) : [];
  const looksLikeHeader = (cols: string[]) =>
    cols.some((c) => /employee\s*name/i.test(c) || /\bname\b/i.test(c)) &&
    cols.some((c) => /store/i.test(c) || /stores/i.test(c) || /location/i.test(c));
  const headerLineIdx = looksLikeHeader(first) ? 0 : looksLikeHeader(second) ? 1 : 0;
  const headerRaw = splitCsvLine(lines[headerLineIdx]).map((h) => h.trim());
  const headerNorm = headerRaw.map(normHeader);
  const out: Record<string, string>[] = [];
  for (const line of lines.slice(headerLineIdx + 1)) {
    const cols = splitCsvLine(line);
    const rec: Record<string, string> = {};
    for (let i = 0; i < headerNorm.length; i++) rec[headerNorm[i]] = (cols[i] ?? "").trim();
    out.push(rec);
  }
  return out;
}

function pick(rec: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = rec[normHeader(k)];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function segments(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function tryResolveStoreSegment(
  segment: string,
  bySlug: Map<string, Loc>,
  byName: Map<string, Loc>,
): string | null {
  const s = segment.trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const hit = bySlug.get(`store-${s}`.toLowerCase());
    if (hit) return hit.id;
  }

  const hitByName = byName.get(s.toLowerCase());
  if (hitByName) return hitByName.id;

  const hyphenSlug = s.toLowerCase().replace(/\s+/g, "-");
  const hit = bySlug.get(hyphenSlug) ?? bySlug.get(`store-${hyphenSlug}`);
  return hit?.id ?? null;
}

async function main() {
  const csvPath = argValue("--csv");
  if (!csvPath) throw new Error('Missing --csv "/path/to/overrides.csv"');
  const dryRun = hasFlag("--dry-run");

  const { url, serviceKey } = getSupabaseScriptEnv();
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const abs = path.resolve(csvPath);
  const raw = fs.readFileSync(abs, "utf8");
  const rows = parseCsv(raw);

  const { data: locRows, error: locErr } = await supabase
    .from("locations")
    .select("id, name, slug, status")
    .neq("status", "archived");
  if (locErr) throw new Error(locErr.message);
  const locs = (locRows ?? []) as { id: string; name: string; slug: string }[];
  const bySlug = new Map(locs.map((l) => [String(l.slug).trim().toLowerCase(), l] as const));
  const byName = new Map(locs.map((l) => [String(l.name).trim().toLowerCase(), l] as const));

  // Optional table — skip if missing (older schema).
  const { error: assignTableErr } = await supabase
    .from("employee_location_assignments")
    .select("employee_id")
    .limit(1);
  const hasAssignmentsTable = !assignTableErr;

  let matched = 0;
  let updated = 0;
  let skippedNoName = 0;
  let skippedNoEmployee = 0;
  let ambiguous = 0;
  let storeUnresolved = 0;
  let failures = 0;

  for (const rec of rows) {
    const name = pick(rec, ["name", "employee_name", "full_name"]);
    if (!name) {
      skippedNoName++;
      continue;
    }

    const storesRaw = pick(rec, ["stores", "store", "locations"]);
    const storeSegments = segments(storesRaw);
    const resolvedStoreIds = storeSegments
      .map((seg) => tryResolveStoreSegment(seg, bySlug, byName))
      .filter((x): x is string => Boolean(x));

    if (storeSegments.length > 0 && resolvedStoreIds.length === 0) {
      storeUnresolved++;
      continue;
    }

    const { data: hits, error: hitErr } = await supabase
      .from("employees")
      .select("id, full_name, location_id")
      .ilike("full_name", name)
      .limit(5);
    if (hitErr) {
      failures++;
      continue;
    }
    if (!hits || hits.length === 0) {
      skippedNoEmployee++;
      continue;
    }
    if (hits.length > 1) {
      ambiguous++;
      continue;
    }
    matched++;
    const employee = hits[0] as { id: string; full_name: string | null; location_id: string | null };

    if (resolvedStoreIds.length === 0) {
      // Unassigned: keep visible in Users, leave current location_id as-is.
      continue;
    }

    const primaryLocationId = resolvedStoreIds[0];
    if (dryRun) {
      updated++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("employees")
      .update({ location_id: primaryLocationId })
      .eq("id", employee.id);
    if (upErr) {
      failures++;
      continue;
    }

    if (hasAssignmentsTable) {
      // Add rows for all stores in the list.
      const assignmentRows = Array.from(new Set(resolvedStoreIds)).map((location_id) => ({
        employee_id: employee.id,
        location_id,
        is_primary: location_id === primaryLocationId,
      }));
      const { error: asErr } = await supabase
        .from("employee_location_assignments")
        .upsert(assignmentRows, { onConflict: "employee_id,location_id" });
      if (asErr) {
        failures++;
        continue;
      }
    }

    updated++;
  }

  process.stdout.write(
    `done: dry_run=${dryRun} matched=${matched} updated=${updated} ambiguous=${ambiguous} skipped_no_name=${skippedNoName} skipped_no_employee=${skippedNoEmployee} store_unresolved=${storeUnresolved} failures=${failures} total_rows=${rows.length} assignments_table=${hasAssignmentsTable}\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exit(1);
});

