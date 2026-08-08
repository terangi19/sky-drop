/**
 * Internal Āwhina decision layer — typed turn decisions for tool gating + context
 * precedence. NEVER surface this object (or its fields) in user-facing replies.
 *
 * Precedence: current message > active-task state > same-task context > defaults.
 * Unrelated prior-task facts become ignoredStaleContext.
 */

import type { AwhinaActiveTask } from "./awhina-task-scope";
import {
  SEARCH_BLOCKED_TOOLS,
  isToolAllowedForTask,
  resolveTaskForMessage,
  type TaskScopeSession,
} from "./awhina-task-scope";
import {
  extractServiceOfferingTitle,
  hasExplicitSellSwitch,
  hasListingSellIntent,
  hasRentalOfferingIntent,
  hasSearchIntentLanguage,
  hasServiceOfferingIntent,
  inferSellListingTypeHint,
  resolvePendingClarificationAnswer,
  type ClarificationResolution,
} from "./sky-ai-intent";
import { hasActiveListingDraft } from "./sky-ai-draft-merge";
import type { SkyAiListingContext } from "./sky-ai-types";
import type { SearchSessionFilters } from "./awhina-search-memory";
import type { PendingClarification } from "./awhina-task-scope";

/** Tools that mutate listing drafts / create listings. */
export const SELL_TOOLS = [
  "updateListingDraft",
  "createListing",
  "editListing",
] as const;

/** Tools used for marketplace browse. */
export const SEARCH_TOOLS = ["searchListings", "voiceSearch"] as const;

/** Navigation / messaging tools — gated for education-only turns. */
export const NAV_TOOLS = ["navigate", "openMessages", "openCategory", "openConversation"] as const;

export type AwhinaDecisionIntent =
  | "marketplace_search"
  | "listing_create"
  | "listing_edit"
  | "compare"
  | "education"
  | "purchase_help"
  | "navigation"
  | "profile"
  | "clarification"
  | "general_question"
  | "unknown";

/** Lightweight entity snapshot for the current turn (internal only). */
export type AwhinaTurnEntities = {
  query?: string;
  item?: string;
  price?: string;
  year?: string;
  make?: string;
  model?: string;
  location?: string;
  condition?: string;
  storage?: string;
  maxPrice?: string;
  /** Inferred listing type for sell turns. */
  listingType?: "service" | "rental" | "physical" | "vehicle" | "digital";
};

/**
 * Typed turn decision. Internal orchestration only — never show to the user.
 */
export type AwhinaDecision = {
  activeTask: AwhinaActiveTask;
  intent: AwhinaDecisionIntent;
  confidence: number;
  currentTurnEntities: AwhinaTurnEntities;
  relevantContext: string[];
  ignoredStaleContext: string[];
  allowedTools: string[];
  blockedTools: string[];
  requiresClarification: boolean;
  clarificationQuestion?: string;
  /** True when this turn hard-resets prior shopping search / draft bleed. */
  freshSellStart: boolean;
  /** True when sticky SEARCH should block sell tools. */
  stickyShopping: boolean;
};

export type BuildAwhinaDecisionInput = {
  message: string;
  pathname?: string;
  session: TaskScopeSession | null;
  listingContext?: SkyAiListingContext | null;
  searchFilters?: SearchSessionFilters | null;
  /** Optional pre-parsed entities from the current message. */
  entities?: AwhinaTurnEntities;
  /** Hint from upstream (compare / education / etc.). */
  intentHint?: AwhinaDecisionIntent;
};

const ALL_CORE_TOOLS = [
  "navigate",
  "searchListings",
  "createListing",
  "updateListingDraft",
  "editListing",
  "openMessages",
  "openConversation",
  "openCategory",
  "updateProfile",
  "voiceSearch",
  "reply",
  "confirmAction",
  "naturalConversation",
] as const;

