import { withAllLocationsFirst, type LocationRow } from "@/lib/dashboard/resolve-location";
import { withDemoLocations } from "@/lib/mock/dashboard-demo";

/** Same list as the dashboard layout: All locations first, then stores (demo fallback if empty). */
export function locationsForSession(dbRows: LocationRow[]): LocationRow[] {
  return withAllLocationsFirst(withDemoLocations(dbRows));
}
