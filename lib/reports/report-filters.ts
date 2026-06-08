import { addDays, mondayOfWeekContaining } from "@/lib/schedule/week";

export type EmployeeRecordReportId =
  | "directory"
  | "hr-record"
  | "time-off"
  | "labor"
  | "schedule"
  | "activity"
  | "stores"
  | "audit"
  | "pto-auto";

export type ReportFilterInput = {
  locationId: string;
  scopeAll: boolean;
  scopeLabel: string;
  /** YYYY-MM-DD */
  dateFrom: string;
  /** YYYY-MM-DD */
  dateTo: string;
  year: number;
};

export type ReportFilterKind = "snapshot" | "year" | "week" | "dateRange";

export function filterKindForReport(id: EmployeeRecordReportId): ReportFilterKind {
  if (id === "time-off") return "year";
  if (id === "labor" || id === "schedule") return "week";
  if (id === "activity" || id === "audit" || id === "pto-auto") return "dateRange";
  return "snapshot";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function defaultReportFilters(year: number): Pick<ReportFilterInput, "dateFrom" | "dateTo" | "year"> {
  const today = new Date();
  const monday = mondayOfWeekContaining(today);
  const sunday = addDays(monday, 6);
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  return {
    year,
    dateFrom: formatYmd(thirtyAgo),
    dateTo: formatYmd(today),
  };
}

export function defaultWeekRange(): { dateFrom: string; dateTo: string } {
  const monday = mondayOfWeekContaining(new Date());
  return { dateFrom: formatYmd(monday), dateTo: formatYmd(addDays(monday, 6)) };
}

export function weekMondayFromFilter(dateFrom: string): Date {
  const parsed = parseYmd(dateFrom);
  return mondayOfWeekContaining(parsed ?? new Date());
}

export function startOfDayIso(ymd: string): string | null {
  const d = parseYmd(ymd);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfDayExclusiveIso(ymd: string): string | null {
  const d = parseYmd(ymd);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return new Date(d.getTime() + 1).toISOString();
}

export function filtersForReport(
  id: EmployeeRecordReportId,
  base: Pick<ReportFilterInput, "dateFrom" | "dateTo" | "year">,
): Pick<ReportFilterInput, "dateFrom" | "dateTo" | "year"> {
  const kind = filterKindForReport(id);
  if (kind === "week") return { ...defaultWeekRange(), year: base.year };
  if (kind === "year") return { ...base, dateFrom: `${base.year}-01-01`, dateTo: `${base.year}-12-31` };
  if (kind === "snapshot") {
    const today = formatYmd(new Date());
    return { year: base.year, dateFrom: today, dateTo: today };
  }
  return base;
}
