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
  isExplicitNewSellListingMessage,
  resolvePendingClarificationAnswer,
  type ClarificationResolution,
} from "./sky-ai-intent";
import { normalizedAwhinaText } from "./awhina-input-normalize";
import { hasActiveListingDraft } from "./sky-ai-draft-merge";
import type { SkyAiListingContext } from "./sky-ai-types";
import type { SearchSessionFilters } from "./awhina-search-memory";
import type { PendingClarification } from "./awhina-task-scope";
import { resolveVehicleIdentity } from "./sky-ai-find-routing";
import { knowledgeTurnPatch, marketplaceClarifyQuestion } from "./marketplace-knowledge";
import { isListPublishActionMessage } from "./awhina-active-draft-commands";

/** Values from the current turn that are allowed to appear in outputs. */
function currentTurnValueSet(entities: AwhinaTurnEntities): Set<string> {
  const allowed = new Set<string>();
  const add = (v: string | undefined | null) => {
    if (v == null || !String(v).trim()) return;
    const s = String(v).trim().toLowerCase();
    allowed.add(s);
    allowed.add(s.replace(/\s+/g, ""));
  };
  add(entities.query);
  add(entities.item);
  add(entities.price);
  add(entities.year);
  add(entities.make);
  add(entities.model);
  add(entities.location);
  add(entities.condition);
  add(entities.storage);
  add(entities.maxPrice);
  add(entities.listingType);
  return allowed;
}

/** True when a prior value is already justified by the current turn. */
function isRelevantToCurrentTurn(
  value: string,
  entities: AwhinaTurnEntities,
  currentBlob: string
): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v.length < 2) return true;
  const allowed = currentTurnValueSet(entities);
  if (allowed.has(v) || allowed.has(v.replace(/\s+/g, ""))) return true;
  if (currentBlob.includes(v)) return true;
  if (entities.item) {
    const item = entities.item.toLowerCase();
    if (v.includes(item) || item.includes(v.slice(0, Math.min(8, v.length)))) return true;
  }
  return false;
}

function pushStaleEntity(
  stale: string[],
  label: string,
  value: string | number | undefined | null,
  entities: AwhinaTurnEntities,
  currentBlob: string
): void {
  if (value == null || value === "") return;
  const raw = String(value).trim();
  if (raw.length < 2) return;
  if (isRelevantToCurrentTurn(raw, entities, currentBlob)) return;
  const marker = `${label}=${raw}`;
  if (!stale.includes(marker)) stale.push(marker);
}

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
  const m = normalizedAwhinaText(message);
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

  const model = m.match(
    /\b(335i|330i|320i|320d|328i|340i|m3|m4|civic|corolla|axela|ranger|hilux|impreza|golf|focus|skyline|supra|rx[\s-]?[78]|mustang|navara|commodore|triton)\b/i
  );
  if (model) out.model = model[1];

  // High-confidence aliases: "skyline r34" / "supra" → make + canonical model
  const vehicle = resolveVehicleIdentity(m);
  if (vehicle.confidence === "high" || vehicle.confidence === "medium") {
    if (vehicle.make && !out.make) out.make = vehicle.make;
    if (vehicle.model) out.model = vehicle.model;
    if (vehicle.year && !out.year) out.year = vehicle.year;
  }

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
    out.item = serviceTitle;
    out.listingType = "service";
  } else {
    const typeHint = inferSellListingTypeHint(m);
    if (typeHint) out.listingType = typeHint;
  }

  // Marketplace knowledge — after USER/regex facts; only fills empty slots.
  // Never override service/rental offer titles or bleed sticky domain context into offers.
  const skipMk =
    out.listingType === "service" ||
    out.listingType === "rental" ||
    hasServiceOfferingIntent(m) ||
    hasRentalOfferingIntent(m);
  const mk = skipMk ? null : knowledgeTurnPatch(m);
  if (mk && (mk.confidence === "high" || mk.confidence === "medium")) {
    if (!out.item && mk.item) out.item = mk.item;
    if (!out.listingType && mk.listingType) out.listingType = mk.listingType;
    if (!out.make && mk.make) out.make = mk.make;
    if (!out.model && mk.model) out.model = mk.model;
    if (!out.year && mk.year) out.year = mk.year;
    if (!out.storage && mk.storage) out.storage = mk.storage;
  }

  if (/\b(want|looking|need|find|show|search)\b/i.test(m) && !hasListingSellIntent(m)) {
    out.query = (mk?.queryHint || m).slice(0, 120);
  }

  return out;
}

