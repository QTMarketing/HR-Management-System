export const TIME_OFF_TYPES = [
  "Unpaid leave",
  "Sick leave",
  "Holiday leave",
  "PTO",
  "Bereavement",
  "Other",
] as const;

export type TimeOffTypeLabel = (typeof TIME_OFF_TYPES)[number];
