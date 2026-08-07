/**
 * Safe Āwhina observability — no message content, credentials, or PII payloads.
 * Tracks local vs AI %, vision vs free-form, latency, tokens, failures, clarifications.
 */

export type AwhinaCapability = "local" | "vision" | "free_form" | "rules" | "unknown";

export type AwhinaObsEvent = {
  ts: number;
  intent: string;
  localVsAi: "local" | "rules" | "ai";
  capability?: AwhinaCapability;
  tool?: string;
  success: boolean;
  latencyMs: number;
  clarification: boolean;
  pathname?: string;
  source?: string;
  aiFail?: boolean;
  degraded?: boolean;
  promptTokens?: number;
  completionTokens?: number;
  imageCount?: number;
  stateChanging?: boolean;
};

const MAX = 500;
const events: AwhinaObsEvent[] = [];
let localHits = 0;
let aiHits = 0;
let visionHits = 0;
let freeFormHits = 0;
let clarifications = 0;
let fails = 0;
let totalPromptTokens = 0;
let totalCompletionTokens = 0;
let totalAiLatencyMs = 0;
let aiLatencySamples = 0;

export function recordAwhinaObs(
  e: Omit<AwhinaObsEvent, "ts"> & { ts?: number }
): void {
  const capability: AwhinaCapability =
    e.capability ||
    (e.localVsAi === "ai"
      ? e.intent === "vision"
        ? "vision"
        : "free_form"
      : e.localVsAi === "rules"
        ? "rules"
        : "local");

  const event: AwhinaObsEvent = {
    ts: e.ts ?? Date.now(),
    intent: e.intent || "unknown",
    localVsAi: e.localVsAi,
    capability,
    tool: e.tool,
    success: e.success,
    latencyMs: e.latencyMs,
    clarification: e.clarification,
    pathname: e.pathname ? e.pathname.slice(0, 64) : undefined,
    source: e.source,
    aiFail: e.aiFail,
    degraded: e.degraded,
    promptTokens: e.promptTokens,
    completionTokens: e.completionTokens,
    imageCount: e.imageCount,
    stateChanging: e.stateChanging,
  };

  events.push(event);
  if (events.length > MAX) events.shift();

  if (event.localVsAi === "local" || event.localVsAi === "rules") localHits++;
  else aiHits++;

  if (capability === "vision") visionHits++;
  if (capability === "free_form") freeFormHits++;
  if (event.clarification) clarifications++;
  if (event.aiFail || !event.success) fails++;

  if (typeof event.promptTokens === "number") totalPromptTokens += event.promptTokens;
  if (typeof event.completionTokens === "number") {
    totalCompletionTokens += event.completionTokens;
  }
  if (event.localVsAi === "ai" && event.latencyMs > 0) {
    totalAiLatencyMs += event.latencyMs;
    aiLatencySamples++;
  }

  // Structured log — never includes user message / image bytes / credentials
  console.log(
    `[awhina-obs] intent=${event.intent} mode=${event.localVsAi} cap=${capability} tool=${event.tool || "-"} ok=${event.success} ms=${event.latencyMs} tokens=${(event.promptTokens || 0) + (event.completionTokens || 0)} clarify=${event.clarification} degraded=${Boolean(event.degraded)} path=${event.pathname || "-"}`
  );
}

export function getAwhinaObsSummary() {
  const total = localHits + aiHits || 1;
  const aiTotal = visionHits + freeFormHits || 1;
  return {
    totalEvents: events.length,
    localOrRulesHits: localHits,
    aiHits,
    visionHits,
    freeFormHits,
    localAvoidanceRate: localHits / total,
    openaiHitRate: aiHits / total,
    visionShareOfAi: visionHits / aiTotal,
    freeFormShareOfAi: freeFormHits / aiTotal,
    clarificationRate: clarifications / total,
    failRate: fails / total,
    totalPromptTokens,
    totalCompletionTokens,
    avgAiLatencyMs: aiLatencySamples ? Math.round(totalAiLatencyMs / aiLatencySamples) : 0,
  };
}

export function getRecentAwhinaObs(limit = 50): AwhinaObsEvent[] {
  return events.slice(-limit);
}

/** Test helper */
export function resetAwhinaObsForTests(): void {
  events.length = 0;
  localHits = 0;
  aiHits = 0;
  visionHits = 0;
  freeFormHits = 0;
  clarifications = 0;
  fails = 0;
  totalPromptTokens = 0;
  totalCompletionTokens = 0;
  totalAiLatencyMs = 0;
  aiLatencySamples = 0;
}