/**
 * Mark prior-task search/draft facts as stale when the user switches tasks or
 * listing domains. Generic: any prior entity not present/relevant in the
 * current turn is ignored (product names, prices, years, storage, rental
 * periods, service pricing, locations, conditions).
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
  const cur = opts.currentEntities;
  const currentBlob = Object.values(cur)
    .filter((v) => v != null && String(v).trim())
    .join(" ")
    .toLowerCase();

  const draft = opts.listingContext;
  const draftType = String(draft?.listingType || "").toLowerCase();
  const curType = (cur.listingType || "").toLowerCase();
  const typeMismatch =
    Boolean(draftType && curType && draftType !== curType) &&
    opts.activeTask === "selling";

  const switchingAwayFromShop =
    opts.freshSellStart ||
    (opts.activeTask === "selling" && (prior === "shopping" || prior === "help"));
  const switchingAwayFromSell =
    opts.activeTask === "shopping" && prior === "selling";
  const sellDomainShift =
    opts.activeTask === "selling" &&
    (opts.freshSellStart || typeMismatch) &&
    (prior === "selling" || prior === "shopping" || prior === "help" || prior === "none");

  if (!switchingAwayFromShop && !switchingAwayFromSell && !sellDomainShift && !opts.freshSellStart) {
    return stale;
  }

  const f = opts.searchFilters;
  if (switchingAwayFromShop || opts.freshSellStart || (switchingAwayFromSell && f)) {
    pushStaleEntity(stale, "search.make", f?.make, cur, currentBlob);
    pushStaleEntity(stale, "search.model", f?.model, cur, currentBlob);
    pushStaleEntity(stale, "search.year", f?.year, cur, currentBlob);
    pushStaleEntity(stale, "search.maxPrice", f?.maxPrice, cur, currentBlob);
    pushStaleEntity(stale, "search.minPrice", f?.minPrice, cur, currentBlob);
    pushStaleEntity(stale, "search.location", f?.location, cur, currentBlob);
    pushStaleEntity(stale, "search.query", f?.query, cur, currentBlob);
    pushStaleEntity(stale, "search.condition", f?.condition, cur, currentBlob);
  }

  if (draft && hasActiveListingDraft(draft) && (switchingAwayFromShop || switchingAwayFromSell || sellDomainShift || opts.freshSellStart)) {
    pushStaleEntity(stale, "draft.title", draft.title, cur, currentBlob);
    pushStaleEntity(stale, "draft.price", draft.price, cur, currentBlob);
    pushStaleEntity(stale, "draft.location", draft.location, cur, currentBlob);
    pushStaleEntity(stale, "draft.condition", draft.condition, cur, currentBlob);
    pushStaleEntity(stale, "draft.listingType", draft.listingType, cur, currentBlob);
    pushStaleEntity(stale, "draft.vehicleMake", draft.vehicleMake, cur, currentBlob);
    pushStaleEntity(stale, "draft.vehicleModel", draft.vehicleModel, cur, currentBlob);
    pushStaleEntity(stale, "draft.vehicleYear", draft.vehicleYear, cur, currentBlob);
    pushStaleEntity(stale, "draft.category", draft.category, cur, currentBlob);
    pushStaleEntity(stale, "draft.rentalSubType", draft.rentalSubType, cur, currentBlob);
    pushStaleEntity(stale, "draft.rentalPriceWeekly", draft.rentalPriceWeekly, cur, currentBlob);
    pushStaleEntity(stale, "draft.rentalPriceMonthly", draft.rentalPriceMonthly, cur, currentBlob);
    pushStaleEntity(stale, "draft.serviceDuration", draft.serviceDuration, cur, currentBlob);
    // Rental period / service pricing semantics from description
    const desc = String(draft.description || "");
    for (const period of desc.match(/\b(?:\/\s*day|per\s*day|daily|weekly|hourly|\/\s*hr|per\s*hour)\b/gi) || []) {
      pushStaleEntity(stale, "draft.rentalPeriod", period, cur, currentBlob);
    }
    // Storage sizes in prior draft title/description (e.g. 128GB)
    for (const storage of `${draft.title || ""} ${desc}`.match(/\b\d+\s*(?:gb|tb)\b/gi) || []) {
      pushStaleEntity(stale, "draft.storage", storage.replace(/\s+/g, ""), cur, currentBlob);
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
  const explicitSell =
    (hasExplicitSellSwitch(trimmed) || serviceOffer || rentalOffer) &&
    !isListPublishActionMessage(trimmed);
  const sellIntent =
    (hasListingSellIntent(trimmed) || explicitSell || serviceOffer || rentalOffer) &&
    !isListPublishActionMessage(trimmed);
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
  } else if (sellIntent) {
    const hint = inferSellListingTypeHint(trimmed);
    if (hint) entities.listingType = hint;
    else if (!entities.listingType) entities.listingType = "physical";
    // Sell + vehicle make/model must never stay soft-physical (BMW 320i, etc.)
    if (
      entities.listingType !== "service" &&
      entities.listingType !== "rental" &&
      (hint === "vehicle" || entities.make || entities.model)
    ) {
      entities.listingType = "vehicle";
    }
  }

  const activeTask = resolveTaskForMessage(trimmed, {
    pathname,
    hasListingDraft: hasActiveListingDraft(input.listingContext),
    session: input.session,
    hasSellIntent: sellIntent,
    hasSearchIntent: searchLang || stickyShopping,
  });

  const priorDraftType = String(input.listingContext?.listingType || "").toLowerCase();
  const domainShiftSell =
    activeTask === "selling" &&
    priorTask === "selling" &&
    !isListPublishActionMessage(trimmed) &&
    Boolean(entities.listingType) &&
    Boolean(priorDraftType) &&
    entities.listingType !== priorDraftType;
  const freshSellStart =
    activeTask === "selling" &&
    Boolean(
      ((explicitSell || sellIntent) && (priorTask === "shopping" || priorTask === "help")) ||
        (isExplicitNewSellListingMessage(trimmed) && priorTask === "selling") ||
        domainShiftSell
    );

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
    !entities.model &&
    trimmed.split(/\s+/).length < 4
  ) {
    requiresClarification = true;
    clarificationQuestion =
      marketplaceClarifyQuestion(trimmed) ||
      "What are you selling? A short description is enough.";
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
  /** Profile mutation payload — must not carry unrelated prior-task entities. */
  profileFill?: Record<string, unknown> | null;
  /** Raw tool arguments (search filters, draft updates, etc.). */
  toolArgs?: unknown;
};

