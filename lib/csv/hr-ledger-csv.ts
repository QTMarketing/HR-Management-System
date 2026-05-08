export type HrTimeOffLedgerCsvRow = {
  /** Optional. Used by UI tables to dedupe / link; ignored by the CSV writer. */
  employeeId?: string;
  /** Optional. Used by UI tables for filtering; ignored by the CSV writer. */
  locationId?: string;
  storeLocation: string;
  employeeName: string;
  /**
   * Optional. UI-only. Original employment start date (date string from
   * employees.employment_start_date). Surfaces in the "Active Since" column.
   * Intentionally NOT included in the CSV header order so payroll export shape
   * stays stable.
   */
  employmentStartDate?: string | null;
  /**
   * Optional. UI-only. Set when the employee was archived and later restored
   * (boomerang). When present, the table prefers this over `employmentStartDate`
   * and decorates the cell with a "Rehired" badge. Same CSV-stability note.
   */
  rehiredAt?: string | null;
  totalVacationHrs: number;
  totalSickHrs: number;
  usedVacationHrs: number;
  remainingVacationHrs: number;
  usedSickHrs: number;
  remainingSickHrs: number;
  remarks: string;
};

const HEADERS = [
  "Store Location",
  "Employee Name",
  "Total Vacation Hrs",
  "Total Sick Hrs",
  "Used Vacation Hrs",
  "Remaining Vacation Hrs",
  "Used Sick Hrs",
  "Remaining Sick Hrs",
  "Remarks",
] as const;

function esc(v: string): string {
  const s = v ?? "";
  // RFC 4180-ish: quote when contains comma, quote, or newline.
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function fmtNum(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toFixed(2).replace(/\.00$/, "");
}

export function buildHrTimeOffLedgerCsv(rows: HrTimeOffLedgerCsvRow[]): string {
  const lines: string[] = [];
  lines.push(HEADERS.join(","));
  for (const r of rows) {
    lines.push(
      [
        esc(r.storeLocation),
        esc(r.employeeName),
        fmtNum(r.totalVacationHrs),
        fmtNum(r.totalSickHrs),
        fmtNum(r.usedVacationHrs),
        fmtNum(r.remainingVacationHrs),
        fmtNum(r.usedSickHrs),
        fmtNum(r.remainingSickHrs),
        esc(r.remarks ?? ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

