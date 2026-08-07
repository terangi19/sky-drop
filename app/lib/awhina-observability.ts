/**
 * Safe Āwhina observability — no message content, credentials, or PII payloads.
 * Tracks usefulness metrics: search completion, clarification rate, listing creation,
 * abandonment signals, AI latency, tool success — not just tokens.
 */

export type AwhinaCapability = "local" | "vision" | "free_form" | "rules" | "unknown";

export type AwhinaQualityKind =
  | "search_completed"
  | "search_clarified"
  | "listing_create_completed"
  | "listing_create_started"
  | "conversation_abandoned"
  | "tool_success"
  | "tool_failure"
  | "education_served"
  | "compare_served";

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
  /** Product-quality signal (no message content) */
  quality?: AwhinaQualityKind;
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
let totalLatencyMs = 0;
let latencySamples = 0;

let searchCompleted = 0;
let searchClarified = 0;
let listingCreateStarted = 0;
let listingCreateCompleted = 0;
let conversationsAbandoned = 0;
let toolSuccesses = 0;
let toolFailures = 0;
let educationServed = 0;
let compareServed = 0;

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
    quality: e.quality,
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
  if (event.latencyMs > 0) {
    totalLatencyMs += event.latencyMs;
    latencySamples++;
  }

  bumpQuality(event);

  // Structured log — never includes user message / image bytes / credentials
  console.log(
    `[awhina-obs] intent=${event.intent} mode=${event.localVsAi} cap=${capability} tool=${event.tool || "-"} ok=${event.success} ms=${event.latencyMs} tokens=${(event.promptTokens || 0) + (event.completionTokens || 0)} clarify=${event.clarification} quality=${event.quality || "-"} degraded=${Boolean(event.degraded)} path=${event.pathname || "-"}`
  );
}

function bumpQuality(event: AwhinaObsEvent): void {
  const q = event.quality;
  if (q === "search_completed") searchCompleted++;
  if (q === "search_clarified") searchClarified++;
  if (q === "listing_create_started") listingCreateStarted++;
  if (q === "listing_create_completed") listingCreateCompleted++;
  if (q === "conversation_abandoned") conversationsAbandoned++;
  if (q === "tool_success") toolSuccesses++;
  if (q === "tool_failure") toolFailures++;
  if (q === "education_served") educationServed++;
  if (q === "compare_served") compareServed++;

  // Infer useful signals from tool/intent when quality not explicit
  if (!q && event.success && event.tool === "searchListings" && !event.clarification) {
    searchCompleted++;
  }
  if (!q && event.clarification && event.intent === "marketplace_search") {
    searchClarified++;
  }
  if (!q && event.success && event.tool === "createListing" && !event.clarification) {
    listingCreateStarted++;
  }
  // Always count tool outcomes when a tool is present (independent of quality tag)
  if (event.tool && q !== "tool_success" && q !== "tool_failure") {
    if (event.success) toolSuccesses++;
    else toolFailures++;
  }
}

/** Infer quality tag for canonical finishes (safe — no content). */
export function inferQualityFromCanonical(opts: {
  intent: string;
  tool?: string;
  clarification: boolean;
  handled: boolean;
}): AwhinaQualityKind | undefined {
  if (!opts.handled) return undefined;
  if (opts.clarification && opts.intent === "marketplace_search") return "search_clarified";
  if (opts.tool === "searchListings" && !opts.clarification) return "search_completed";
  if (opts.tool === "createListing" && !opts.clarification) return "listing_create_started";
  if (opts.intent === "listing_create" && opts.clarification) return undefined;
  if (opts.intent === "education") return "education_served";
  if (opts.intent === "compare") return "compare_served";
  return undefined;
}

export function recordAbandonedConversation(): void {
  recordAwhinaObs({
    intent: "session",
    localVsAi: "local",
    success: true,
    latencyMs: 0,
    clarification: false,
    quality: "conversation_abandoned",
  });
}

export function getAwhinaObsSummary() {
  const total = localHits + aiHits || 1;
  const aiTotal = visionHits + freeFormHits || 1;
  const toolTotal = toolSuccesses + toolFailures || 1;
  const searchStarts = searchCompleted + searchClarified || 1;
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
    avgLatencyMs: latencySamples ? Math.round(totalLatencyMs / latencySamples) : 0,
    // Product usefulness
    searchCompleted,
    searchClarified,
    searchClarificationRate: searchClarified / searchStarts,
    listingCreateStarted,
    listingCreateCompleted,
    conversationsAbandoned,
    toolSuccessRate: toolSuccesses / toolTotal,
    toolSuccesses,
    toolFailures,
    educationServed,
    compareServed,
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
  totalLatencyMs = 0;
  latencySamples = 0;
  searchCompleted = 0;
  searchClarified = 0;
  listingCreateStarted = 0;
  listingCreateCompleted = 0;
  conversationsAbandoned = 0;
  toolSuccesses = 0;
  toolFailures = 0;
  educationServed = 0;
  compareServed = 0;
}