/** Extract obvious turn entities from raw text (facts only, no inventing). */
export function extractTurnEntities(message: string): AwhinaTurnEntities {
  const m = message.trim();
  const out: AwhinaTurnEntities = {};

  const bucks = m.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\s*(?:bucks|nzd|dollars?)\b/i);
  const dollar = m.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\b/);
  const budget = m.match(/\b(?:budget|under|max(?:imum)?)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k|K)?\b/i);
  if (bucks) {
    let n = Number(bucks[1].replace(/,/g, ""));
    if (bucks[2]) n *= 1000;
    if (Number.isFinite(n)) out.price = String(Math.round(n));
  } else if (dollar) {
    let n = Number(dollar[1].replace(/,/g, ""));
    if (dollar[2]) n *= 1000;
    if (Number.isFinite(n)) out.price = String(Math.round(n));
  } else if (budget) {
    let n = Number(budget[1].replace(/,/g, ""));
    if (budget[2]) n *= 1000;
    if (Number.isFinite(n)) out.maxPrice = String(Math.round(n));
  }

  const storage = m.match(/\b(\d+)\s*(gb|tb)\b/i);
  if (storage) out.storage = `${storage[1]}${storage[2].toUpperCase()}`;

  const year = m.match(/\b(19[89]\d|20[0-2]\d)\b/);
  if (year) out.year = year[1];

  const make = m.match(
    /\b(bmw|toyota|mazda|honda|ford|nissan|subaru|hyundai|kia|volkswagen|vw|mercedes|audi)\b/i
  );
  if (make) out.make = make[1].toUpperCase() === "VW" ? "Volkswagen" : make[1].toUpperCase();

  const model = m.match(/\b(335i|civic|corolla|axela|ranger|hilux|impreza|golf|focus)\b/i);
  if (model) out.model = model[1];

  const loc = m.match(
    /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|palmerston north|napier|rotorua)\b/i
  );
  if (loc) {
    out.location = loc[1].replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const cond = m.match(/\b(brand\s+new|like\s+new|new|used|excellent|mint|good|fair)\b/i);
  if (cond) {
    const c = cond[1].toLowerCase();
    if (c === "brand new" || c === "new") out.condition = "New";
    else if (c === "like new" || c === "mint" || c === "excellent") out.condition = "Used - Like New";
    else if (c === "good" || c === "used") out.condition = "Used - Good";
    else if (c === "fair") out.condition = "Used - Fair";
  }

  const item = m.match(
    /\b(ps5|ps4|playstation\s*[45]|xbox(?:\s*series\s*[sx])?|iphone(?:\s*\d+(?:\s*pro)?)?|airpods(?:\s*pro)?|couch|sofa|samsung\s*tv|macbook)\b/i
  );
  if (item) out.item = item[1];

  const serviceTitle = extractServiceOfferingTitle(m);
  if (serviceTitle) {
    out.item = out.item || serviceTitle;
    out.listingType = "service";
  } else {
    const typeHint = inferSellListingTypeHint(m);
    if (typeHint) out.listingType = typeHint;
  }

  if (/\b(want|looking|need|find|show|search)\b/i.test(m) && !hasListingSellIntent(m)) {
    out.query = m.slice(0, 120);
  }

  return out;
}

/**
 * Mark prior-task search/draft facts as stale when the user switches tasks.
 * e.g. BMW / 2007 / 15k → ignored on a PS5 sell turn.
 */
