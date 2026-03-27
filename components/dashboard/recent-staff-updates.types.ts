export type StaffUpdateStatus = "approved" | "review" | "pending";

export type StaffUpdateRow = {
  id: string;
  employeeLabel: string;
  updateText: string;
  status: StaffUpdateStatus;
  createdAt: string;
};
