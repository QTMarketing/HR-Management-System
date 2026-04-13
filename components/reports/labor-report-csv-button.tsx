"use client";

import { Download } from "lucide-react";
import {
  buildLaborWeekCsv,
  downloadLaborWeekCsv,
  type LaborWeekCsvMeta,
  type LaborWeekCsvRow,
} from "@/lib/reports/labor-week-csv";
import { formatWeekQueryParam } from "@/lib/schedule/week";

type Props = {
  weekMonday: Date;
  meta: LaborWeekCsvMeta;
  rows: LaborWeekCsvRow[];
};

export function LaborReportCsvButton({ weekMonday, meta, rows }: Props) {
  const weekParam = formatWeekQueryParam(weekMonday);
  const safeScope = meta.scopeLabel.replace(/[^\w\-]+/g, "-").slice(0, 40);

  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
      title="Download this week’s team breakdown and totals"
      onClick={() => {
        const csv = buildLaborWeekCsv(meta, rows);
        downloadLaborWeekCsv(csv, `labor-week-${weekParam}-${safeScope}.csv`);
      }}
    >
      <Download className="h-4 w-4 text-slate-600" />
      Export Report
    </button>
  );
}