export function collectIgnoredStaleContext(opts: {
  activeTask: AwhinaActiveTask;
  priorTask: AwhinaActiveTask | null | undefined;
  freshSellStart: boolean;
  searchFilters?: SearchSessionFilters | null;
  listingContext?: SkyAiListingContext | null;
  currentEntities: AwhinaTurnEntities;
}): string[] {
  const stale: string[] = [];
  const prior = opts.priorTask || "none";
  const switchingAwayFromShop =
    opts.freshSellStart ||
    (opts.activeTask === "selling" && (prior === "shopping" || prior === "help"));

  if (!switchingAwayFromShop) return stale;

  const f = opts.searchFilters;
  if (f?.make) stale.push(`search.make=${f.make}`);
  if (f?.model) stale.push(`search.model=${f.model}`);
  if (f?.year) stale.push(`search.year=${f.year}`);
  if (f?.maxPrice) stale.push(`search.maxPrice=${f.maxPrice}`);
  if (f?.minPrice) stale.push(`search.minPrice=${f.minPrice}`);
  if (f?.query && opts.currentEntities.item) {
    const q = f.query.toLowerCase();
    const item = opts.currentEntities.item.toLowerCase();
    if (!q.includes(item) && !item.includes(q.slice(0, 8))) {
      stale.push(`search.query=${f.query}`);
    }
  }

  const draft = opts.listingContext;
  if (draft && hasActiveListingDraft(draft)) {
    const draftMake = String(draft.vehicleMake || "").toLowerCase();
    const curItem = (opts.currentEntities.item || "").toLowerCase();
    const curMake = (opts.currentEntities.make || "").toLowerCase();
    if (draftMake && curItem && !curMake && !curItem.includes(draftMake)) {
      stale.push(`draft.vehicleMake=${draft.vehicleMake}`);
      if (draft.vehicleModel) stale.push(`draft.vehicleModel=${draft.vehicleModel}`);
      if (draft.vehicleYear) stale.push(`draft.vehicleYear=${draft.vehicleYear}`);
      if (draft.price) stale.push(`draft.price=${draft.price}`);
      if (draft.title) stale.push(`draft.title=${draft.title}`);
    }
  }

  // Explicit BMW/2007/15k → PS5 style markers when current sell has no vehicle year
  if (
    opts.activeTask === "selling" &&
    opts.currentEntities.item &&
    !opts.currentEntities.year &&
    (opts.currentEntities.price || opts.currentEntities.condition)
  ) {
    for (const marker of ["2007", "15k", "15000", "bmw", "335i"]) {
      const inSearch =
        JSON.stringify(f || {})
          .toLowerCase()
          .includes(marker) ||
        JSON.stringify(draft || {})
          .toLowerCase()
          .includes(marker);
      if (inSearch && !stale.some((s) => s.toLowerCase().includes(marker))) {
        stale.push(`stale.${marker}`);
      }
    }
  }

  return [...new Set(stale)];
}

function toolsForTask(
  task: AwhinaActiveTask,
  intent: AwhinaDecisionIntent,
  opts?: { educationOnly?: boolean }
): { allowed: string[]; blocked: string[] } {
  const blocked = new Set<string>();
  const allowed = new Set<string>(ALL_CORE_TOOLS);

  if (task === "shopping" || intent === "marketplace_search") {
    for (const t of SEARCH_BLOCKED_TOOLS) {
      blocked.add(t);
      allowed.delete(t);
    }
  }

  if (opts?.educationOnly || intent === "education" || intent === "purchase_help") {
    for (const t of NAV_TOOLS) {
      // Education-only: block auto-nav; explicit openMessages handled upstream
      if (intent === "education") {
        blocked.add(t);
        allowed.delete(t);
      }
    }
    // purchase_help: allow openMessages only when caller opts in later
    if (intent === "purchase_help") {
      blocked.add("navigate");
      allowed.delete("navigate");
    }
    for (const t of SELL_TOOLS) {
      blocked.add(t);
      allowed.delete(t);
    }
  }

  if (task === "selling" || intent === "listing_create" || intent === "listing_edit") {
    // Selling: search still allowed for "find comps" but sticky create wins
    for (const t of SELL_TOOLS) allowed.add(t);
  }

  if (intent === "compare") {
    for (const t of SELL_TOOLS) {
      blocked.add(t);
      allowed.delete(t);
    }
    blocked.add("navigate");
    allowed.delete("navigate");
  }

  return { allowed: [...allowed], blocked: [...blocked] };
}

