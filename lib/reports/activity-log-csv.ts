export type ActivityLogCsvRow = {
  occurredAt: string;
  employeeLabel: string;
  action: string;
  status: string;
};

const HEADERS = ["When", "Employee", "Action", "Status"] as const;

function csvCell(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildActivityLogCsv(rows: ActivityLogCsvRow[]): string {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([r.occurredAt, r.employeeLabel, r.action, r.status].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}
