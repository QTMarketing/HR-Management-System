export type LaborWeekCsvRow = {
  employeeId: string;
  employeeName: string;
  role: string;
  scheduledHours: number;
  workedHours: number;
  shiftCount: number;
  coveragePct: number | null;
};

export type LaborWeekCsvMeta = {
  periodRangeLabel: string;
  scopeLabel: string;
  totals: {
    scheduledHours: number;
    workedHours: number;
    shiftCount: number;
    coveragePct: number | null;
  };
};

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtHours(h: number): string {
  return (Math.round(h * 100) / 100).toFixed(2);
}

/**
 * Summary block + one row per employee for the weekly labor report.
 */
export function buildLaborWeekCsv(meta: LaborWeekCsvMeta, rows: LaborWeekCsvRow[]): string {
  const lines: string[] = [
    ["Field", "Value"].map(csvCell).join(","),
    ["Report", "Weekly labor summary"].map(csvCell).join(","),
    ["Week", meta.periodRangeLabel].map(csvCell).join(","),
    ["Location scope", meta.scopeLabel].map(csvCell).join(","),
    ["Total scheduled hours", fmtHours(meta.totals.scheduledHours)].map(csvCell).join(","),
    ["Total worked hours", fmtHours(meta.totals.workedHours)].map(csvCell).join(","),
    ["Shift count", meta.totals.shiftCount].map(csvCell).join(","),
    [
      "Hours vs. scheduled % (overall)",
      meta.totals.coveragePct == null ? "" : String(meta.totals.coveragePct),
    ]
      .map(csvCell)
      .join(","),
    "",
  ];

  const header = [
    "Employee ID",
    "Employee",
    "Role",
    "Scheduled hours (week)",
    "Worked hours (week)",
    "Shifts this week",
    "Hours vs. scheduled %",
  ];
  lines.push(header.map(csvCell).join(","));

  const sorted = [...rows].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" }),
  );
  for (const r of sorted) {
    lines.push(
      [
        r.employeeId,
        r.employeeName,
        r.role,
        fmtHours(r.scheduledHours),
        fmtHours(r.workedHours),
        r.shiftCount,
        r.coveragePct == null ? "" : String(r.coveragePct),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\r\n");
}

export function downloadLaborWeekCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.setAttribute("data-download", "labor-week-csv");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
