import { cookies } from "next/headers";
import { Suspense } from "react";
import { ScheduleStoresList, type ScheduleStoreCardModel } from "@/components/schedule/schedule-stores-list";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { formatWeekQueryParam, mondayOfWeekContaining } from "@/lib/schedule/week";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SchedulePage() {
  await requirePermission(PERMISSIONS.SCHEDULE_VIEW);

  const supabase = await createSupabaseServerClient();

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name, manager_employee_id")
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  const weekMonday = mondayOfWeekContaining(new Date());
  const weekParam = formatWeekQueryParam(weekMonday);

  const canEditByPermission =
    !ctx.enabled || hasPermission(ctx, PERMISSIONS.SCHEDULE_EDIT);
  const ownerCanEditAll = !ctx.enabled || ctx.roleKey === "owner";
  const managerIdByLocation = new Map(
    (locRows ?? []).map((r) => [r.id as string, (r as { manager_employee_id?: string | null }).manager_employee_id ?? null] as const),
  );

  const visibleLocations = scopeAll
    ? locations.filter((l) => !isAllLocations(l.id))
    : locations.filter((l) => l.id === locationId);

  const { data: empRows } = await supabase
    .from("employees")
    .select("id, full_name, role, location_id")
    .eq("status", "active")
    .order("full_name");

  const byLoc = new Map<string, { id: string; fullName: string; role?: string | null }[]>();
  for (const r of empRows ?? []) {
    const lid = r.location_id as string;
    if (!lid) continue;
    if (!byLoc.has(lid)) byLoc.set(lid, []);
    byLoc.get(lid)!.push({
      id: r.id as string,
      fullName: (r.full_name as string) ?? "—",
      role: (r.role as string) ?? null,
    });
  }

  const stores: ScheduleStoreCardModel[] = visibleLocations.map((l) => {
    const managerEmployeeId = managerIdByLocation.get(l.id) ?? null;
    const isStoreManager = ctx.employeeId != null && managerEmployeeId === ctx.employeeId;
    const canEdit = canEditByPermission && (ownerCanEditAll || isStoreManager);
    return {
      locationId: l.id,
      locationName: l.name,
      employees: byLoc.get(l.id) ?? [],
      canEdit,
    };
  });

  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading schedule hub…
        </div>
      }
    >
      <ScheduleStoresList
        scopeLabel={scopeAll ? "All locations" : locationName}
        weekParam={weekParam}
        stores={stores}
      />
    </Suspense>
  );
}
