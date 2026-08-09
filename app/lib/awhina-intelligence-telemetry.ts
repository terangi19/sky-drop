/**
 * Dev/debug telemetry for the intelligence pipeline.
 * Logs structured turn reasoning — never image bytes / unnecessary content.
 */

export type IntelligenceTelemetryEvent = {
  ts: number;
  turnId: string;
  pathname?: string;
  intentPrimary?: string;
  intentKinds?: string[];
  extractedKeys?: string[];
  correctedKeys?: string[];
  pendingBefore?: string | null;
  pendingAfter?: string | null;
  satisfaction?: string;
  consumeAsPending?: boolean;
  guardFailures?: string[];
  domain?: string;
  entityLocked?: boolean;
  conflictingCount?: number;
  /** Truncated — never full message bodies in production logs by default */
  messageLen?: number;
  responseAction?: string;
};

const MAX = 200;
const events: IntelligenceTelemetryEvent[] = [];
let enabled =
  typeof process !== "undefined" &&
  (process.env.NODE_ENV === "development" ||
    process.env.AWHINA_INTELLIGENCE_DEBUG === "1");

export function setIntelligenceTelemetryEnabled(on: boolean): void {
  enabled = on;
}

export function isIntelligenceTelemetryEnabled(): boolean {
  return enabled;
}

export function recordIntelligenceTelemetry(
  e: Omit<IntelligenceTelemetryEvent, "ts"> & { ts?: number }
): void {
  const event: IntelligenceTelemetryEvent = {
    ...e,
    ts: e.ts ?? Date.now(),
    turnId: e.turnId || `t_${Date.now()}`,
  };
  events.push(event);
  if (events.length > MAX) events.shift();

  if (!enabled) return;

  console.log(
    `[awhina-intel] turn=${event.turnId} intent=${event.intentPrimary || "-"} kinds=${(event.intentKinds || []).join("|") || "-"} extracted=${(event.extractedKeys || []).join(",") || "-"} corrections=${(event.correctedKeys || []).join(",") || "-"} pending=${event.pendingBefore || "-"}→${event.pendingAfter || "-"} sat=${event.satisfaction || "-"} consume=${event.consumeAsPending} guards=${(event.guardFailures || []).join(",") || "ok"} domain=${event.domain || "-"} action=${event.responseAction || "-"} msgLen=${event.messageLen ?? "-"}`
  );
}

export function getIntelligenceTelemetry(): IntelligenceTelemetryEvent[] {
  return events.slice();
}

export function clearIntelligenceTelemetry(): void {
  events.length = 0;
}
