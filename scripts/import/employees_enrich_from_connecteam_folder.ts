/**
 * Import a folder of curated Connecteam export CSVs (name → value) and update `employees`.
 *
 * Intended input: the "employee_store_overrides 2" folder you created.
 *
 * Files supported (all optional; if missing, skipped):
 * - employee_email_data.csv                    -> employees.email
 * - employee_store_overrides.csv               -> employees.location_id (primary) + employee_location_assignments (all stores)
 * - employee_mobile_phone_data.csv             -> employees.mobile_phone (normalized +1 when possible)
 * - employee_birthday_data.csv                 -> employees.birth_date (date)
 * - employee_employment_start_date_data.csv    -> employees.employment_start_date (date)
 * - employee_kiosk_code_data.csv               -> employees.kiosk_code
 * - employee_title_data.csv                    -> employees.title
 * - employee_position_data.csv                 -> employees.role
 * - employee_last_login_data.csv               -> employees.last_login (timestamptz at 00:00Z)
 * - employee_date_added_data.csv               -> employees.connecteam_date_added (date)
 * - employee_direct_manager_data.csv           -> employees.direct_manager_id (resolved by manager name via email map)
 *
 * Notes:
 * - Each CSV typically has a title line first (e.g. "Email Data - Assigned") which is ignored automatically.
 * - Rows are matched primarily by email once the email map is loaded (more reliable than name matching).
 * - Stdout prints aggregate counts only.
 *
 * Usage:
 *   npx tsx scripts/import/employees_enrich_from_connecteam_folder.ts --dir "/path/to/folder" --dry-run
 *   npx tsx scripts/import/employees_enrich_from_connecteam_folder.ts --dir "/path/to/folder"
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

function parseKeyValueCsv(
  raw: string,
): { keyHeader: string; valueHeader: string; rows: { name: string; value: string }[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { keyHeader: "employee_name", valueHeader: "value", rows: [] };

  const first = splitCsvLine(lines[0]).map((c) => c.trim());
  const second = splitCsvLine(lines[1]).map((c) => c.trim());
  const looksLikeHeader = (cols: string[]) =>
    cols.some((c) => /employee\s*name/i.test(c) || /\bname\b/i.test(c)) && cols.length >= 2;
  const headerLineIdx = looksLikeHeader(first) ? 0 : looksLikeHeader(second) ? 1 : 0;
  const headerRaw = splitCsvLine(lines[headerLineIdx]).map((c) => c.trim());
  const keyHeader = headerRaw[0] ?? "Employee Name";
  const valueHeader = headerRaw[1] ?? "Value";

  const rows: { name: string; value: string }[] = [];
  for (const line of lines.slice(headerLineIdx + 1)) {
    const cols = splitCsvLine(line);
    const name = (cols[0] ?? "").trim();
    const value = (cols[1] ?? "").trim();
    if (!name) continue;
    rows.push({ name, value });
  }
  return { keyHeader, valueHeader, rows };
}

function parseFlexibleDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizePhone(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("+")) return t;
  const digits = t.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return null;
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

function safeReadIfExists(p: string): string | null {
  try {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

async function main() {
  const dir = argValue("--dir");
  if (!dir) throw new Error('Missing --dir "/path/to/folder"');
  const dryRun = hasFlag("--dry-run");

  const { url, serviceKey } = getSupabaseScriptEnv();
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dirAbs = path.resolve(dir);
  const file = (name: string) => path.join(dirAbs, name);

  const emailRaw = safeReadIfExists(file("employee_email_data.csv"));
  if (!emailRaw) {
    throw new Error(
      'Missing required "employee_email_data.csv" in the folder. We use it to match rows reliably.',
    );
  }

  const emailCsv = parseKeyValueCsv(emailRaw);
  const nameToEmail = new Map<string, string>();
  for (const r of emailCsv.rows) {
    const email = r.value.trim().toLowerCase();
    if (!email) continue;
    nameToEmail.set(r.name.trim().toLowerCase(), email);
  }

  // Load employees once.
  const { data: empRows, error: empErr } = await supabase
    .from("employees")
    .select("id, email, full_name")
    .limit(5000);
  if (empErr) throw new Error(empErr.message);
  const employees = (empRows ?? []) as { id: string; email: string | null; full_name: string | null }[];
  const byEmail = new Map<string, { id: string; email: string | null; full_name: string | null }>();
  for (const e of employees) {
    const em = (e.email ?? "").trim().toLowerCase();
    if (em) byEmail.set(em, e);
  }

  // Locations for store resolution.
  const { data: locRows, error: locErr } = await supabase
    .from("locations")
    .select("id, name, slug, status")
    .neq("status", "archived");
  if (locErr) throw new Error(locErr.message);
  const locs = (locRows ?? []) as { id: string; name: string; slug: string }[];
  const bySlug = new Map(locs.map((l) => [String(l.slug).trim().toLowerCase(), l] as const));
  const byName = new Map(locs.map((l) => [String(l.name).trim().toLowerCase(), l] as const));

  // Optional assignments table.
  const { error: assignTableErr } = await supabase
    .from("employee_location_assignments")
    .select("employee_id")
    .limit(1);
  const hasAssignmentsTable = !assignTableErr;

  const counters: Record<string, number> = {
    patched: 0,
    skipped_no_email: 0,
    skipped_employee_missing: 0,
    skipped_value_blank: 0,
    store_unresolved: 0,
    manager_unresolved: 0,
    failures: 0,
  };

  async function patchByName(
    name: string,
    patch: Record<string, unknown>,
    opts?: { allowBlankValueSkip?: boolean },
  ): Promise<void> {
    const key = name.trim().toLowerCase();
    const email = nameToEmail.get(key) ?? "";
    if (!email) {
      counters.skipped_no_email++;
      return;
    }
    const emp = byEmail.get(email);
    if (!emp) {
      counters.skipped_employee_missing++;
      return;
    }
    if (opts?.allowBlankValueSkip && Object.keys(patch).length === 0) {
      counters.skipped_value_blank++;
      return;
    }
    if (dryRun) {
      counters.patched++;
      return;
    }
    const { error } = await supabase.from("employees").update(patch).eq("id", emp.id);
    if (error) counters.failures++;
    else counters.patched++;
  }

  async function importSimple(fileName: string, apply: (name: string, value: string) => Promise<void>) {
    const raw = safeReadIfExists(file(fileName));
    if (!raw) return;
    const csv = parseKeyValueCsv(raw);
    for (const r of csv.rows) await apply(r.name, r.value);
  }

  // 1) Mobile phone
  await importSimple("employee_mobile_phone_data.csv", async (name, value) => {
    const phone = normalizePhone(value) ?? value.trim();
    if (!phone) {
      counters.skipped_value_blank++;
      return;
    }
    await patchByName(name, { mobile_phone: phone });
  });

  // 2) Birthday -> birth_date
  await importSimple("employee_birthday_data.csv", async (name, value) => {
    const d = parseFlexibleDate(value);
    if (!d) {
      counters.skipped_value_blank++;
      return;
    }
    await patchByName(name, { birth_date: d });
  });

  // 3) Employment start date
  await importSimple("employee_employment_start_date_data.csv", async (name, value) => {
    const d = parseFlexibleDate(value);
    if (!d) {
      counters.skipped_value_blank++;
      return;
    }
    await patchByName(name, { employment_start_date: d });
  });

  // 4) Kiosk code
  await importSimple("employee_kiosk_code_data.csv", async (name, value) => {
    const v = value.trim();
    if (!v) {
      counters.skipped_value_blank++;
      return;
    }
    await patchByName(name, { kiosk_code: v });
  });

  // 5) Title
  await importSimple("employee_title_data.csv", async (name, value) => {
    const v = value.trim();
    if (!v) {
      counters.skipped_value_blank++;
      return;
    }
    await patchByName(name, { title: v });
  });

  // 6) Position -> role
  await importSimple("employee_position_data.csv", async (name, value) => {
    const v = value.trim();
    if (!v) {
      counters.skipped_value_blank++;
      return;
    }
    await patchByName(name, { role: v });
  });

  // 7) Last login -> timestamptz (00:00Z)
  await importSimple("employee_last_login_data.csv", async (name, value) => {
    const d = parseFlexibleDate(value);
    if (!d) {
      counters.skipped_value_blank++;
      return;
    }
    await patchByName(name, { last_login: `${d}T00:00:00.000Z` });
  });

  // 8) Date added -> connecteam_date_added
  await importSimple("employee_date_added_data.csv", async (name, value) => {
    const d = parseFlexibleDate(value);
    if (!d) {
      counters.skipped_value_blank++;
      return;
    }
    await patchByName(name, { connecteam_date_added: d });
  });

  // 9) Store overrides
  const storeRaw = safeReadIfExists(file("employee_store_overrides.csv"));
  if (storeRaw) {
    const csv = parseKeyValueCsv(storeRaw);
    for (const r of csv.rows) {
      const stores = segments(r.value);
      if (stores.length === 0) continue; // unassigned list handled elsewhere
      const storeIds = stores
        .map((s) => tryResolveStoreSegment(s, bySlug, byName))
        .filter((x): x is string => Boolean(x));
      if (storeIds.length === 0) {
        counters.store_unresolved++;
        continue;
      }
      const primary = storeIds[0];
      await patchByName(r.name, { location_id: primary });

      if (!hasAssignmentsTable) continue;
      const email = nameToEmail.get(r.name.trim().toLowerCase()) ?? "";
      const emp = email ? byEmail.get(email) : null;
      if (!emp) continue;

      if (dryRun) continue;

      const assignmentRows = Array.from(new Set(storeIds)).map((location_id) => ({
        employee_id: emp.id,
        location_id,
        is_primary: location_id === primary,
      }));
      const { error } = await supabase
        .from("employee_location_assignments")
        .upsert(assignmentRows, { onConflict: "employee_id,location_id" });
      if (error) counters.failures++;
    }
  }

  // 10) Direct manager -> direct_manager_id (via manager name -> email map)
  await importSimple("employee_direct_manager_data.csv", async (name, managerName) => {
    const mgr = managerName.trim();
    if (!mgr) {
      counters.skipped_value_blank++;
      return;
    }
    const mgrEmail = nameToEmail.get(mgr.toLowerCase()) ?? "";
    if (!mgrEmail) {
      counters.manager_unresolved++;
      return;
    }
    const mgrEmp = byEmail.get(mgrEmail);
    if (!mgrEmp) {
      counters.manager_unresolved++;
      return;
    }
    await patchByName(name, { direct_manager_id: mgrEmp.id });
  });

  process.stdout.write(
    `done: dry_run=${dryRun} patched=${counters.patched} skipped_no_email=${counters.skipped_no_email} skipped_employee_missing=${counters.skipped_employee_missing} skipped_value_blank=${counters.skipped_value_blank} store_unresolved=${counters.store_unresolved} manager_unresolved=${counters.manager_unresolved} failures=${counters.failures} assignments_table=${hasAssignmentsTable}\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exit(1);
});

