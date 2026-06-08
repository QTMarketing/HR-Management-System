"use server";

import { getTimeOffLedgerExportRows } from "@/app/actions/time-off-report";
import { SECURITY_AUDIT_ACTIONS } from "@/lib/audit/security-audit";
import { buildHrTimeOffLedgerCsv } from "@/lib/csv/hr-ledger-csv";
import {
  buildSecurityAuditCsv,
  securityAuditCsvFilename,
  type SecurityAuditCsvRow,
} from "@/lib/csv/security-audit-csv";
import { buildUsersDirectoryCsv } from "@/lib/csv/users-directory-csv";
import { loadDirectoryEmployees, loadCompanyName } from "@/lib/reports/load-directory-employees";
import { loadWeeklyLaborReport } from "@/lib/reports/load-weekly-labor";
import { buildActivityLogCsv } from "@/lib/reports/activity-log-csv";
import { buildEmployeeHrRecordCsv } from "@/lib/reports/employee-hr-record-csv";
import { buildLaborWeekCsv } from "@/lib/reports/labor-week-csv";
import { buildPtoAutomationRunsCsv } from "@/lib/reports/pto-automation-runs-csv";
import {
  buildPrintableReportHtml,
  buildReportMeta,
  prependReportHeader,
  type PrintableReport,
} from "@/lib/reports/report-document";
import { buildScheduleRosterCsv } from "@/lib/reports/schedule-roster-csv";
import { buildStoresDirectoryCsv } from "@/lib/reports/stores-directory-csv";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  endOfDayExclusiveIso,
  formatYmd,
  startOfDayIso,
  weekMondayFromFilter,
  type EmployeeRecordReportId,
  type ReportFilterInput,
} from "@/lib/reports/report-filters";
import { formatWeekQueryParam, addDays } from "@/lib/schedule/week";
import { bucketForEmployee } from "@/lib/users/directory-buckets";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmployeeRecordsExportResult =
  | { ok: true; csv: string; filename: string; printableHtml: string; preview: PrintableReport }
  | { ok: false; error: string };

export type { EmployeeRecordReportId, ReportFilterInput };

const AUDIT_ACTION_LABEL: Record<string, string> = {
  [SECURITY_AUDIT_ACTIONS.ADMIN_ACCESS_UPDATED]: "Admin permissions changed",
  [SECURITY_AUDIT_ACTIONS.EMPLOYEE_PROMOTED_STORE_MANAGER]: "Promoted to Store Manager",
  [SECURITY_AUDIT_ACTIONS.LOCATION_STORE_LEAD_CHANGED]: "Store lead changed",
  [SECURITY_AUDIT_ACTIONS.ORGANIZATION_OWNER_CHANGED]: "Organization owner changed",
  [SECURITY_AUDIT_ACTIONS.EMPLOYEE_ARCHIVED]: "User archived",
  [SECURITY_AUDIT_ACTIONS.TIME_ENTRY_ARCHIVED]: "Time entry archived",
  [SECURITY_AUDIT_ACTIONS.TIME_ENTRY_APPROVED]: "Time entry approved",
  [SECURITY_AUDIT_ACTIONS.TIME_ENTRY_UNAPPROVED]: "Time entry review removed",
  [SECURITY_AUDIT_ACTIONS.TIME_ENTRY_ADJUSTED]: "Clock-in/out times edited",
  [SECURITY_AUDIT_ACTIONS.TIME_OFF_RECORDED]: "Time off recorded",
  [SECURITY_AUDIT_ACTIONS.TIME_OFF_REQUEST_SUBMITTED]: "Time off request submitted",
  [SECURITY_AUDIT_ACTIONS.TIME_OFF_REQUEST_APPROVED]: "Time off request approved",
  [SECURITY_AUDIT_ACTIONS.TIME_OFF_REQUEST_DENIED]: "Time off request denied",
};

