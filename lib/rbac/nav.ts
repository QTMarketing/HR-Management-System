import { PERMISSIONS, type Permission } from "./permissions";
import type { RbacContext } from "./context";
import { hasPermission } from "./context";

export type NavItem = {
  href: string;
  label: string;
  /** Minimum permission to show the link */
  permission: Permission;
};

export type NavGroup = "main" | "operations";

export type NavItemWithGroup = NavItem & { group?: NavGroup };

/** Order matches PRD: overview, users, then Operations (activity, time clock, schedule). */
export const DASHBOARD_NAV: NavItemWithGroup[] = [
  { href: "/", label: "Dashboard", permission: PERMISSIONS.DASHBOARD_VIEW, group: "main" },
  { href: "/users", label: "Users", permission: PERMISSIONS.USERS_VIEW, group: "main" },
  {
    href: "/users/groups",
    label: "Smart groups",
    permission: PERMISSIONS.USERS_VIEW,
    group: "main",
  },
  {
    href: "/activity",
    label: "Activity",
    permission: PERMISSIONS.ACTIVITY_VIEW,
    group: "operations",
  },
  { href: "/time-clock", label: "Time Clock", permission: PERMISSIONS.TIME_CLOCK_VIEW, group: "operations" },
  { href: "/schedule", label: "Schedule", permission: PERMISSIONS.SCHEDULE_VIEW, group: "operations" },
];

export function filterNavForRbac(ctx: RbacContext, items: NavItemWithGroup[]): NavItemWithGroup[] {
  if (!ctx.enabled) return items;
  return items.filter((item) => hasPermission(ctx, item.permission));
}

