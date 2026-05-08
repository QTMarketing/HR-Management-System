/**
 * Security Audit Log CSV.
 *
 * Pure, sync builder + browser download helper. Matches the conventions of
 * the other CSV modules in this folder:
 *   - RFC 4180-friendly cell escaping
 *   - CRLF line endings (Excel-friendly)
 *   - Stable header order (compliance / audit teams script against this)
 *   - Native Blob + URL.createObjectURL for the download trigger
 *
 * Columns (final, per UAT spec):
 *   1. Timestamp     — ISO-8601 UTC. Auditors prefer UTC over locale strings
 *                      so cross-region scripts don't have to re-parse.
 *   2. Actor Name    — full_name resolved server-side; UUID prefix fallback
 *   3. Action Type   — humanized label (e.g. "User archived"); raw key fallback
 *   4. Target Entity — resolved name of the affected entity (employee /
 *                      location / time entry id), composed server-side
 *   5. IP Address    — pulled from `metadata.ip_address` if present.
 *                      Empty until IP capture is wired into `insertSecurityAudit`.
 */

/** Caller pre-resolves names + actions on the server, where the lookup maps
 *  already exist (`nameById`, `locNameById`, `ACTION_LABEL`). Keeping this
 *  builder pure means it has no Supabase / RBAC dependency and can be unit
 *  tested with plain objects. */
export type SecurityAuditCsvRow = {
  /** ISO-8601 timestamp from `security_audit_events.created_at`. */
  createdAt: string;
  /** Resolved actor full name; empty string when the actor is unknown. */
  actorName: string;
  /** Humanized action label (e.g. "User archived"); falls back to the raw key. */
  actionType: string;
  /** Composed target description (employee / location / record summary). */
  targetEntity: string;
  /** From `metadata.ip_address` if present; empty otherwise. */
  ipAddress: string;
};

const HEADER_COLUMNS = [
  "Timestamp",
  "Actor Name",
  "Action Type",
  "Target Entity",
  "IP Address",
] as const;

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Normalize the timestamp to ISO-8601 UTC; fall back to the raw value if
 *  unparseable so we never silently drop data. */
function fmtTimestamp(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

/**
 * Build the audit CSV from already-resolved rows. Newest-first ordering is
 * preserved (matches the on-screen table).
 */
export function buildSecurityAuditCsv(rows: SecurityAuditCsvRow[]): string {
  const lines: string[] = [HEADER_COLUMNS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        fmtTimestamp(r.createdAt),
        r.actorName ?? "",
        r.actionType ?? "",
        r.targetEntity ?? "",
        r.ipAddress ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

/** "security_audit_2026-05-08.csv" */
export function securityAuditCsvFilename(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `security_audit_${yyyy}-${mm}-${dd}.csv`;
}

/** Native browser download. Identical pattern to the other CSV downloaders. */
export function downloadSecurityAuditCsv(content: string, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.setAttribute("data-download", "security-audit-csv");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
