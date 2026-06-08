"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Download, Loader2, Printer, X } from "lucide-react";
import {
  fetchEmployeeRecordReport,
  type EmployeeRecordsExportResult,
} from "@/app/actions/employee-records-reports";
import {
  defaultReportFilters,
  filterKindForReport,
  filtersForReport,
  type EmployeeRecordReportId,
  type ReportFilterInput,
} from "@/lib/reports/report-filters";
import type { PrintableReport } from "@/lib/reports/report-document";
import { downloadTextFile, printReportHtml } from "@/lib/reports/report-document";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

export type ReportPreviewSheetProps = {
  open: boolean;
  onClose: () => void;
  reportId: EmployeeRecordReportId;
  title: string;
  description: string;
  scope: Pick<ReportFilterInput, "locationId" | "scopeAll" | "scopeLabel">;
  defaultYear: number;
};

type Loaded = {
  preview: PrintableReport;
  csv: string;
  filename: string;
  printableHtml: string;
};

export function ReportPreviewSheet({
  open,
  onClose,
  reportId,
  title,
  description,
  scope,
  defaultYear,
}: ReportPreviewSheetProps) {
  const titleId = useId();
  const busyRef = useRef(false);
  const [filters, setFilters] = useState(() => ({
    ...scope,
    ...defaultReportFilters(defaultYear),
  }));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadPending, startLoad] = useTransition();
  const [exportMode, setExportMode] = useState<"csv" | "print" | null>(null);

  const filterKind = filterKindForReport(reportId);

  const applyResult = useCallback((r: EmployeeRecordsExportResult) => {
    if (!r.ok) {
      setError(r.error);
      setLoaded(null);
      return;
    }
    setError(null);
    setLoaded({
      preview: r.preview,
      csv: r.csv,
      filename: r.filename,
      printableHtml: r.printableHtml,
    });
  }, []);

  const loadReport = useCallback(() => {
    startLoad(async () => {
      const r = await fetchEmployeeRecordReport(reportId, filters);
      applyResult(r);
    });
  }, [applyResult, filters, reportId]);

  useEffect(() => {
    if (!open) return;
    const base = defaultReportFilters(defaultYear);
    const next = {
      ...scope,
      ...filtersForReport(reportId, base),
    };
    setFilters(next);
    setLoaded(null);
    setError(null);
    startLoad(async () => {
      const r = await fetchEmployeeRecordReport(reportId, next);
      applyResult(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when report or open changes
  }, [open, reportId, scope.locationId, scope.scopeAll, scope.scopeLabel, defaultYear]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function runExport(mode: "csv" | "print", e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busyRef.current || !loaded) return;
    busyRef.current = true;
    setExportMode(mode);
    try {
      if (mode === "csv") {
        downloadTextFile(loaded.filename, loaded.csv);
      } else {
        printReportHtml(loaded.printableHtml, loaded.filename.replace(/\.csv$/i, ""));
      }
    } finally {
      window.setTimeout(() => {
        busyRef.current = false;
        setExportMode(null);
      }, 400);
    }
  }

  if (!open) return null;

  const preview = loaded?.preview;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/50 p-0 sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:my-4 sm:h-[min(92vh,900px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
            {preview ? (
              <p className="mt-2 text-xs text-slate-500">
                {preview.meta.companyName} · Generated {preview.meta.generatedAt}
                {preview.meta.scopeLabel ? ` · ${preview.meta.scopeLabel}` : ""}
                {preview.meta.periodLabel ? ` · ${preview.meta.periodLabel}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              {filterKind === "year" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-700">Calendar year</span>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={filters.year}
                    onChange={(e) => setFilters((f) => ({ ...f, year: Number(e.target.value) }))}
                    className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  />
                </label>
              ) : null}

              {filterKind === "week" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-700">Week containing</span>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  />
                </label>
              ) : null}

              {filterKind === "dateRange" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-700">From</span>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-700">To</span>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                  </label>
                </>
              ) : null}

              {filterKind === "snapshot" ? (
                <p className="text-xs text-slate-600">
                  Snapshot of current data for <span className="font-medium">{scope.scopeLabel}</span>.
                </p>
              ) : null}

              <button
                type="button"
                onClick={loadReport}
                disabled={loadPending}
                className={`${PRIMARY_ORANGE_CTA} inline-flex h-9 items-center px-4 text-sm`}
              >
                {loadPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating…
                  </>
                ) : filterKind === "snapshot" ? (
                  "Refresh"
                ) : (
                  "Update preview"
                )}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!loaded || loadPending || exportMode !== null}
                onClick={(e) => runExport("csv", e)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {exportMode === "csv" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download CSV
              </button>
              <button
                type="button"
                disabled={!loaded || loadPending || exportMode !== null}
                onClick={(e) => runExport("print", e)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {exportMode === "print" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                Print / PDF
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f8fafc] p-4 sm:p-6">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
          ) : null}

          {loadPending && !loaded ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading report…
            </div>
          ) : null}

          {preview ? (
            <>
              {preview.summary && preview.summary.length > 0 ? (
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  {preview.summary.map((s) => (
                    <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{s.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
                <div className="max-h-[min(60vh,520px)] overflow-auto">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100 shadow-[0_1px_0_#cbd5e1]">
                      <tr>
                        {preview.columns.map((col) => (
                          <th
                            key={col.key}
                            className={`whitespace-nowrap border border-slate-300 px-2.5 py-2 font-semibold text-slate-700 ${
                              col.align === "right" ? "text-right" : "text-left"
                            }`}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={preview.columns.length}
                            className="border border-slate-200 px-3 py-8 text-center text-slate-500"
                          >
                            No rows match this period and scope.
                          </td>
                        </tr>
                      ) : (
                        preview.rows.map((row, idx) => (
                          <tr key={idx} className="odd:bg-white even:bg-slate-50/80">
                            {preview.columns.map((col) => (
                              <td
                                key={col.key}
                                className={`border border-slate-200 px-2.5 py-1.5 text-slate-800 ${
                                  col.align === "right" ? "text-right tabular-nums" : "text-left"
                                }`}
                              >
                                {String(row[col.key] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {preview.meta.rowCount} row{preview.meta.rowCount === 1 ? "" : "s"} · Adjust the period above,
                then download or print.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
