/** Server-passed row for manager queue (employee-submitted, status pending). */
export type PendingTimeOffRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  timeOffType: string;
  startAt: string;
  endAt: string;
  createdAt: string;
  employeeNotes: string | null;
};
