/**
 * Safe Āwhina observability — no message content, credentials, or PII payloads.
 */

export type AwhinaObsEvent = {
  ts: number;
  intent: string;
  localVsAi: "local" | "rules" | "ai";
  tool?: string;
  success: boolean;
  latencyMs: number;
  clarification: boolean;
  pathname?: string;
  source?: string;
  aiFail?: boolean;
};

const MAX = 500;
const events: AwhinaObsEvent[] = [];
let localHits = 0;
let aiHits = 0;
let clarifications = 0;
let fails = 0;

export function recordAwhinaObs(
  e: Omit<AwhinaObsEvent, "ts"> & { ts?: number }
): void {
  const event: AwhinaObsEvent = {
    ts: e.ts ?? Date.now(),
    intent: e.intent || "unknown",
    localVsAi: e.localVsAi,
    tool: e.tool,
    success: e.success,
    latencyMs: e.latencyMs,
    clarification: e.clarification,
    pathname: e.pathname ? e.pathname.slice(0, 64) : undefined,
    source: e.source,
    aiFail: e.aiFail,
  };

  events.push(event);
  if (events.length > MAX) events.shift();

  if (event.localVsAi === "local" || event.localVsAi === "rules") localHits++;
  else aiHits++;
  if (event.clarification) clarifications++;
  if (event.aiFail || !event.success) fails++;

  // Structured log — never includes user message / tokens / credentials
  console.log(
    `[awhina-obs] intent=${event.intent} mode=${event.localVsAi} tool=${event.tool || "-"} ok=${event.success} ms=${event.latencyMs} clarify=${event.clarification} path=${event.pathname || "-"}`
  );
}

export function getAwhinaObsSummary() {
  const total = localHits + aiHits || 1;
  return {
    totalEvents: events.length,
    localOrRulesHits: localHits,
    aiHits,
    localAvoidanceRate: localHits / total,
    clarificationRate: clarifications / total,
    failRate: fails / total,
  };
}

export function getRecentAwhinaObs(limit = 50): AwhinaObsEvent[] {
  return events.slice(-limit);
}
