export type LocationRow = { id: string; name: string };

/** Header value: roll up dashboard / activity across every store. */
export const ALL_LOCATIONS_ID = "__all__";

export function isAllLocations(locationId: string): boolean {
  return locationId === ALL_LOCATIONS_ID;
}

/** Prepend company-wide scope so the header and `resolveSelectedLocationId` stay aligned. */
export function withAllLocationsFirst(rows: LocationRow[]): LocationRow[] {
  const rest = rows.filter((l) => l.id !== ALL_LOCATIONS_ID);
  return [{ id: ALL_LOCATIONS_ID, name: "All locations" }, ...rest];
}

export function resolveSelectedLocationId(
  locations: LocationRow[],
  cookieValue: string | undefined,
): string {
  if (cookieValue && locations.some((l) => l.id === cookieValue)) {
    return cookieValue;
  }
  return locations[0]?.id ?? "";
}
