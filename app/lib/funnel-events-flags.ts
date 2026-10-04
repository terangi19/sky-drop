/**
 * Funnel analytics writes. Default OFF for closed beta.
 *
 * FUNNEL_EVENTS_ENABLED — optional alias baked into the public flag in next.config.
 * NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED — client writes (baked at build).
 *
 * Only the literal string "true" enables writes. Unset / "false" / "1" stay off.
 */

export function isFunnelEventsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED === "true";
}
