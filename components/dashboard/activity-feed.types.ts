export type ActivityStatus = "ok" | "late" | "info";

export type ActivityFeedItem = {
  id: string;
  who: string;
  action: string;
  status: ActivityStatus;
  occurredAt: string;
};
