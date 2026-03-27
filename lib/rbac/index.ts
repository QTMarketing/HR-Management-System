export { PERMISSIONS, ALL_PERMISSIONS, type Permission } from "./permissions";
export { ROLE_PERMISSIONS, normalizeRoleLabel, type AppRoleKey } from "./matrix";
export { getRbacContext, hasPermission, type RbacContext } from "./context";
export {
  DASHBOARD_NAV,
  filterNavForRbac,
  type NavItem,
  type NavItemWithGroup,
  type NavGroup,
} from "./nav";
export { requirePermission } from "./guard";
