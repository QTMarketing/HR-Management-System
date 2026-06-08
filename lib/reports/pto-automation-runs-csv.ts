export type PtoAutomationRunCsvRow = {
  startedAt: string;
  jobType: string;
  periodKey: string;
  triggeredBy: string;
  status: string;
  errorMessage: string;
};

const HEADERS = ["Date", "Task", "Period", "Source", "Result", "Error"] as const;

function csvCell(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatJobType(job: string): string {
  if (job === "year_rollover") return "Annual time off grant";
  if (job === "monthly_cashout") return "Monthly vacation payout";
  return job;
}

function formatTrigger(trigger: string): string {
  if (trigger === "cron") return "Scheduled";
  if (trigger === "manual") return "Manual";
  if (trigger === "scheduled") return "Scheduled";
  return trigger;
}

function formatStatus(status: string): string {
  if (status === "success") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return status;
}

export function buildPtoAutomationRunsCsv(rows: PtoAutomationRunCsvRow[]): string {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.startedAt,
        formatJobType(r.jobType),
        r.periodKey,
        formatTrigger(r.triggeredBy),
        formatStatus(r.status),
        r.errorMessage,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