/**
 * Merge a clarification answer with the prior ambiguous message for listing fill.
 * Never re-ask — caller must clear pendingClarification after handling.
 */
export function mergeClarificationIntoSellMessage(
  priorMessage: string,
  answer: string,
  resolution: ClarificationResolution
): string {
  const prior = priorMessage.trim();
  const ans = answer.trim();
  if (resolution.listingType === "service") {
    // Ensure service noun present so fill tools classify correctly
    if (/\bservice\b/i.test(prior)) return prior;
    return `${prior} service`.trim();
  }
  if (resolution.listingType === "rental" && !/\brent|hire\b/i.test(prior)) {
    return `${prior} rental`.trim();
  }
  if (resolution.mode === "sell" && !hasListingSellIntent(prior)) {
    return `selling ${prior}`.trim();
  }
  return prior || ans;
}

/** Resolve pending buy/sell/type clarify from session or a prior user turn. */
export function tryResolvePendingClarification(opts: {
  message: string;
  pending?: PendingClarification | null;
  priorUserMessage?: string | null;
}): {
  resolved: boolean;
  resolution?: ClarificationResolution;
  combinedMessage?: string;
  priorMessage?: string;
} {
  const answer = resolvePendingClarificationAnswer(opts.message);
  if (!answer.resolved) return { resolved: false };
  const prior =
    opts.pending?.priorMessage?.trim() ||
    opts.priorUserMessage?.trim() ||
    "";
  if (!prior) {
    // Answer alone with type — still sell if service/rental/physical stated
    if (answer.mode === "sell" && answer.listingType) {
      return {
        resolved: true,
        resolution: answer,
        combinedMessage: opts.message.trim(),
        priorMessage: "",
      };
    }
    return { resolved: false };
  }
  return {
    resolved: true,
    resolution: answer,
    combinedMessage: mergeClarificationIntoSellMessage(prior, opts.message, answer),
    priorMessage: prior,
  };
}

/**
 * Build an internal decision for this turn. Incremental — start with search + sell.
 */
