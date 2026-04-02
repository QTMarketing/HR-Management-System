/** Position / job role — persisted to `employees.role` and mirrored to `employees.title`. */
export const POSITION_ROLE_OPTIONS = [
  "Employee",
  "Shift Lead",
  "Store Manager",
] as const;

export type PositionRoleValue = (typeof POSITION_ROLE_OPTIONS)[number];
