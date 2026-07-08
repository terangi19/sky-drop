/** Shared positioning for bottom-right floating controls (above mobile nav). */
export const FAB_DOCK_POSITION =
  "fixed z-[9998] bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-[calc(1rem+env(safe-area-inset-right,0px))] max-md:bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] max-md:right-4";

/** Āwhina chat sheet — always above FAB dock and bottom chrome. */
export const AWHINA_CHAT_SHEET_Z = "z-[10050]";
export const AWHINA_CHAT_BACKDROP_Z = "z-[10049]";

/** Left-side widgets (radar, matchmaking, scroll) — avoid the FAB corner. */
export const FLOATING_LEFT_STACK =
  "fixed z-[10040] left-[calc(1rem+env(safe-area-inset-left,0px))] max-md:left-4";

export const FLOATING_RADAR_POSITION =
  `${FLOATING_LEFT_STACK} bottom-[calc(10rem+env(safe-area-inset-bottom,0px))] max-md:bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] md:bottom-32`;

export const FLOATING_MATCHMAKING_POSITION =
  `${FLOATING_LEFT_STACK} bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] max-md:bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:bottom-20`;

export const FLOATING_SCROLL_TOP_POSITION =
  `${FLOATING_LEFT_STACK} bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] max-md:bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] md:bottom-24`;

/** Toasts — top-right so they never cover the FAB dock. */
export const TOAST_STACK_POSITION =
  "fixed z-[99999] top-[calc(4.5rem+env(safe-area-inset-top,0px))] right-[calc(1rem+env(safe-area-inset-right,0px))] max-md:top-[calc(3.75rem+env(safe-area-inset-top,0px))]";
