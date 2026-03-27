/**
 * Fine-grained permissions for Retail HR. Use in server components, actions, and nav.
 * Extend this list as modules grow (payroll, reports, admin, etc.).
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  /** Operations feed (dedicated Activity page) */
  ACTIVITY_VIEW: "activity.view",
  /** Directory / roster (Users page) */
  USERS_VIEW: "users.view",
  /** Future: edit roles, invite users, deactivate */
  USERS_MANAGE: "users.manage",
  TIME_CLOCK_VIEW: "timeclock.view",
  /** Approve or adjust team punches (manager / lead flows) */
  TIME_CLOCK_MANAGE: "timeclock.manage",
  SCHEDULE_VIEW: "schedule.view",
  /** Create / edit shifts */
  SCHEDULE_EDIT: "schedule.edit",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);
