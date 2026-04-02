import { PERMISSIONS, type Permission } from "@/lib/rbac/permissions";
import { permissionsForRoleKey } from "@/lib/rbac/matrix";

/** Granular Time clock (Connecteam-style flyout). */
export type TimeClockAccess = {
  view: boolean;
  approve_requests: boolean;
  edit_timesheets: boolean;
  edit_settings: boolean;
  add_delete_clocks: boolean;
};

/** Job scheduling / schedule module. */
export type ScheduleAccess = {
  view: boolean;
  edit_shifts: boolean;
  publish_shifts: boolean;
  edit_settings: boolean;
};

/** Stored in `employees.admin_access` for Store Managers. */
export type AdminAccess = {
  smart_groups: boolean;
  activity: boolean;
  time_clock: TimeClockAccess;
  schedule: ScheduleAccess;
  labor_report: boolean;
};

export const TIME_CLOCK_FLYOUT_TOTAL = 5;
export const SCHEDULE_FLYOUT_TOTAL = 4;

export function defaultAdminAccess(): AdminAccess {
  const tc: TimeClockAccess = {
    view: true,
    approve_requests: true,
    edit_timesheets: true,
    edit_settings: true,
    add_delete_clocks: true,
  };
  const sch: ScheduleAccess = {
    view: true,
    edit_shifts: true,
    publish_shifts: true,
    edit_settings: true,
  };
  return {
    smart_groups: true,
    activity: true,
    time_clock: tc,
    schedule: sch,
    labor_report: true,
  };
}

function readBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function timeClockSelectedCount(tc: TimeClockAccess): number {
  return [
    tc.view,
    tc.approve_requests,
    tc.edit_timesheets,
    tc.edit_settings,
    tc.add_delete_clocks,
  ].filter(Boolean).length;
}

export function scheduleSelectedCount(s: ScheduleAccess): number {
  return [s.view, s.edit_shifts, s.publish_shifts, s.edit_settings].filter(Boolean).length;
}

/** Expands legacy `{ view, manage }` time_clock JSON. */
function normalizeTimeClock(tc: Record<string, unknown>, d: TimeClockAccess): TimeClockAccess {
  const granularKeys = [
    "approve_requests",
    "edit_timesheets",
    "edit_settings",
    "add_delete_clocks",
  ];
  const hasGranular = granularKeys.some((k) => k in tc);
  if ("manage" in tc && !hasGranular) {
    const manage = readBool(tc.manage, d.approve_requests);
    const view = readBool(tc.view, d.view);
    return {
      view: manage || view,
      approve_requests: manage,
      edit_timesheets: manage,
      edit_settings: manage,
      add_delete_clocks: manage,
    };
  }
  let out: TimeClockAccess = {
    view: readBool(tc.view, d.view),
    approve_requests: readBool(tc.approve_requests, d.approve_requests),
    edit_timesheets: readBool(tc.edit_timesheets, d.edit_timesheets),
    edit_settings: readBool(tc.edit_settings, d.edit_settings),
    add_delete_clocks: readBool(tc.add_delete_clocks, d.add_delete_clocks),
  };
  const anyManage =
    out.approve_requests ||
    out.edit_timesheets ||
    out.edit_settings ||
    out.add_delete_clocks;
  if (anyManage) out = { ...out, view: true };
  return out;
}

function normalizeSchedule(sch: Record<string, unknown>, d: ScheduleAccess): ScheduleAccess {
  let schedule: ScheduleAccess = {
    view: readBool(sch.view, d.view),
    edit_shifts: readBool(sch.edit_shifts, d.edit_shifts),
    publish_shifts: readBool(sch.publish_shifts, d.publish_shifts),
    edit_settings: readBool(sch.edit_settings, d.edit_settings),
  };
  if (!schedule.edit_shifts) schedule = { ...schedule, publish_shifts: false };
  if (schedule.publish_shifts) {
    schedule = { ...schedule, view: true, edit_shifts: true };
  } else if (schedule.edit_shifts || schedule.edit_settings) {
    schedule = { ...schedule, view: true };
  }
  return schedule;
}

export function normalizeAdminAccess(raw: unknown): AdminAccess {
  const d = defaultAdminAccess();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  const tc = o.time_clock && typeof o.time_clock === "object" && !Array.isArray(o.time_clock)
    ? (o.time_clock as Record<string, unknown>)
    : {};
  const sch = o.schedule && typeof o.schedule === "object" && !Array.isArray(o.schedule)
    ? (o.schedule as Record<string, unknown>)
    : {};

  return {
    smart_groups: readBool(o.smart_groups, d.smart_groups),
    activity: readBool(o.activity, d.activity),
    time_clock: normalizeTimeClock(tc, d.time_clock),
    schedule: normalizeSchedule(sch, d.schedule),
    labor_report: readBool(o.labor_report, d.labor_report),
  };
}

export function accessEqualsFull(a: AdminAccess): boolean {
  const f = defaultAdminAccess();
  return (
    a.smart_groups === f.smart_groups &&
    a.activity === f.activity &&
    a.labor_report === f.labor_report &&
    JSON.stringify(a.time_clock) === JSON.stringify(f.time_clock) &&
    JSON.stringify(a.schedule) === JSON.stringify(f.schedule)
  );
}

export function timeClockManageEffective(tc: TimeClockAccess): boolean {
  return (
    tc.approve_requests ||
    tc.edit_timesheets ||
    tc.edit_settings ||
    tc.add_delete_clocks
  );
}

export function scheduleEditEffective(s: ScheduleAccess): boolean {
  return s.edit_shifts || s.publish_shifts || s.edit_settings;
}

/** Permissions for a Store Manager row after applying `admin_access`. */
export function storeManagerPermissionsFromAccess(access: unknown): Permission[] {
  if (access == null) return permissionsForRoleKey("store_manager");
  const a = normalizeAdminAccess(access);
  const out: Permission[] = [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_MANAGE,
  ];
  if (a.smart_groups) out.push(PERMISSIONS.USERS_GROUPS_VIEW);
  if (a.activity) out.push(PERMISSIONS.ACTIVITY_VIEW);
  if (a.time_clock.view) out.push(PERMISSIONS.TIME_CLOCK_VIEW);
  if (timeClockManageEffective(a.time_clock)) out.push(PERMISSIONS.TIME_CLOCK_MANAGE);
  if (a.schedule.view) out.push(PERMISSIONS.SCHEDULE_VIEW);
  if (scheduleEditEffective(a.schedule)) out.push(PERMISSIONS.SCHEDULE_EDIT);
  if (a.labor_report) out.push(PERMISSIONS.LABOR_REPORT_VIEW);
  return out;
}

export function formatAdminAccessSummary(
  access: AdminAccess | null | undefined,
): string {
  if (access == null) return "All features";
  const a = normalizeAdminAccess(access);
  if (accessEqualsFull(a)) return "All features";
  const parts: string[] = [];
  if (a.smart_groups) parts.push("Smart groups");
  if (a.activity) parts.push("Activity");
  if (a.time_clock.view || timeClockManageEffective(a.time_clock)) parts.push("Time Clock");
  if (a.schedule.view || scheduleEditEffective(a.schedule)) parts.push("Schedule");
  if (a.labor_report) parts.push("Labor report");
  return parts.length ? parts.join(" · ") : "Users only";
}

export function countFraction(
  selected: number,
  total: number,
): string {
  return `${selected}/${total}`;
}
