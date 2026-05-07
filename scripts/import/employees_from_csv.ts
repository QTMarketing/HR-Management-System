/**
 * Upsert `public.employees` from a CSV (local-only, uses service role).
 *
 * Why this exists:
 * - Store-assignment imports do not replace directory rows; Time Clock reads names from `employees`.
 * - This script matches rows by **email** (case-insensitive) and **updates** or **inserts**.
 *
 * CSV columns (headers are matched case-insensitively; common aliases supported):
 * - **email** (required) — also: `work_email`
 * - **first_name**, **last_name** — or **full_name** / `display_name` / `name`
 * - **role** (optional; default `Employee`) — also: `position`
 * - **title** (optional; defaults to `role`)
 * - Exactly one of (recommended):
 *   - **location_id** (uuid of store), or
 *   - **store_slug** (e.g. `store-118`), or
 *   - **store_name** (matches `locations.name`), or
 *   - **store** / **store_number** (digits only → `store-{n}`)
 * - **employment_start_date** (optional `YYYY-MM-DD` or US `M/D/YYYY`) — Connecteam: `Employment Start Date`
 * - **mobile_phone**, **birth_date** (optional; birth also accepts `Birthday` / US dates)
 * - **status** (optional: `active` | `inactive` | `archived`; default `active`)
 * - **employee_code** (optional)
 * - **kiosk_code** (optional; Connecteam **Kiosk code**)
 *
 * **Connecteam user export** (`First name`, `Last name`, `Email`, `Store`, `Groups`, …):
 * Headers normalize to `first_name`, `store`, etc. **Store** may be comma-separated; the first
 * segment that matches a `locations` slug (`store-101`) or **name** (`HQ`, `Lama Wholesale`) wins.
 * If **Store** is empty, the first 2–4 digit token in **Groups** (e.g. `102`) is tried as `store-{n}`.
 * - **fte_ratio** (optional `0..1` for PTO pro-rata)
 *
 * Safety:
 * - Reads CSV from outside the repo is fine.
 * - Stdout prints **counts only** (no emails/names).
 *
 * Usage:
 *   SUPABASE_URL="https://....supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   npx tsx scripts/import/employees_from_csv.ts --csv "/path/to/employees.csv"
 *
 * Dry run (no writes):
 *   ... npx tsx scripts/import/employees_from_csv.ts --csv "/path/to/employees.csv" --dry-run
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

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "");
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

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headerRaw = splitCsvLine(lines[0]).map((h) => h.trim());
  const headerNorm = headerRaw.map(normHeader);
  const out: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const rec: Record<string, string> = {};
    for (let i = 0; i < headerNorm.length; i++) {
      rec[headerNorm[i]] = (cols[i] ?? "").trim();
    }
    out.push(rec);
  }
  return out;
}

function pick(rec: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const nk = normHeader(k);
    const v = rec[nk];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseFte(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 1) return null;
  return n;
}

function splitFullName(full: string): { first: string; last: string } {
  const t = full.trim().replace(/\s+/g, " ");
  if (!t) return { first: "", last: "" };
  const sp = t.indexOf(" ");
  if (sp === -1) return { first: t, last: "" };
  return { first: t.slice(0, sp).trim(), last: t.slice(sp + 1).trim() };
}

/** Split Connecteam-style "Store" cells: `101, 102`, `HQ, Lama Wholesale`, `18`. */
function segmentsFromListField(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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

  const byN = byName.get(s.toLowerCase());
  if (byN) return byN.id;

  const hyphenSlug = s.toLowerCase().replace(/\s+/g, "-");
  return (
    bySlug.get(hyphenSlug)?.id ??
    bySlug.get(`store-${hyphenSlug}`)?.id ??
    null
  );
}

/** When `Store` is blank, use first `102`-style token from Connecteam `Groups`. */
function firstNumericStoreTokenFromGroups(groups: string): string | null {
  for (const part of groups.split(",")) {
    const t = part.trim();
    if (/^\d{2,4}$/.test(t)) return t;
  }
  return null;
}

/** `YYYY-MM-DD` or US `M/D/YYYY` / `MM/DD/YYYY` (Connecteam exports). */
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

/** Normalize US-style CSV phones to E.164-ish text for `employees.mobile_phone`. */
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

function resolveLocationId(
  rec: Record<string, string>,
  byId: Map<string, Loc>,
  bySlug: Map<string, Loc>,
  byName: Map<string, Loc>,
): { id: string | null; reason: string } {
  const locId = pick(rec, ["location_id", "location_uuid", "store_id"]);
  if (locId && UUID_RE.test(locId) && byId.has(locId)) {
    return { id: locId, reason: "location_id" };
  }

  const slug = pick(rec, ["store_slug", "location_slug", "slug"]);
  if (slug) {
    const key = slug.toLowerCase();
    const hit = bySlug.get(key);
    if (hit) return { id: hit.id, reason: "store_slug" };
  }

  const name = pick(rec, ["store_name", "location_name", "store_label"]);
  if (name) {
    const hit = byName.get(name.toLowerCase());
    if (hit) return { id: hit.id, reason: "store_name" };
  }

  const storeField = pick(rec, ["store", "home_store", "primary_store"]);
  if (storeField) {
    for (const seg of segmentsFromListField(storeField)) {
      const id = tryResolveStoreSegment(seg, bySlug, byName);
      if (id) return { id, reason: "store" };
    }
  }

  const numOnly = pick(rec, ["store_number", "store_num"]);
  if (/^\d+$/.test(numOnly)) {
    const id = tryResolveStoreSegment(numOnly, bySlug, byName);
    if (id) return { id, reason: "store_number" };
  }

  const groups = pick(rec, ["groups", "group", "connecteam_groups"]);
  if (groups) {
    const token = firstNumericStoreTokenFromGroups(groups);
    if (token) {
      const id = tryResolveStoreSegment(token, bySlug, byName);
      if (id) return { id, reason: "groups" };
    }
  }

  return { id: null, reason: "unresolved" };
}

