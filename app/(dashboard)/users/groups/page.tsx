import { cookies } from "next/headers";
import { SmartGroupsClient } from "@/components/users/smart-groups-client";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  ALL_LOCATIONS_ID,
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { loadSmartGroupsPayload } from "@/lib/smart-groups/load-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ timeClock?: string }>;
};

export default async function SmartGroupsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const focusTimeClockId =
    typeof sp.timeClock === "string" && /^[0-9a-f-]{36}$/i.test(sp.timeClock.trim())
      ? sp.timeClock.trim()
      : null;
  await requirePermission(PERMISSIONS.USERS_GROUPS_VIEW);

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);
  const canManage = !rbac.enabled || hasPermission(rbac, PERMISSIONS.USERS_MANAGE);

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .neq("status", "archived")
    .order("sort_order", { ascending: true });

  const locations: LocationRow[] = locationsForSession(
    (locRows ?? []).map((r) => ({ id: r.id, name: r.name })),
  );
  const cookieStore = await cookies();
  const selectedLocationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(selectedLocationId);
  /** Real store UUIDs only — `__all__` is a UI sentinel, not a DB location. */
  const storeLocationIds = locations.map((l) => l.id).filter((id) => id !== ALL_LOCATIONS_ID);
  const viewLocationIds = scopeAll
    ? storeLocationIds
    : selectedLocationId && selectedLocationId !== ALL_LOCATIONS_ID
      ? [selectedLocationId]
      : [];

  const { data: payload, error } = await loadSmartGroupsPayload(supabase, {
    scopeLocationIds: viewLocationIds,
    scopeAll,
    selectedLocationId: scopeAll ? null : selectedLocationId,
  });

  if (!payload) {
    return (
      <SmartGroupsClient
        payload={{
          segments: [],
          employeesForPickers: [],
          timeClocks: [],
          locations: [],
        }}
        canManage={canManage}
        dbError={error ?? "Failed to load smart groups."}
        focusTimeClockId={focusTimeClockId}
      />
    );
  }

  return (
    <SmartGroupsClient
      payload={payload}
      canManage={canManage}
      dbError={null}
      focusTimeClockId={focusTimeClockId}
    />
  );
}