function todaySlug(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ok(
  csv: string,
  filename: string,
  printable: PrintableReport,
  companyName: string,
): EmployeeRecordsExportResult {
  const meta = buildReportMeta({
    companyName,
    reportTitle: printable.meta.reportTitle,
    periodLabel: printable.meta.periodLabel,
    scopeLabel: printable.meta.scopeLabel,
    filtersLabel: printable.meta.filtersLabel,
    rowCount: printable.meta.rowCount,
  });
  const preview: PrintableReport = { ...printable, meta };
  return {
    ok: true,
    csv: prependReportHeader(meta, csv),
    filename,
    printableHtml: buildPrintableReportHtml(preview),
    preview,
  };
}

export async function fetchEmployeeRecordReport(
  reportId: EmployeeRecordReportId,
  filters: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  switch (reportId) {
    case "directory":
      return exportEmployeeDirectoryReport(filters);
    case "hr-record":
      return exportEmployeeHrRecordReport(filters);
    case "time-off":
      return exportTimeOffBalancesReport(filters);
    case "labor":
      return exportWeeklyLaborReport(filters);
    case "schedule":
      return exportScheduleRosterReport(filters);
    case "activity":
      return exportActivityLogReport(filters);
    case "stores":
      return exportStoresDirectoryReport(filters);
    case "audit":
      return exportSecurityAuditReport(filters);
    case "pto-auto":
      return exportPtoAutomationRunsReport(filters);
    default:
      return { ok: false, error: "Unknown report type." };
  }
}

async function gate(permission: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, permission as never)) {
    return { ok: false, error: "You don't have permission to export this report." };
  }
  return { ok: true };
}

export async function exportEmployeeDirectoryReport(
  input: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.USERS_VIEW);
  if (!gated.ok) return gated;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const { employees, error } = await loadDirectoryEmployees(supabase, {
    locationId: input.locationId,
    scopeAll: input.scopeAll,
  });
  if (error) return { ok: false, error };

  const active = employees.filter((e) => bucketForEmployee(e) !== "archived");
  const detail = buildUsersDirectoryCsv(active);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "Employee directory",
      scopeLabel: input.scopeLabel,
      periodLabel: `Snapshot as of ${input.dateTo}`,
      filtersLabel: "Active employees only",
      rowCount: active.length,
    }),
    summary: [{ label: "Active employees", value: String(active.length) }],
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "role", label: "Role" },
      { key: "store", label: "Primary store" },
      { key: "status", label: "Status" },
    ],
    rows: active.map((e) => ({
      name: [e.first_name, e.last_name].filter(Boolean).join(" ") || e.full_name,
      email: e.email ?? "",
      role: e.role,
      store: e.locationName ?? "",
      status: e.status,
    })),
  };
  return ok(detail, `employee_directory_${todaySlug()}.csv`, printable, companyName);
}

export async function exportEmployeeHrRecordReport(
  input: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.USERS_VIEW);
  if (!gated.ok) return gated;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const { employees, error } = await loadDirectoryEmployees(supabase, {
    locationId: input.locationId,
    scopeAll: input.scopeAll,
  });
  if (error) return { ok: false, error };

  const detail = buildEmployeeHrRecordCsv(employees);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "Employee HR record",
      scopeLabel: input.scopeLabel,
      periodLabel: `Snapshot as of ${input.dateTo}`,
      rowCount: employees.length,
    }),
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "role", label: "Role" },
      { key: "store", label: "Store" },
      { key: "hire", label: "Hire date" },
    ],
    rows: employees.map((e) => ({
      name: e.full_name,
      email: e.email ?? "",
      phone: e.mobile_phone ?? "",
      role: e.role,
      store: e.locationName ?? "",
      hire: e.employment_start_date ?? "",
    })),
  };
  return ok(detail, `employee_hr_record_${todaySlug()}.csv`, printable, companyName);
}

export async function exportTimeOffBalancesReport(
  input: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.TIME_CLOCK_MANAGE);
  if (!gated.ok) return gated;

  const ledgerLocationId = input.scopeAll ? "all" : input.locationId;
  const ledgerRes = await getTimeOffLedgerExportRows({
    locationId: ledgerLocationId,
    year: input.year,
  });
  if (!ledgerRes.ok) return ledgerRes;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const detail = buildHrTimeOffLedgerCsv(ledgerRes.rows);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "Time off balances",
      periodLabel: `Calendar year ${input.year}`,
      scopeLabel: input.scopeLabel,
      rowCount: ledgerRes.rows.length,
    }),
    columns: [
      { key: "store", label: "Store" },
      { key: "employee", label: "Employee" },
      { key: "vacRem", label: "Vacation remaining (h)", align: "right" },
      { key: "sickRem", label: "Sick remaining (h)", align: "right" },
    ],
    rows: ledgerRes.rows.map((r) => ({
      store: r.storeLocation,
      employee: r.employeeName,
      vacRem: r.remainingVacationHrs.toFixed(1),
      sickRem: r.remainingSickHrs.toFixed(1),
    })),
  };
  return ok(detail, `time_off_balances_${input.year}_${todaySlug()}.csv`, printable, companyName);
}

