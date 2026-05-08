"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import {
  type SecurityAuditCsvRow,
  buildSecurityAuditCsv,
  downloadSecurityAuditCsv,
  securityAuditCsvFilename,
} from "@/lib/csv/security-audit-csv";

type Props = {
  rows: SecurityAuditCsvRow[];
};

/**
 * Client-only download trigger. The page is a Server Component, so the rows
 * are resolved (actor / target names) on the server and handed in pre-flat,
 * keeping this component free of Supabase / RBAC concerns.
 *
 * Disabled when there are no rows (e.g. fresh install / empty audit log) so
 * users don't download an empty file by accident.
 */
export function SecurityAuditExportButton({ rows }: Props) {
  const [pending, startTransition] = useTransition();
  const empty = rows.length === 0;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={empty || pending}
      onClick={() => {
        if (empty) return;
        startTransition(() => {
          const csv = buildSecurityAuditCsv(rows);
          downloadSecurityAuditCsv(csv, securityAuditCsvFilename());
        });
      }}
      title={
        empty
          ? "No audit events to export yet."
          : `Export ${rows.length} ${rows.length === 1 ? "event" : "events"} to CSV`
      }
      aria-label="Export security audit log to CSV"
    >
      <Download className="h-4 w-4" aria-hidden />
      {pending ? "Exporting…" : "Export to CSV"}
    </button>
  );
}
