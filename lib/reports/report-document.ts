/**
 * Shared report envelope: metadata header for CSV exports and printable HTML.
 */

export type ReportDocumentMeta = {
  companyName: string;
  reportTitle: string;
  periodLabel?: string;
  scopeLabel?: string;
  filtersLabel?: string;
  generatedAt: string;
  rowCount: number;
};

export type PrintableReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type PrintableReportSummaryLine = {
  label: string;
  value: string;
};

export type PrintableReport = {
  meta: ReportDocumentMeta;
  columns: PrintableReportColumn[];
  rows: Record<string, string | number>[];
  summary?: PrintableReportSummaryLine[];
};

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function reportGeneratedAtLabel(at = new Date()): string {
  return at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function buildReportMeta(input: {
  companyName?: string;
  reportTitle: string;
  periodLabel?: string;
  scopeLabel?: string;
  filtersLabel?: string;
  rowCount: number;
  generatedAt?: Date;
}): ReportDocumentMeta {
  return {
    companyName: input.companyName?.trim() || "Organization",
    reportTitle: input.reportTitle,
    periodLabel: input.periodLabel,
    scopeLabel: input.scopeLabel,
    filtersLabel: input.filtersLabel,
    generatedAt: reportGeneratedAtLabel(input.generatedAt ?? new Date()),
    rowCount: input.rowCount,
  };
}

/** Prepends Field/Value summary block before detail CSV rows (Excel-friendly). */
export function prependReportHeader(meta: ReportDocumentMeta, detailCsv: string): string {
  const lines: string[] = [
    ["Field", "Value"].map(csvCell).join(","),
    ["Company", meta.companyName].map(csvCell).join(","),
    ["Report", meta.reportTitle].map(csvCell).join(","),
    ["Generated", meta.generatedAt].map(csvCell).join(","),
  ];
  if (meta.periodLabel) lines.push(["Period", meta.periodLabel].map(csvCell).join(","));
  if (meta.scopeLabel) lines.push(["Scope", meta.scopeLabel].map(csvCell).join(","));
  if (meta.filtersLabel) lines.push(["Filters", meta.filtersLabel].map(csvCell).join(","));
  lines.push(["Row count", meta.rowCount].map(csvCell).join(","), "");
  const body = detailCsv.replace(/^\uFEFF/, "").trim();
  return `${lines.join("\r\n")}\r\n${body}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPrintableReportHtml(report: PrintableReport): string {
  const { meta, columns, rows, summary } = report;
  const metaLines = [
    `<div><strong>Company:</strong> ${escapeHtml(meta.companyName)}</div>`,
    `<div><strong>Report:</strong> ${escapeHtml(meta.reportTitle)}</div>`,
    `<div><strong>Generated:</strong> ${escapeHtml(meta.generatedAt)}</div>`,
  ];
  if (meta.periodLabel) metaLines.push(`<div><strong>Period:</strong> ${escapeHtml(meta.periodLabel)}</div>`);
  if (meta.scopeLabel) metaLines.push(`<div><strong>Scope:</strong> ${escapeHtml(meta.scopeLabel)}</div>`);
  if (meta.filtersLabel) metaLines.push(`<div><strong>Filters:</strong> ${escapeHtml(meta.filtersLabel)}</div>`);
  metaLines.push(`<div><strong>Records:</strong> ${meta.rowCount}</div>`);

  const summaryHtml =
    summary && summary.length > 0
      ? `<table class="summary"><tbody>${summary
          .map(
            (s) =>
              `<tr><th>${escapeHtml(s.label)}</th><td>${escapeHtml(s.value)}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : "";

  const headCells = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align === "right" ? "right" : "left"}">${escapeHtml(c.label)}</th>`,
    )
    .join("");
  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const raw = row[c.key];
          const val = raw == null ? "" : String(raw);
          return `<td style="text-align:${c.align === "right" ? "right" : "left"}">${escapeHtml(val)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(meta.reportTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #0f172a; margin: 32px; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .meta { color: #475569; line-height: 1.6; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
    table.data { width: 100%; border-collapse: collapse; margin-top: 12px; }
    table.data th, table.data td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    table.data th { background: #f8fafc; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    table.data tr:nth-child(even) td { background: #fafafa; }
    table.summary { margin: 16px 0; border-collapse: collapse; min-width: 280px; }
    table.summary th { text-align: left; padding: 4px 12px 4px 0; color: #64748b; font-weight: 600; }
    table.summary td { padding: 4px 0; font-weight: 600; }
    @media print {
      body { margin: 16px; }
      table.data { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(meta.reportTitle)}</h1>
  <div class="meta">${metaLines.join("")}</div>
  ${summaryHtml}
  <table class="data">
    <thead><tr>${headCells}</tr></thead>
    <tbody>${bodyRows || `<tr><td colspan="${columns.length}">No records</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

export function downloadTextFile(filename: string, contents: string, mime = "text/csv;charset=utf-8"): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printReportHtml(html: string, title: string): void {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  w.focus();
  // Avoid assigning window.onload — it can fire on unrelated navigations and
  // stack with CSV download clicks. Delay print until the document is painted.
  window.setTimeout(() => {
    try {
      w.print();
    } catch {
      // Popup blocked or closed — ignore.
    }
  }, 300);
}