export async function exportWeeklyLaborReport(
  input: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.LABOR_REPORT_VIEW);
  if (!gated.ok) return gated;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const weekMonday = weekMondayFromFilter(input.dateFrom);
  const labor = await loadWeeklyLaborReport(supabase, {
    locationId: input.locationId,
    scopeAll: input.scopeAll,
    locationLabel: input.scopeLabel,
    weekMonday,
  });
  if (labor.errorMessage) return { ok: false, error: labor.errorMessage };

  const detail = buildLaborWeekCsv(labor.csvMeta, labor.csvRows);
  const weekParam = formatWeekQueryParam(labor.weekMonday);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "Weekly labor summary",
      periodLabel: labor.rangeLabel,
      scopeLabel: labor.scopeLabel,
      rowCount: labor.csvRows.length,
    }),
    summary: [
      { label: "Scheduled hours", value: labor.scheduledHours.toFixed(2) },
      { label: "Worked hours", value: labor.workedHours.toFixed(2) },
      { label: "Shifts planned", value: String(labor.shiftCount) },
    ],
    columns: [
      { key: "employee", label: "Employee" },
      { key: "role", label: "Role" },
      { key: "scheduled", label: "Scheduled (h)", align: "right" },
      { key: "worked", label: "Worked (h)", align: "right" },
      { key: "shifts", label: "Shifts", align: "right" },
    ],
    rows: labor.csvRows.map((r) => ({
      employee: r.employeeName,
      role: r.role,
      scheduled: r.scheduledHours.toFixed(2),
      worked: r.workedHours.toFixed(2),
      shifts: r.shiftCount,
    })),
  };
  return ok(
    detail,
    `weekly_labor_${weekParam}_${todaySlug()}.csv`,
    printable,
    companyName,
  );
}

export async function exportSecurityAuditReport(
  input: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.ORG_OWNER);
  if (!gated.ok) return gated;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const fromIso = startOfDayIso(input.dateFrom);
  const toIso = endOfDayExclusiveIso(input.dateTo);
  let auditQ = supabase
    .from("security_audit_events")
    .select("id, created_at, actor_employee_id, action, target_employee_id, location_id, metadata")
    .order("created_at", { ascending: false })
    .limit(500);
  if (fromIso) auditQ = auditQ.gte("created_at", fromIso);
  if (toIso) auditQ = auditQ.lt("created_at", toIso);
  const { data: rows, error } = await auditQ;
  if (error) return { ok: false, error: error.message };

  const ids = new Set<string>();
  for (const r of rows ?? []) {
    const rec = r as { actor_employee_id?: string | null; target_employee_id?: string | null };
    if (rec.actor_employee_id) ids.add(rec.actor_employee_id);
    if (rec.target_employee_id) ids.add(rec.target_employee_id);
  }
  const nameById = new Map<string, string>();
  if (ids.size > 0) {
    const { data: empRows } = await supabase.from("employees").select("id, full_name").in("id", [...ids]);
    for (const e of empRows ?? []) {
      const er = e as { id: string; full_name: string };
      nameById.set(er.id, er.full_name ?? er.id);
    }
  }

  const csvRows: SecurityAuditCsvRow[] = (rows ?? []).map((raw) => {
    const r = raw as {
      created_at: string;
      action: string;
      actor_employee_id: string | null;
      metadata: Record<string, unknown> | null;
    };
    const meta = r.metadata ?? {};
    return {
      createdAt: r.created_at,
      actorName:
        (r.actor_employee_id && nameById.get(r.actor_employee_id)) ||
        (r.actor_employee_id ? r.actor_employee_id.slice(0, 8) + "…" : ""),
      actionType: AUDIT_ACTION_LABEL[r.action] ?? r.action,
      targetEntity: String(meta.summary ?? meta.detail ?? r.action),
      ipAddress: typeof meta.ip_address === "string" ? meta.ip_address : "",
    };
  });

  const detail = buildSecurityAuditCsv(csvRows);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "Security audit log",
      periodLabel: `${input.dateFrom} – ${input.dateTo}`,
      filtersLabel: "Up to 500 events in range",
      rowCount: csvRows.length,
    }),
    columns: [
      { key: "when", label: "When" },
      { key: "actor", label: "Actor" },
      { key: "action", label: "Action" },
      { key: "target", label: "Detail" },
    ],
    rows: csvRows.map((r) => ({
      when: new Date(r.createdAt).toLocaleString(),
      actor: r.actorName,
      action: r.actionType,
      target: r.targetEntity,
    })),
  };
  return ok(detail, securityAuditCsvFilename(), printable, companyName);
}

