/**
 * Track C — Unified Payroll CSV.
 *
 * One row per employee, per pay period, with the columns Gusto / ADP-style
 * providers expect (regular vs OT split, PTO, holiday, hourly rate, gross pay)
 * plus an explicit `Demo Rate Flag` that screams when a wage was filled in by
 * the Loud Fallback. Pure CSV builder lives here; the data fetch /
 * orchestration sits in the corresponding server action so this file stays
 * easy to test.
 */
import type { PayableHoursResult } from "@/lib/payroll/payable-hours";

/** One employee's payroll line in the unified CSV. */
export type UnifiedPayrollCsvRow = {
  employeeId: string;
  firstName: string;
  lastName: string;
  /** Resolved store name (or empty string when unknown). */
  location: string;
  /** Output of `calculatePayableHours` for the employee for the period. */
  payable: PayableHoursResult;
};

/** Period + clock metadata that the CSV header carries inline. */
export type UnifiedPayrollCsvMeta = {
  /** Inclusive YYYY-MM-DD start. */
  startDateYmd: string;
  /** Inclusive YYYY-MM-DD end. */
  endDateYmd: string;
  /** Display name of the time clock (used in the filename). */
  clockName?: string | null;
  /** Display name of the location, when single-location export. */
  locationName?: string | null;
};

/** RFC 4180-friendly CSV cell escaping. */
function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Round to 2dp without floating-point fuzz. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Stable, payroll-provider-friendly column order. Don't reorder casually. */
const HEADER_COLUMNS = [
  "Employee ID",
  "First Name",
  "Last Name",
  "Location",
  "Regular Hours",
  "Overtime Hours",
  "PTO Hours",
  "Holiday Hours",
  "Hourly Rate",
  "Gross Pay",
  "Demo Rate Flag",
  "Period Start",
  "Period End",
] as const;

/**
 * Build the unified payroll CSV from already-computed rows. Pure / sync —
 * caller is responsible for fetching data + running `calculatePayableHours`.
 *
 * Rows are sorted by Last Name, First Name for stable diffs across exports.
 */
export function buildUnifiedPayrollCsv(
  meta: UnifiedPayrollCsvMeta,
  rows: UnifiedPayrollCsvRow[],
): string {
  const sorted = [...rows].sort((a, b) => {
    const ln = a.lastName.localeCompare(b.lastName);
    if (ln !== 0) return ln;
    return a.firstName.localeCompare(b.firstName);
  });

  const lines: string[] = [HEADER_COLUMNS.map(csvCell).join(",")];

  for (const r of sorted) {
    const p = r.payable;
    lines.push(
      [
        r.employeeId,
        r.firstName,
        r.lastName,
        r.location,
        round2(p.regularHours).toFixed(2),
        round2(p.overtimeHours).toFixed(2),
        round2(p.approvedPtoHours).toFixed(2),
        round2(p.paidHolidayHours).toFixed(2),
        round2(p.hourlyRate).toFixed(2),
        round2(p.estimatedGrossPay).toFixed(2),
        // Loud-fallback signal — payroll ops greps this column.
        p.isUsingFallbackRate,
        meta.startDateYmd,
        meta.endDateYmd,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // CRLF for maximum compatibility with Excel + payroll providers.
  return lines.join("\r\n");
}

/** "payroll_2026-05-04_to_2026-05-10.csv" — slugified for filesystem safety. */
export function unifiedPayrollCsvFilename(meta: UnifiedPayrollCsvMeta): string {
  const slug = (meta.clockName ?? meta.locationName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = slug ? `payroll_${slug}` : "payroll";
  return `${base}_${meta.startDateYmd}_to_${meta.endDateYmd}.csv`;
}

/**
 * Browser-side download helper. Mirrors `downloadTimesheetCsv` in
 * `lib/time-clock/export-timesheet-csv.ts` — duplicated intentionally so this
 * module has no other client-side dependencies.
 */
export function downloadUnifiedPayrollCsv(content: string, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.setAttribute("data-download", "unified-payroll-csv");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
