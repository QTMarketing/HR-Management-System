import {
  displayFirst,
  displayLast,
  type DirectoryEmployee,
} from "@/lib/users/directory-buckets";

const HEADERS = [
  "Employee ID",
  "First name",
  "Last name",
  "Email",
  "Mobile phone",
  "Role",
  "Primary store",
  "Status",
  "Hire date",
  "Department",
  "Team",
  "Position",
  "Employee code",
] as const;

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = isDateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function compactId(uuid: string): string {
  if (!uuid) return "";
  const hex = uuid.replace(/-/g, "").slice(0, 10);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return uuid.slice(0, 8);
  return String((n % 89_000_000) + 10_000_000);
}

export function buildEmployeeHrRecordCsv(rows: DirectoryEmployee[]): string {
  const sorted = [...rows].sort((a, b) => {
    const ln = displayLast(a).localeCompare(displayLast(b));
    if (ln !== 0) return ln;
    return displayFirst(a).localeCompare(displayFirst(b));
  });
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const e of sorted) {
    const position =
      e.primaryJobTitle?.name?.trim() ||
      e.title?.trim() ||
      e.secondaryJobTitle?.name?.trim() ||
      "";
    lines.push(
      [
        compactId(e.id),
        displayFirst(e),
        displayLast(e),
        e.email ?? "",
        e.mobile_phone?.trim() ?? "",
        e.role ?? "",
        e.locationName ?? "",
        e.status ? e.status.charAt(0).toUpperCase() + e.status.slice(1) : "",
        fmtDate(e.employment_start_date),
        e.department ?? "",
        e.team ?? "",
        position,
        e.employee_code ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