export async function exportPtoAutomationRunsReport(
  input: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.ORG_OWNER);
  if (!gated.ok) return gated;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const fromIso = startOfDayIso(input.dateFrom);
  const toIso = endOfDayExclusiveIso(input.dateTo);
  let runsQ = supabase
    .from("pto_automation_runs")
    .select("job_type, period_key, status, triggered_by, error_message, started_at")
    .order("started_at", { ascending: false })
    .limit(200);
  if (fromIso) runsQ = runsQ.gte("started_at", fromIso);
  if (toIso) runsQ = runsQ.lt("started_at", toIso);
  const { data: runs, error } = await runsQ;
  if (error) return { ok: false, error: error.message };

  const mapped = (runs ?? []).map((r) => {
    const row = r as {
      job_type: string;
      period_key: string;
      status: string;
      triggered_by: string;
      error_message: string | null;
      started_at: string;
    };
    return {
      startedAt: new Date(row.started_at).toLocaleString(),
      jobType: row.job_type,
      periodKey: row.period_key,
      triggeredBy: row.triggered_by,
      status: row.status,
      errorMessage: row.error_message ?? "",
    };
  });

  const detail = buildPtoAutomationRunsCsv(mapped);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "PTO automation history",
      periodLabel: `${input.dateFrom} – ${input.dateTo}`,
      filtersLabel: "Up to 200 runs in range",
      rowCount: mapped.length,
    }),
    columns: [
      { key: "when", label: "Date" },
      { key: "task", label: "Task" },
      { key: "period", label: "Period" },
      { key: "source", label: "Source" },
      { key: "result", label: "Result" },
    ],
    rows: mapped.map((r) => ({
      when: r.startedAt,
      task: r.jobType,
      period: r.periodKey,
      source: r.triggeredBy,
      result: r.status,
    })),
  };
  return ok(detail, `pto_automation_history_${todaySlug()}.csv`, printable, companyName);
}

export async function exportStoresDirectoryReport(
  input?: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.USERS_VIEW);
  if (!gated.ok) return gated;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const { data: locs, error } = await supabase
    .from("locations")
    .select("id, name, status, manager_employee_id")
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const managerIds = [
    ...new Set(
      (locs ?? [])
        .map((l) => (l as { manager_employee_id?: string | null }).manager_employee_id)
        .filter(Boolean),
    ),
  ] as string[];
  const managerNameById = new Map<string, string>();
  if (managerIds.length > 0) {
    const { data: mgrs } = await supabase.from("employees").select("id, full_name").in("id", managerIds);
    for (const m of mgrs ?? []) {
      const row = m as { id: string; full_name: string };
      managerNameById.set(row.id, row.full_name);
    }
  }

  const storeRows = (locs ?? []).map((l) => {
    const row = l as { id: string; name: string; status: string; manager_employee_id: string | null };
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      storeLeadName: row.manager_employee_id
        ? managerNameById.get(row.manager_employee_id) ?? "—"
        : "—",
    };
  });

  const detail = buildStoresDirectoryCsv(storeRows);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "Store directory",
      periodLabel: `Snapshot as of ${formatYmd(new Date())}`,
      rowCount: storeRows.length,
    }),
    columns: [
      { key: "name", label: "Store" },
      { key: "status", label: "Status" },
      { key: "lead", label: "Store lead" },
    ],
    rows: storeRows.map((r) => ({
      name: r.name,
      status: r.status,
      lead: r.storeLeadName,
    })),
  };
  return ok(detail, `store_directory_${todaySlug()}.csv`, printable, companyName);
}