async function main() {
  const csvPath = argValue("--csv");
  if (!csvPath) {
    throw new Error('Missing --csv "/path/to/file.csv"');
  }
  const dryRun = hasFlag("--dry-run");

  const { url, serviceKey } = getSupabaseScriptEnv();

  const abs = path.resolve(csvPath);
  const raw = fs.readFileSync(abs, "utf8");
  const rows = parseCsv(raw);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: locRows, error: locErr } = await supabase
    .from("locations")
    .select("id, name, slug, status")
    .neq("status", "archived");

  if (locErr) throw new Error(locErr.message);
  const locs = (locRows ?? []) as { id: string; name: string; slug: string; status?: string }[];

  const byId = new Map<string, Loc>();
  const bySlug = new Map<string, Loc>();
  const byName = new Map<string, Loc>();
  for (const l of locs) {
    const row: Loc = { id: l.id, name: l.name, slug: l.slug };
    byId.set(l.id, row);
    bySlug.set(String(l.slug).trim().toLowerCase(), row);
    byName.set(String(l.name).trim().toLowerCase(), row);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const rec = rows[i];
    const email = pick(rec, ["email", "work_email", "work_email_address"]).toLowerCase();
    if (!email) {
      skipped++;
      continue;
    }

    const fullNameRaw = pick(rec, ["full_name", "display_name", "name"]);
    let first = pick(rec, ["first_name", "firstname", "given_name"]);
    let last = pick(rec, ["last_name", "lastname", "surname", "family_name"]);
    if ((!first || !last) && fullNameRaw) {
      const sp = splitFullName(fullNameRaw);
      first = first || sp.first;
      last = last || sp.last;
    }
    if (!first || !last) {
      failed++;
      continue;
    }

    const { id: locationId } = resolveLocationId(rec, byId, bySlug, byName);
    if (!locationId) {
      skipped++;
      continue;
    }

    const position = pick(rec, ["position", "role"]);
    const titleField = pick(rec, ["title", "job_title"]);
    const role = position || titleField || "Employee";
    const title = titleField || position || role;

    const employmentStartRaw = pick(rec, [
      "employment_start_date",
      "start_date",
      "hire_date",
    ]);
    const employmentStart =
      parseFlexibleDate(employmentStartRaw) ??
      (/^\d{4}-\d{2}-\d{2}$/.test(employmentStartRaw.trim())
        ? employmentStartRaw.trim()
        : "");
    const mobileRaw = pick(rec, ["mobile_phone", "phone", "mobile"]);
    const mobile =
      normalizePhone(mobileRaw) ?? (mobileRaw.trim() ? mobileRaw.trim() : "");
    const birthRaw = pick(rec, ["birth_date", "birthday", "dob"]);
    const birth =
      parseFlexibleDate(birthRaw) ??
      (/^\d{4}-\d{2}-\d{2}$/.test(birthRaw.trim()) ? birthRaw.trim() : "");
    const statusRaw = pick(rec, ["status", "employment_status"]);
    const status =
      statusRaw && ["active", "inactive", "archived"].includes(statusRaw.toLowerCase())
        ? statusRaw.toLowerCase()
        : "active";
    const employeeCode = pick(rec, ["employee_code", "employee_id", "payroll_id"]);
    const kioskCode = pick(rec, ["kiosk_code", "kiosk"]);
    const fteRaw = pick(rec, ["fte_ratio", "fte", "part_time_ratio"]);
    const fte = parseFte(fteRaw);

    const full_name = `${first} ${last}`.trim();

    const { data: existing, error: exErr } = await supabase
      .from("employees")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (exErr) {
      failed++;
      continue;
    }

    const patch: Record<string, unknown> = {
      first_name: first,
      last_name: last,
      full_name,
      email,
      role,
      title,
      location_id: locationId,
      status,
    };
    if (employmentStart) patch.employment_start_date = employmentStart;
    if (mobile) patch.mobile_phone = mobile;
    if (birth) patch.birth_date = birth;
    if (employeeCode) patch.employee_code = employeeCode;
    if (kioskCode) patch.kiosk_code = kioskCode;
    if (fte != null) patch.fte_ratio = fte;

    if (dryRun) {
      if (existing?.id) updated++;
      else inserted++;
      continue;
    }

    if (existing?.id) {
      const { error: upErr } = await supabase.from("employees").update(patch).eq("id", existing.id);
      if (upErr) failed++;
      else updated++;
    } else {
      const insert = { ...patch };
      const { error: insErr } = await supabase.from("employees").insert(insert);
      if (insErr) failed++;
      else inserted++;
    }
  }

  process.stdout.write(
    `done: dry_run=${dryRun} inserted=${inserted} updated=${updated} skipped=${skipped} failed=${failed} total_rows=${rows.length}\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exit(1);
});
