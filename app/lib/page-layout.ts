/** Shared responsive shell + grid classes for large and 4K displays (up to 3840px). */

export const PAGE_PADDING =
  "px-4 sm:px-6 lg:px-8 3xl:px-10 4xl:px-14 5xl:px-16";

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

/** Listing card grids — more columns on ultrawide and 4K screens. */
export const LISTING_GRID =
  "grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7 5xl:grid-cols-8";

export const LISTING_GRID_MT = `mt-4 ${LISTING_GRID}`;