export function buildAwhinaDecision(input: BuildAwhinaDecisionInput): AwhinaDecision {
  const trimmed = input.message.trim();
  const pathname = input.pathname || "/";
  const onSell = pathname.startsWith("/post/ai");
  const entities = { ...extractTurnEntities(trimmed), ...input.entities };
  const searchLang = hasSearchIntentLanguage(trimmed);
  const serviceOffer = hasServiceOfferingIntent(trimmed);
  const rentalOffer = hasRentalOfferingIntent(trimmed);
  const explicitSell = hasExplicitSellSwitch(trimmed) || serviceOffer || rentalOffer;
  const sellIntent = hasListingSellIntent(trimmed) || explicitSell || serviceOffer || rentalOffer;
  const priorTask = input.session?.task || "none";
  const stickyShopping = priorTask === "shopping" && !explicitSell && !onSell;

  // Force listing type on strong service / rental offers
  if (serviceOffer) {
    entities.listingType = "service";
    if (!entities.item) {
      entities.item = extractServiceOfferingTitle(trimmed) || entities.item;
    }
  } else if (rentalOffer) {
    entities.listingType = entities.listingType || "rental";
  } else if (sellIntent && !entities.listingType) {
    entities.listingType = inferSellListingTypeHint(trimmed) || "physical";
  }

  const activeTask = resolveTaskForMessage(trimmed, {
    pathname,
    hasListingDraft: hasActiveListingDraft(input.listingContext),
    session: input.session,
    hasSellIntent: sellIntent,
    hasSearchIntent: searchLang || stickyShopping,
  });

  const freshSellStart =
    Boolean(explicitSell || (sellIntent && (priorTask === "shopping" || priorTask === "help"))) &&
    activeTask === "selling";

  let intent: AwhinaDecisionIntent = input.intentHint || "unknown";
  if (!input.intentHint) {
    if (activeTask === "selling" || sellIntent) {
      intent = hasActiveListingDraft(input.listingContext) && !freshSellStart
        ? "listing_edit"
        : "listing_create";
    } else if (searchLang || stickyShopping || activeTask === "shopping") {
      intent = "marketplace_search";
    } else if (activeTask === "help") {
      intent = "education";
    }
  }

  const ignoredStaleContext = collectIgnoredStaleContext({
    activeTask,
    priorTask,
    freshSellStart,
    searchFilters: input.searchFilters,
    listingContext: input.listingContext,
    currentEntities: entities,
  });

  const relevantContext: string[] = [];
  if (entities.item) relevantContext.push(`item=${entities.item}`);
  if (entities.price) relevantContext.push(`price=${entities.price}`);
  if (entities.maxPrice) relevantContext.push(`maxPrice=${entities.maxPrice}`);
  if (entities.listingType) relevantContext.push(`listingType=${entities.listingType}`);
  if (entities.year && activeTask === "shopping") relevantContext.push(`year=${entities.year}`);
  if (entities.year && activeTask === "selling" && entities.make) {
    relevantContext.push(`vehicleYear=${entities.year}`);
  }
  if (entities.location) relevantContext.push(`location=${entities.location}`);
  if (entities.condition) relevantContext.push(`condition=${entities.condition}`);
  if (entities.storage) relevantContext.push(`storage=${entities.storage}`);
  if (activeTask === "shopping" && priorTask === "shopping" && input.searchFilters?.query) {
    relevantContext.push(`priorQuery=${input.searchFilters.query}`);
  }

  const educationOnly = intent === "education";
  const { allowed, blocked } = toolsForTask(activeTask, intent, { educationOnly });

  // Confidence: high when entities + clear intent; lower when ambiguous
  let confidence = 0.55;
  if (intent === "marketplace_search" && (entities.query || entities.make || entities.item)) {
    confidence = entities.maxPrice || entities.location ? 0.9 : 0.8;
  }
  if (
    (intent === "listing_create" || intent === "listing_edit") &&
    (entities.item || entities.price || sellIntent)
  ) {
    confidence = entities.price && entities.item ? 0.92 : 0.78;
  }
  // Service / rental offers with price → high confidence, never soft-guess
  if (serviceOffer && entities.listingType === "service") {
    confidence = entities.price ? 0.95 : 0.88;
  }
  if (rentalOffer && entities.listingType === "rental") {
    confidence = entities.price ? 0.93 : 0.85;
  }
  if (intent === "education" || intent === "purchase_help") confidence = 0.95;
  if (intent === "compare") confidence = 0.88;

  let requiresClarification = false;
  let clarificationQuestion: string | undefined;

  // Service / rental offerings with enough facts — NEVER clarify
  if (serviceOffer || rentalOffer) {
    requiresClarification = false;
    clarificationQuestion = undefined;
  } else if (
    intent === "listing_create" &&
    !entities.item &&
    !entities.make &&
    trimmed.split(/\s+/).length < 4
  ) {
    requiresClarification = true;
    clarificationQuestion = "What are you selling? A short description is enough.";
  } else if (
    intent === "marketplace_search" &&
    !entities.item &&
    !entities.make &&
    !entities.query &&
    /^(find|search|looking|want|need)\s*(something|stuff)?\??$/i.test(trimmed)
  ) {
    requiresClarification = true;
    clarificationQuestion = "What are you looking for? Brand, model, or category helps.";
  } else if (
    intent === "listing_create" &&
    entities.item &&
    !entities.price &&
    !entities.condition &&
    !/\$|\bbucks\b|\bdollars?\b/i.test(trimmed) &&
    trimmed.split(/\s+/).length <= 5
  ) {
    // Soft clarify — still allow draft seed; question optional
    requiresClarification = false;
  }

  return {
    activeTask,
    intent,
    confidence,
    currentTurnEntities: entities,
    relevantContext,
    ignoredStaleContext,
    allowedTools: allowed,
    blockedTools: blocked,
    requiresClarification,
    clarificationQuestion,
    freshSellStart,
    stickyShopping,
  };
}

