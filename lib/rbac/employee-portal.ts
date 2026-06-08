import type { RbacContext } from "@/lib/rbac/context";

/**
 * Frontline employee UX: minimal nav, no store switcher, mobile bottom bar.
 * Shift leads and above keep the full manager shell.
 */
export function isEmployeePortalUser(ctx: RbacContext): boolean {
  return ctx.enabled && ctx.roleKey === "employee" && Boolean(ctx.employeeId);
}

export type EmployeePortalNavItem = {
  href: string;
  label: string;
  group: "main";
};

export function buildEmployeePortalNav(profileHref: string | null): EmployeePortalNavItem[] {
  const items: EmployeePortalNavItem[] = [
    { href: "/", label: "Home", group: "main" },
    { href: "/my-punches", label: "My punches", group: "main" },
    { href: "/schedule", label: "Schedule", group: "main" },
  ];
  if (profileHref) {
    items.push({ href: profileHref, label: "Profile", group: "main" });
  }
  return items;
}
