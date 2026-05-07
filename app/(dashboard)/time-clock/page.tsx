import { cookies } from "next/headers";
import { Suspense } from "react";
import {
  TimeClockHub,
  type HubClock,
} from "@/components/time-clock/time-clock-hub";
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
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TimeClockHubPage() {
  await requirePermission(PERMISSIONS.TIME_CLOCK_VIEW);

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);
  const canManageClocks =
    !rbac.enabled || hasPermission(rbac, PERMISSIONS.TIME_CLOCK_MANAGE);

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name, chain_id")
    .neq("status", "archived")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);
  const locationsForAdd = locations.filter((l) => !isAllLocations(l.id));

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);
  const locationName =
    locations.find((l) => l.id === locationId)?.name ?? "Location";

  let errorMessage: string | null = null;
  const activeClocks: HubClock[] = [];
  const archivedClocks: HubClock[] = [];
  let employeeCount = 0;

  const locNameById = new Map((locRows ?? []).map((l) => [l.id, l.name] as const));
  const locChainById = new Map((locRows ?? []).map((l) => [l.id, l.chain_id] as const));

  if (scopeAll) {
    const { count } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");
    employeeCount = count ?? 0;

    const { data: empLocRows } = await supabase
      .from("employees")
      .select("location_id")
      .eq("status", "active");
    const byLocation = new Map<string, number>();
    for (const e of empLocRows ?? []) {
      if (!e.location_id) continue;
      byLocation.set(e.location_id, (byLocation.get(e.location_id) ?? 0) + 1);
    }

    const locIds = (locRows ?? []).map((l) => l.id as string);
    const { data: clockRows, error: clockErr } = await supabase
      .from("time_clocks")
      .select("id, name, status, location_id, locations(name, chain_id)")
      .in("location_id", locIds.length > 0 ? locIds : ["00000000-0000-0000-0000-000000000000"])
      .order("sort_order", { ascending: true });

    if (clockErr) {
      errorMessage =
        clockErr.message +
        " — This usually means the database setup isn’t finished for Time Clock. Ask an admin to complete setup, then refresh.";
    } else {
      for (const row of clockRows ?? []) {
        const st = row.status === "archived" ? "archived" : "active";
        const lid = row.location_id as string;
        const locNested = row.locations as { name?: string } | { name?: string }[] | null | undefined;
        const fromJoin = Array.isArray(locNested)
          ? locNested[0]?.name
          : locNested?.name;
        const chainFromJoin = Array.isArray(locNested)
          ? (locNested[0] as { chain_id?: string | null } | undefined)?.chain_id
          : (locNested as { chain_id?: string | null } | undefined)?.chain_id;
        const chainId = chainFromJoin ?? (locChainById.get(lid) as string | null | undefined) ?? null;
        const storeSide =
          chainId === "c0000000-0000-4000-8000-000000000001"
            ? ("east" as const)
            : chainId === "c0000000-0000-4000-8000-000000000002"
              ? ("west" as const)
              : null;
        const item: HubClock = {
          id: row.id,
          name: row.name,
          status: st,
          storeName: fromJoin ?? locNameById.get(lid) ?? null,
          storeSide,
          employeesAtStore: byLocation.get(lid) ?? 0,
          hint:
            st === "archived"
              ? "Archived — open for read-only timesheet history."
              : "Opens Today and Timesheets: logged time and approvals for this store.",
        };
        if (st === "archived") archivedClocks.push(item);
        else activeClocks.push(item);
      }
    }
  } else {
    const { count } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("location_id", locationId)
      .eq("status", "active");
    employeeCount = count ?? 0;

    const { data: clockRows, error: clockErr } = await supabase
      .from("time_clocks")
      .select("id, name, status")
      .eq("location_id", locationId)
      .order("sort_order", { ascending: true });

    if (clockErr) {
      errorMessage =
        clockErr.message +
        " — This usually means the database setup isn’t finished for Time Clock. Ask an admin to complete setup, then refresh.";
    } else {
      for (const row of clockRows ?? []) {
        const st = row.status === "archived" ? "archived" : "active";
        const chainId = (locChainById.get(locationId) as string | null | undefined) ?? null;
        const storeSide =
          chainId === "c0000000-0000-4000-8000-000000000001"
            ? ("east" as const)
            : chainId === "c0000000-0000-4000-8000-000000000002"
              ? ("west" as const)
              : null;
        const item: HubClock = {
          id: row.id,
          name: row.name,
          status: st,
          storeName: locationName,
          storeSide,
          employeesAtStore: employeeCount,
          hint:
            st === "archived"
              ? "Archived — open for read-only timesheet history."
              : "Opens Today and Timesheets: logged time and approvals for this store.",
        };
        if (st === "archived") archivedClocks.push(item);
        else activeClocks.push(item);
      }
    }
  }

  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading time clocks…
        </div>
      }
    >
      <TimeClockHub
        locationName={locationName}
        scopeAll={scopeAll}
        activeClocks={activeClocks}
        archivedClocks={archivedClocks}
        employeeCount={employeeCount}
        errorMessage={errorMessage}
        locationsForAdd={locationsForAdd}
        canManageClocks={canManageClocks}
      />
    </Suspense>
  );
}
