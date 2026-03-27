/** Picks the time clock id from the cookie, or the first active clock for the location. */
export function resolveSelectedTimeClockId(
  clocks: { id: string }[],
  cookieValue: string | undefined,
): string {
  if (cookieValue && clocks.some((c) => c.id === cookieValue)) {
    return cookieValue;
  }
  return clocks[0]?.id ?? "";
}
