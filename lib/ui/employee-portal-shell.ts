/**
 * Shared width + padding for employee portal chrome and page content.
 * Mobile: edge-to-edge cards; tablet: comfortable reading width;
 * desktop: uses available canvas (workforce apps target ~1152–1280px, not ~768px).
 */
export const employeePortalShellClass =
  "mx-auto w-full max-w-xl px-4 sm:max-w-3xl sm:px-6 lg:max-w-6xl lg:px-8 xl:max-w-7xl";

/** Staggered entrance for hub sections — respects reduced motion. */
export const employeePortalRevealClass =
  "motion-safe:animate-[emp-portal-rise_0.45s_ease-out_both]";
