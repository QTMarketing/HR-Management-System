/**
 * Cache tag registry — single source of truth for `revalidateTag()` keys.
 *
 * Why this file exists
 * --------------------
 * `revalidatePath` is path-coupled: every consumer of a piece of data has to
 * be enumerated when something changes. That falls apart for:
 *   - mobile widgets that hit an API instead of an RSC route,
 *   - cross-route reads (the Employee Hub consumes `time_clocks` data on
 *     `/`, on `/time-clock`, and on `/time-clock/[id]`),
 *   - future `unstable_cache` wrappers that need a stable invalidation key.
 *
 * Tags decouple writers from readers. A save action calls
 * `revalidateTag(timeClockTag(id))` once; any current OR future cache layer
 * subscribed to that tag is invalidated atomically.
 *
 * Convention
 * ----------
 * - Tags are lowercase, dot-separated, prefixed by domain.
 * - Use the helper functions to build per-id tags so a typo can't accidentally
 *   widen the invalidation scope (e.g. forgetting the id and broadcasting
 *   "time_clocks" to every clock in the org).
 *
 * Today these tags are forward-compat: most read sites still hit the DB
 * inline on every render, so `revalidateTag` is a no-op until a fetcher is
 * wrapped in `unstable_cache(..., { tags: [...] })`. Calling them now means
 * we don't have to retrofit the save sites later.
 */

/** Broad bucket for *every* time-clock row. Use only when the change applies org-wide. */
export const TIME_CLOCKS_TAG = "time_clocks.all" as const;

/** Per-clock tag — invalidate exactly one clock's settings/state. */
export function timeClockTag(timeClockId: string): string {
  const id = timeClockId?.trim();
  return id ? `time_clocks.id.${id}` : TIME_CLOCKS_TAG;
}

/** All payroll policy rows (global + every store). Use when the global policy moves. */
export const PAYROLL_POLICIES_TAG = "payroll_policies.all" as const;

/** Per-location policy override. `null` = the global row. */
export function payrollPolicyTag(locationId: string | null): string {
  const id = locationId?.trim();
  return id
    ? `payroll_policies.location.${id}`
    : "payroll_policies.global";
}

/** Per-location pin. Useful when a clock’s location-scoped policy changes. */
export function locationTag(locationId: string): string {
  const id = locationId?.trim();
  return id ? `locations.id.${id}` : "locations.all";
}
