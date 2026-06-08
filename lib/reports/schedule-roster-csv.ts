export type ScheduleRosterCsvRow = {
  shiftDate: string;
  dayOfWeek: string;
  employeeName: string;
  role: string;
  storeName: string;
  jobName: string;
  shiftStart: string;
  shiftEnd: string;
  published: string;
};

const HEADERS = [
  "Date",
  "Day",
  "Employee",
  "Role",
  "Store",
  "Job",
  "Shift start",
  "Shift end",
  "Published",
] as const;

function csvCell(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildScheduleRosterCsv(rows: ScheduleRosterCsvRow[]): string {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.shiftDate,
        r.dayOfWeek,
        r.employeeName,
        r.role,
        r.storeName,
        r.jobName,
        r.shiftStart,
        r.shiftEnd,
        r.published,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
