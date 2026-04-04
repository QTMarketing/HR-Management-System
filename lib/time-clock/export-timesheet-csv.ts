import type { EnrichedPunchRow } from "@/lib/time-clock/types";

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * One row per punch for the active period — Phase 3 / 7 friendly payroll handoff.
 */
export function buildTimesheetPunchesCsv(
  rows: EnrichedPunchRow[],
  meta: { periodLabel: string },
): string {
  const header = [
    "Employee",
    "Role",
    "Clock in (local)",
    "Clock out (local)",
    "Daily total",
    "Breaks",
    "Status",
    "Job code",
    "Punch source",
    "Period",
  ];

  const lines = [header.map(csvCell).join(",")];

  const sorted = [...rows].sort((a, b) => {
    const n = a.employeeName.localeCompare(b.employeeName);
    if (n !== 0) return n;
    return a.clockInAt.localeCompare(b.clockInAt);
  });

  for (const r of sorted) {
    lines.push(
      [
        r.employeeName,
        r.employeeRole,
        r.clockInDisplay,
        r.clockOutDisplay === "—" ? "" : r.clockOutDisplay,
        r.dailyTotalLabel,
        r.breaksSummaryLabel ?? "",
        r.reviewLabel,
        r.jobCodeAtPunch ?? "",
        r.punchSourceLabel ?? "",
        meta.periodLabel,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\r\n");
}

export function downloadTimesheetCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.setAttribute("data-download", "timesheet-csv");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