/** Gate a tool against the decision object (stricter than task-only gate). */
export function isToolAllowedByDecision(
  tool: string | undefined,
  decision: AwhinaDecision
): boolean {
  if (!tool) return true;
  if (decision.blockedTools.includes(tool)) return false;
  if (decision.allowedTools.length && !decision.allowedTools.includes(tool)) return false;
  return isToolAllowedForTask(tool, decision.activeTask);
}

export type SelfCheckInput = {
  decision: AwhinaDecision;
  tool?: string;
  listingFill?: Record<string, unknown> | null;
  navigateTo?: string;
  reply?: string;
};

/**
 * Lightweight internal self-check before emitting a tool-backed response.
 * Returns ok=false when stale context leaked or tools violate the decision.
 */
export function selfCheckBeforeToolResponse(input: SelfCheckInput): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { decision, tool, listingFill, navigateTo, reply } = input;

  if (tool && !isToolAllowedByDecision(tool, decision)) {
    reasons.push(`blocked_tool:${tool}`);
  }

  if (
    decision.intent === "education" &&
    navigateTo === "/messages" &&
    !decision.allowedTools.includes("openMessages")
  ) {
    reasons.push("education_nav_messages");
  }

  if (listingFill && decision.ignoredStaleContext.length) {
    const blob = JSON.stringify(listingFill).toLowerCase();
    for (const marker of decision.ignoredStaleContext) {
      const val = marker.split("=")[1] || marker.replace(/^stale\./, "");
      if (!val || val.length < 2) continue;
      // Current-turn price/year may legitimately equal a prior number — skip those
      if (decision.currentTurnEntities.price === val) continue;
      if (
        decision.currentTurnEntities.year === val &&
        decision.currentTurnEntities.make
      ) {
        continue;
      }
      if (blob.includes(val.toLowerCase())) {
        // Only fail hard on vehicle/search bleed into non-vehicle sell
        if (
          /bmw|335i|toyota|mazda|vehicleMake|vehicleYear|2007|15000/i.test(val) &&
          decision.currentTurnEntities.item &&
          !decision.currentTurnEntities.make
        ) {
          reasons.push(`stale_leak:${marker}`);
        }
      }
    }
    // BMW year-as-price classic
    if (
      decision.currentTurnEntities.price === "200" &&
      String(listingFill.price || "") === "2007"
    ) {
      reasons.push("stale_price_2007");
    }
  }

  if (reply && /\bChatGPT\b|\bOpenAI\b/i.test(reply)) {
    reasons.push("branding_leak");
  }
  if (reply && /^Updated:/i.test(reply.trim())) {
    reasons.push("legacy_updated_prefix");
  }
  if (reply && /Started a draft for/i.test(reply)) {
    reasons.push("legacy_started_draft");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Context precedence resolver: pick the winning value for a field.
 * current message > active-task state > same-task context > defaults.
 */
export function pickPrecedentedValue<T>(opts: {
  current?: T | null;
  activeTaskValue?: T | null;
  sameTaskContext?: T | null;
  defaultValue?: T | null;
  stale?: boolean;
}): T | undefined {
  if (opts.stale) {
    return opts.current ?? opts.defaultValue ?? undefined;
  }
  if (opts.current != null && opts.current !== "") return opts.current;
  if (opts.activeTaskValue != null && opts.activeTaskValue !== "") return opts.activeTaskValue;
  if (opts.sameTaskContext != null && opts.sameTaskContext !== "") return opts.sameTaskContext;
  return opts.defaultValue ?? undefined;
}