function staleMarkerValue(marker: string): string {
  const eq = marker.indexOf("=");
  if (eq >= 0) return marker.slice(eq + 1).trim();
  return marker.replace(/^(stale|search|draft)\./i, "").trim();
}

function blobHasStaleToken(blob: string, token: string): boolean {
  const v = token.toLowerCase();
  if (!v || v.length < 2) return false;
  if (/^\d+$/.test(v)) {
    return new RegExp(`(^|[^\\d])${v}([^\\d]|$)`).test(blob);
  }
  if (/^\d+(gb|tb)$/i.test(v)) {
    return blob.includes(v) || blob.includes(v.replace(/(gb|tb)$/i, " $1"));
  }
  return blob.includes(v);
}

/**
 * Lightweight internal self-check before emitting a tool-backed response.
 * Returns ok=false when stale context leaked or tools violate the decision.
 * Checks listingFill, search/nav, profile changes, tool args, and reply copy.
 */
export function selfCheckBeforeToolResponse(input: SelfCheckInput): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { decision, tool, listingFill, navigateTo, reply, profileFill, toolArgs } = input;

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

  if (decision.ignoredStaleContext.length) {
    const surfaces: Array<{ name: string; blob: string }> = [];
    if (listingFill) surfaces.push({ name: "listingFill", blob: JSON.stringify(listingFill).toLowerCase() });
    if (navigateTo) surfaces.push({ name: "navigate", blob: navigateTo.toLowerCase() });
    if (reply) surfaces.push({ name: "reply", blob: reply.toLowerCase() });
    if (profileFill) surfaces.push({ name: "profile", blob: JSON.stringify(profileFill).toLowerCase() });
    if (toolArgs != null) surfaces.push({ name: "toolArgs", blob: JSON.stringify(toolArgs).toLowerCase() });

    const allowed = currentTurnValueSet(decision.currentTurnEntities);
    for (const marker of decision.ignoredStaleContext) {
      const val = staleMarkerValue(marker);
      if (!val || val.length < 2) continue;
      const lower = val.toLowerCase();
      if (allowed.has(lower) || allowed.has(lower.replace(/\s+/g, ""))) continue;
      if (decision.currentTurnEntities.price === val) continue;
      if (
        decision.currentTurnEntities.year === val &&
        (decision.currentTurnEntities.make || decision.activeTask === "shopping")
      ) {
        continue;
      }
      for (const surface of surfaces) {
        if (!blobHasStaleToken(surface.blob, val)) continue;
        // Skip ultra-short fragments that commonly appear in unrelated words
        if (val.length < 3 && !/^\d+$/.test(val)) continue;
        reasons.push(`stale_leak:${surface.name}:${marker}`);
        break;
      }
    }

    // Prior year used as listing price while current turn has a different price
    if (
      listingFill &&
      decision.currentTurnEntities.price &&
      String(listingFill.price || "") !== decision.currentTurnEntities.price
    ) {
      const fillPrice = String(listingFill.price || "");
      const yearStale = decision.ignoredStaleContext.some((m) => {
        const v = staleMarkerValue(m);
        return v === fillPrice && /^20[0-2]\d|19[89]\d$/.test(v);
      });
      if (yearStale) reasons.push("stale_price_as_year");
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

  // Field-level: never emit fill that asks about already-known draft facts in reply
  if (reply && listingFill) {
    const knownAsks: Array<[string, RegExp]> = [
      ["price", /what(?:'s| is) the (?:asking )?price/i],
      ["vehicleYear", /what year/i],
      ["condition", /what condition/i],
      ["location", /where (?:is it|are you)|located\?/i],
    ];
    for (const [key, re] of knownAsks) {
      const val = listingFill[key];
      if (typeof val === "string" && val.trim() && re.test(reply)) {
        reasons.push(`ask_known:${key}`);
      }
    }
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
