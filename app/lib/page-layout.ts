/** Shared responsive shell + grid classes for large and 4K displays (up to 3840px). */

export const PAGE_PADDING =
  "px-4 sm:px-6 lg:px-8 3xl:px-10 4xl:px-14 5xl:px-16";

/** Tighter vertical rhythm for mobile-first marketplace pages. */
export const PAGE_SECTION_Y = "py-5 sm:py-8 lg:py-10";

/** Dashboard, profile, and compact browse sections (~1152px base, scales to ~1792px at 4K). */
export const PAGE_SHELL_WIDE = [
  "relative z-10 mx-auto w-full max-w-6xl",
  PAGE_PADDING,
  "3xl:max-w-[80rem] 4xl:max-w-[96rem] 5xl:max-w-[112rem]",
].join(" ");

/** Marketplace listing areas (~1800px base, scales to ~3200px at 4K). */
export const PAGE_SHELL_MARKETPLACE = [
  "relative z-10 mx-auto w-full max-w-[1800px]",
  PAGE_PADDING,
  "3xl:max-w-[100rem] 4xl:max-w-[140rem] 5xl:max-w-[200rem]",
].join(" ");

/** Messages and wide two-panel layouts. */
export const PAGE_SHELL_CHAT = [
  "relative z-10 mx-auto w-full max-w-7xl",
  PAGE_PADDING,
  "3xl:max-w-[90rem] 4xl:max-w-[112rem] 5xl:max-w-[128rem]",
].join(" ");

/**
 * Listing card grids — 1 col on the narrowest phones for readability,
 * 2 cols from sm, then scale up on larger screens.
 */
export const LISTING_GRID =
  "grid items-stretch gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-5 4xl:grid-cols-5 5xl:grid-cols-5";

export const LISTING_GRID_MT = `mt-4 ${LISTING_GRID}`;

/** Dense 2-col watchlist/manage grids — keep readable gaps on mobile. */
export const LISTING_GRID_DENSE =
  "grid items-stretch gap-2.5 grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4";

/**
 * Sticky mobile CTA sits above the bottom nav via --mobile-nav-offset.
 * CSS `.mobile-sticky-cta` ends short of the FAB (`right: var(--fab-clearance)`).
 */
export const MOBILE_STICKY_CTA =
  "mobile-sticky-cta border-t border-[var(--card-border)] bg-[var(--card)]/95 backdrop-blur-xl px-4 py-3 flex gap-3 lg:hidden";

/** Extra bottom/right pad on mobile when FAB + bottom nav are present (e.g. message composer). */
export const MOBILE_FAB_CLEARANCE =
  "max-md:pr-[calc(4.5rem+env(safe-area-inset-right,0px))] max-md:pb-1";