export async function exportScheduleRosterReport(
  input: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.SCHEDULE_VIEW);
  if (!gated.ok) return gated;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const weekMonday = weekMondayFromFilter(input.dateFrom);
  const weekEnd = addDays(weekMonday, 7);
  const rangeLabel = `${weekMonday.toLocaleDateString()} – ${addDays(weekMonday, 6).toLocaleDateString()}`;

  const { data: locRows } = await supabase.from("locations").select("id, name");
  const locNameById = new Map(
    ((locRows ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]),
  );

  let shiftQ = supabase
    .from("shifts")
    .select(
      "shift_start, shift_end, location_id, is_published, employees(full_name, role), schedule_jobs(name)",
    )
    .gte("shift_start", weekMonday.toISOString())
    .lt("shift_start", weekEnd.toISOString())
    .order("shift_start", { ascending: true });
  if (!input.scopeAll) {
    shiftQ = shiftQ.eq("location_id", input.locationId);
  }
  const { data: shifts, error } = await shiftQ;
  if (error) return { ok: false, error: error.message };

  const rosterRows = (shifts ?? []).map((raw) => {
    const s = raw as {
      shift_start: string;
      shift_end: string;
      location_id: string;
      is_published: boolean | null;
      employees: { full_name?: string; role?: string } | { full_name?: string; role?: string }[] | null;
      schedule_jobs: { name?: string } | { name?: string }[] | null;
    };
    const emp = Array.isArray(s.employees) ? s.employees[0] : s.employees;
    const job = Array.isArray(s.schedule_jobs) ? s.schedule_jobs[0] : s.schedule_jobs;
    const start = new Date(s.shift_start);
    const end = new Date(s.shift_end);
    return {
      shiftDate: start.toLocaleDateString(),
      dayOfWeek: start.toLocaleDateString(undefined, { weekday: "short" }),
      employeeName: emp?.full_name ?? "—",
      role: emp?.role ?? "—",
      storeName: locNameById.get(s.location_id) ?? input.scopeLabel,
      jobName: job?.name ?? "—",
      shiftStart: start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      shiftEnd: end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      published: s.is_published ? "Yes" : "No",
    };
  });

  const detail = buildScheduleRosterCsv(rosterRows);
  const weekParam = formatWeekQueryParam(weekMonday);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "Weekly schedule roster",
      periodLabel: rangeLabel,
      scopeLabel: input.scopeLabel,
      rowCount: rosterRows.length,
    }),
    columns: [
      { key: "date", label: "Date" },
      { key: "employee", label: "Employee" },
      { key: "store", label: "Store" },
      { key: "start", label: "Start" },
      { key: "end", label: "End" },
    ],
    rows: rosterRows.map((r) => ({
      date: `${r.dayOfWeek} ${r.shiftDate}`,
      employee: r.employeeName,
      store: r.storeName,
      start: r.shiftStart,
      end: r.shiftEnd,
    })),
  };
  return ok(detail, `schedule_roster_${weekParam}_${todaySlug()}.csv`, printable, companyName);
}

export async function exportActivityLogReport(
  input: ReportFilterInput,
): Promise<EmployeeRecordsExportResult> {
  const gated = await gate(PERMISSIONS.ACTIVITY_VIEW);
  if (!gated.ok) return gated;

  const supabase = await createSupabaseServerClient();
  const companyName = await loadCompanyName(supabase);
  const fromIso = startOfDayIso(input.dateFrom);
  const toIso = endOfDayExclusiveIso(input.dateTo);
  let q = supabase
    .from("activity_events")
    .select("employee_label, action, status, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (!input.scopeAll) {
    q = q.eq("location_id", input.locationId);
  }
  if (fromIso) q = q.gte("occurred_at", fromIso);
  if (toIso) q = q.lt("occurred_at", toIso);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const mapped = (data ?? []).map((r) => {
    const row = r as {
      employee_label: string;
      action: string;
      status: string;
      occurred_at: string;
    };
    return {
      occurredAt: new Date(row.occurred_at).toLocaleString(),
      employeeLabel: row.employee_label,
      action: row.action,
      status: row.status,
    };
  });

  const detail = buildActivityLogCsv(mapped);
  const printable: PrintableReport = {
    meta: buildReportMeta({
      companyName,
      reportTitle: "Activity log",
      scopeLabel: input.scopeLabel,
      periodLabel: `${input.dateFrom} – ${input.dateTo}`,
      filtersLabel: "Up to 500 events in range",
      rowCount: mapped.length,
    }),
    columns: [
      { key: "when", label: "When" },
      { key: "who", label: "Employee" },
      { key: "action", label: "Action" },
      { key: "status", label: "Status" },
    ],
    rows: mapped.map((r) => ({
      when: r.occurredAt,
      who: r.employeeLabel,
      action: r.action,
      status: r.status,
    })),
  };
  return ok(detail, `activity_log_${todaySlug()}.csv`, printable, companyName);
}
