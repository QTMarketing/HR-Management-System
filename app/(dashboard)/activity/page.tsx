import { cookies } from "next/headers";
import { ActivityFeedLive } from "@/components/dashboard/activity-feed-live";
import type { ActivityFeedItem } from "@/components/dashboard/activity-feed.types";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import { isAllLocations, resolveSelectedLocationId, type LocationRow } from "@/lib/dashboard/resolve-location";
import { DEMO_LOCATIONS, demoActivityForLocation } from "@/lib/mock/dashboard-demo";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mapActivityStatus(s: string): ActivityFeedItem["status"] {
  if (s === "ok" || s === "late" || s === "info") return s;
  return "info";
}

const forceMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

const sqlHint =
  "Run Supabase migrations through 007 for chains, locations, and time clocks aligned with your PRD.";

export default async function ActivityPage() {
  await requirePermission(PERMISSIONS.ACTIVITY_VIEW);

  const supabase = await createSupabaseServerClient();

  let rawLocations: LocationRow[] = [];
  if (!forceMock) {
    const { data } = await supabase
      .from("locations")
      .select("id, name")
      .neq("status", "archived")
      .order("sort_order", { ascending: true });
    rawLocations = (data ?? []).map((r) => ({ id: r.id, name: r.name }));
  }
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);
  const locationName =
    locations.find((l) => l.id === locationId)?.name ?? "Your location";

  let activityItems: ActivityFeedItem[] = [];
  let activityError: string | null = null;
  let usedDemoFallback = false;

  if (forceMock) {
    activityItems = [...demoActivityForLocation(locationId)];
    usedDemoFallback = true;
  } else {
    try {
      let q = supabase
        .from("activity_events")
        .select("id, employee_label, action, status, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(120);
      if (!scopeAll) {
        q = q.eq("location_id", locationId);
      }
      const activityRes = await q;

      if (activityRes.error) activityError = activityRes.error.message;
      else if (activityRes.data) {
        activityItems = activityRes.data
          .map((row) => ({
            id: row.id,
            who: row.employee_label,
            action: row.action,
            status: mapActivityStatus(row.status),
            occurredAt: row.occurred_at,
          }))
          .sort(
            (a, b) =>
              new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
          );
      }
    } catch (e) {
      activityError =
        e instanceof Error ? e.message : "Could not load activity. Check Supabase and migrations.";
    }

    if (activityError && activityItems.length === 0) {
      usedDemoFallback = true;
      activityItems = [...demoActivityForLocation(locationId)];
      activityError = null;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Activity</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live events for <span className="font-medium text-slate-700">{locationName}</span> — same
          feed as the dashboard; the header controls whether this is one store or all locations.
        </p>
      </div>

      {usedDemoFallback && forceMock ? (
        <p className="rounded-lg border border-orange-200 bg-orange-50/90 px-4 py-3 text-sm text-orange-950">
          Demo mode — mock events only.
        </p>
      ) : null}

      {activityError && !usedDemoFallback ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {activityError} {sqlHint}
        </p>
      ) : null}

      <ActivityFeedLive
        initialItems={activityItems}
        locationId={locationId}
        enableRealtime={!forceMock && !usedDemoFallback && !scopeAll}
        errorMessage={activityError}
        emptyHint={activityError ? sqlHint : null}
        exploreMode
        maxFeedItems={120}
        feedClassName="flex min-h-0 max-h-[min(40rem,80vh)] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"
      />
    </div>
  );
}
