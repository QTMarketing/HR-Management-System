/**
 * Users Directory CSV.
 *
 * Pure, sync builder + browser download helper. Mirrors the conventions of
 * `lib/csv/hr-ledger-csv.ts` and `lib/csv/unified-payroll-csv.ts`:
 *   - RFC 4180-friendly cell escaping
 *   - Stable header order (don't reorder casually — HR import templates rely
 *     on it)
 *   - Date formatting matches the on-screen directory (MM/DD/YYYY)
 *   - No external dependencies; download uses native Blob + URL.createObjectURL
 *
 * Columns (final, per UAT spec):
 *   1. ID            — Connecteam-style numeric, falls back to UUID
 *   2. Name          — `displayFirst` + " " + `displayLast`
 *   3. Email
 *   4. Role          — raw role string from the employees table
 *   5. Primary Store — resolved location name (or empty when unassigned)
 *   6. Status        — title-cased ("Active", "Archived", "Inactive")
 *   7. Hire Date     — `employment_start_date` formatted MM/DD/YYYY
 */
import {
  type DirectoryEmployee,
  displayFirst,
  displayLast,
} from "@/lib/users/directory-buckets";

const HEADER_COLUMNS = [
  "ID",
  "Name",
  "Email",
  "Role",
  "Primary Store",
  "Status",
  "Hire Date",
] as const;

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * MM/DD/YYYY format. Matches `fmtDate` in `users-directory.tsx` so the CSV
 * lines up with what the user sees on screen.
 */
function fmtHireDate(value: string | null | undefined): string {
  if (!value) return "";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  // Anchor date-only strings at noon-local to avoid the classic UTC-midnight
  // off-by-one that hits western timezones.
  const d = isDateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function titleCase(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Compact numeric ID derived from the UUID (matches the on-screen "App user id"
 * convention). Falls back to the first 8 chars of the UUID if numeric derive fails.
 */
function compactId(uuid: string): string {
  if (!uuid) return "";
  const hex = uuid.replace(/-/g, "").slice(0, 10);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return uuid.slice(0, 8);
  const compact = (n % 89_000_000) + 10_000_000;
  return String(compact);
}

/**
 * Build the Users Directory CSV from the same `DirectoryEmployee[]` array the
 * UI renders. Caller is responsible for any pre-filtering (tab / search).
 *
 * Rows are sorted by Last Name, First Name for stable diffs across exports.
 */
export function buildUsersDirectoryCsv(rows: DirectoryEmployee[]): string {
  const sorted = [...rows].sort((a, b) => {
    const ln = displayLast(a).localeCompare(displayLast(b));
    if (ln !== 0) return ln;
    return displayFirst(a).localeCompare(displayFirst(b));
  });

  const lines: string[] = [HEADER_COLUMNS.map(csvCell).join(",")];

  for (const e of sorted) {
    const first = displayFirst(e);
    const last = displayLast(e);
    const name = [first, last].filter((p) => p && p !== "—").join(" ").trim() ||
      e.full_name?.trim() ||
      "";
    lines.push(
      [
        compactId(e.id),
        name,
        e.email ?? "",
        e.role ?? "",
        e.locationName ?? "",
        titleCase(e.status ?? ""),
        fmtHireDate(e.employment_start_date),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // CRLF for Excel + payroll compatibility (matches unified-payroll-csv).
  return lines.join("\r\n");
}

/** "users_directory_users_2026-05-08.csv" */
export function usersDirectoryCsvFilename(tab: string): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const safeTab = (tab || "all").toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return `users_directory_${safeTab}_${yyyy}-${mm}-${dd}.csv`;
}

/**
 * Browser-side download helper. Uses native Blob + URL.createObjectURL — no
 * external dependencies. Mirrors `downloadUnifiedPayrollCsv` so behavior is
 * consistent across exports.
 */
export function downloadUsersDirectoryCsv(content: string, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.setAttribute("data-download", "users-directory-csv");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
