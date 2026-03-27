"use client";

import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import type { ActivityFeedItem } from "@/components/dashboard/activity-feed.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function mapActivityStatus(s: string): ActivityFeedItem["status"] {
  if (s === "ok" || s === "late" || s === "info") return s;
  return "info";
}

type Props = {
  initialItems: ActivityFeedItem[];
  locationId: string;
  enableRealtime: boolean;
  errorMessage?: string | null;
  emptyHint?: string | null;
};

export function ActivityFeedLive({
  initialItems,
  locationId,
  enableRealtime,
  errorMessage,
  emptyHint,
}: Props) {
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!enableRealtime || !locationId) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`activity:${locationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_events",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const id = String(row.id ?? "");
          const item: ActivityFeedItem = {
            id,
            who: String(row.employee_label ?? ""),
            action: String(row.action ?? ""),
            status: mapActivityStatus(String(row.status ?? "")),
            occurredAt: String(row.occurred_at ?? ""),
          };
          setItems((prev) => {
            if (prev.some((p) => p.id === item.id)) return prev;
            return [item, ...prev].slice(0, 12);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enableRealtime, locationId]);

  return <ActivityFeed items={items} errorMessage={errorMessage} emptyHint={emptyHint} />;
}
