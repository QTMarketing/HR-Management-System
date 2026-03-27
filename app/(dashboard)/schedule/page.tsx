import { cookies } from "next/headers";
import { Suspense } from "react";
import {
  ScheduleHub,
  type ScheduleCard,
} from "@/components/schedule/schedule-hub";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SchedulePage() {
  await requirePermission(PERMISSIONS.SCHEDULE_VIEW);

  const supabase = await createSupabaseServerClient();

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
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
    locations.find((l) => l.id === locationId)?.name ?? "Location";

  const activeCards: ScheduleCard[] = [
    {
      id: "main",
      title: "Main schedule",
      assignedLabel: scopeAll
        ? "All locations (matches header scope)"
        : `All active employees · ${locationName}`,
      hint: "Opens the week board: toolbars, day summaries, role rows, shift cards, weekly summary.",
      href: "/schedule/board",
    },
  ];

  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading schedule hub…
        </div>
      }
    >
      <ScheduleHub
        locationLabel={locationName}
        activeCards={activeCards}
        archivedCards={[]}
      />
    </Suspense>
  );
}
