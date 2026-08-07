/** Shared positioning for bottom-right floating controls (above mobile nav + sticky CTAs). */

/** FAB sits above sticky listing CTAs (z-10000) and bottom nav (z-9999); below Āwhina sheet. */
export const FAB_Z = "z-[10020]";

export const FAB_DOCK_POSITION =
  `fixed ${FAB_Z} right-[calc(1rem+env(safe-area-inset-right,0px))] bottom-[calc(1.25rem+var(--mobile-nav-offset,0px))] max-md:right-4`;

/** Āwhina chat sheet — always above FAB dock and bottom chrome. */
export const AWHINA_CHAT_SHEET_Z = "z-[10050]";
export const AWHINA_CHAT_BACKDROP_Z = "z-[10049]";

/** Left-side widgets (radar, matchmaking, scroll) — avoid the FAB corner. */
export const FLOATING_LEFT_STACK =
  "fixed z-[10040] left-[calc(1rem+env(safe-area-inset-left,0px))] max-md:left-4";

export const FLOATING_RADAR_POSITION =
  `${FLOATING_LEFT_STACK} bottom-[calc(9.5rem+var(--mobile-nav-offset,0px))] md:bottom-32`;

export const FLOATING_MATCHMAKING_POSITION =
  `${FLOATING_LEFT_STACK} bottom-[calc(5rem+var(--mobile-nav-offset,0px))] md:bottom-20`;

export const FLOATING_SCROLL_TOP_POSITION =
  `${FLOATING_LEFT_STACK} bottom-[calc(7rem+var(--mobile-nav-offset,0px))] md:bottom-24`;

/** Toasts — top-right so they never cover the FAB dock. */
export const TOAST_STACK_POSITION =
  "fixed z-[99999] top-[calc(4.5rem+env(safe-area-inset-top,0px))] right-[calc(1rem+env(safe-area-inset-right,0px))] max-md:top-[calc(3.75rem+env(safe-area-inset-top,0px))]";
