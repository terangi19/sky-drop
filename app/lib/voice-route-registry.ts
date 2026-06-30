/**
 * Voice route registry — now delegates to the comprehensive command-registry.
 *
 * Kept for backward compatibility with imports in awhina-voice-command.ts.
 * All route definitions live in ./command-registry.ts.
 */

export type RouteEntry = import("./command-registry").RouteEntry;
export {
  ROUTE_REGISTRY,
  matchRouteFromRegistry as matchRoute,
  matchRouteStrict,
  scorePhraseMatch,
} from "./command-registry";
