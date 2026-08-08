/**
 * Marketplace intent detection for Āwhina (server + evaluation).
 * Loose natural language — users should not need exact commands.
 */

export type SkyAiIntent =
  | "sell_list"
  | "find_buy"
  | "price_value"
  | "edit_listing"
  | "delete_listing"
  | "cancel_draft"
  | "visibility_issue"
  | "message_negotiate"
  | "buy_trouble"
  | "rent_hire"
  | "safety_scam"
  | "navigate_help"
  | "general";

const SELL_RE =
  /\b(i\s*('m|am)?\s*(sell|selling|list|listing|post|create|make|put up|advertise|flog)|want to sell|for sale|selling my|get rid of|clearing out|listing my)\b/i;

const FIND_RE =
  /\b(find(?: me| a| an)?|show me|looking for|search for|want to buy|wanna buy|wanna\s+(?:a|an)\b|want a|want an|i want a|i want an|need a|need an|i need a|i need an|iso\b|in search of|hunting for|where can i (find|get)|anyone selling|under \$?\d)\b/i;

const PRICE_RE =
  /\b(how much|what('s| is) it worth|price check|fair price|good price|value of|should i (ask|charge|list)|worth\??|pricing|appraisal|help me price|price my)\b/i;

const EDIT_RE =
  /\b(edit my listing|update my listing|change my listing|fix my listing|modify listing|edit listing)\b/i;

const DELETE_RE =
  /\b(delete my listing|remove my listing|take down my listing|delist)\b/i;

const CANCEL_DRAFT_RE =
  /\b(never mind|nevermind|forget it|cancel (the )?draft|clear (the )?draft|start over|scratch that|delete the draft)\b/i;

const BUY_TROUBLE_RE =
  /\b(why can'?t i buy|why won'?t it let me buy|can'?t buy this|can'?t purchase|buy button (missing|gone|disabled)|checkout (not working|won'?t work|failed)|won'?t let me checkout)\b/i;

const VISIBILITY_RE =
  /\b(isn'?t showing|not showing|can'?t see my listing|not visible|not appearing|why (is|isn't) my listing|no views|no one sees)\b/i;

const MESSAGE_RE =
  /\b(message (the )?seller|contact seller|make an offer|counter offer|negotiate|offer \$)\b/i;

const RENT_RE =
  /\b(rent|rental|hire|weekly rent|per week|bond|flat for rent|room for rent)\b/i;

const SCAM_RE =
  /\b(scam|sketchy|suspicious|is this (safe|legit)|trust|too good to be true|report)\b/i;

const NAV_RE =
  /\b(take me|go to|open|show me where|navigate|how do i (get to|find)|where is)\b/i;

const VEHICLE_BRANDS =
  /\b(toyota|honda|mazda|ford|holden|nissan|subaru|mitsubishi|hyundai|kia|bmw|mercedes|audi|volkswagen|vw|jeep|tesla|lexus|suzuki|isuzu)\b/i;

const ITEM_SIGNALS =
  /\b(ps5|playstation|xbox|iphone|samsung|laptop|macbook|tv|couch|bike|puppy|pokemon)\b/i;

const STRUCTURED_LISTING =
  /(?:^|\n)(title|price|description|location|condition|category|make|model|year|odometer|colour|color)\s*:/i;

/** Year + known vehicle make only — never year + arbitrary word ("2007 budget"). */
const YEAR_MAKE =
  /\b(19|20)\d{2}\s+(toyota|honda|mazda|ford|holden|nissan|subaru|mitsubishi|hyundai|kia|bmw|mercedes|benz|audi|volkswagen|vw|jeep|tesla|lexus|suzuki|isuzu|peugeot|renault|volvo)\b/i;

const PRICE_DOLLAR = /\$[\d,]+/;

const KM_READING = /\b\d{2,3}[\s,]?\d{3}\s*km\b/i;

const BUY_NOT_SELL =
  /\b(find me|show me|looking for|search for|want to buy|wanna buy|wanna\s+(?:a|an)\b|want a|want an|i want a|i want an|need a|need an|i need a|i need an|iso\b|in search of|hunting for|anyone selling|budget\s*\$?[\d,]+|max(?:imum)?\s*price|under\s*\$?\d)\b/i;

/** Explicit sell / list language — required to leave sticky SEARCH. */
export function hasExplicitSellSwitch(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (BUY_NOT_SELL.test(m) || FIND_RE.test(m)) return false;
  return /\b(sell(?:ing)?|list(?:ing)?|post(?:ing)?|for sale|create (?:a )?listing|put up|advertise|get rid of|flog)\b/i.test(
    m
  );
}

/**
 * Explicit NEW listing seed — start a fresh draft (do not merge prior draft/search).
 * Follow-ups like "actually make it $250" must NOT match.
 */
export function isExplicitNewSellListingMessage(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (BUY_NOT_SELL.test(m) || FIND_RE.test(m)) return false;
  return /\b(want\s+to\s+list|sell(?:ing)?\s+my|create\s+(?:a\s+)?listing|list(?:ing)?\s+my|post(?:ing)?\s+my)\b/i.test(
    m
  );
}

/** True when message is buy/search language (not sell). */
export function hasSearchIntentLanguage(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  return FIND_RE.test(m) || BUY_NOT_SELL.test(m);
}

/** True when user message should trigger LISTING_FILL (sell flow). */
export function hasListingSellIntent(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (BUY_NOT_SELL.test(m) || FIND_RE.test(m)) return false;
  if (STRUCTURED_LISTING.test(m)) return true;
  // Year+make listing paste (e.g. "2015 Mazda Axela … $11500") — never "2007 budget"
  if (
    YEAR_MAKE.test(m) &&
    !/\b(budget|looking for|want a|need a|find |search )\b/i.test(m)
  ) {
    return true;
  }
  if (KM_READING.test(m) && (SELL_RE.test(m) || PRICE_DOLLAR.test(m) || VEHICLE_BRANDS.test(m))) {
    return true;
  }
  if (SELL_RE.test(m) && (PRICE_DOLLAR.test(m) || VEHICLE_BRANDS.test(m) || ITEM_SIGNALS.test(m))) {
    return true;
  }
  if (SELL_RE.test(m)) return true;
  if (/\b(for sale|sell my|selling my|list my|post my)\b/i.test(m)) return true;
  if (/\b(only have|just have|one photo|one picture)\b/i.test(m) && /\b(sell|listing|couch|phone|car|item)\b/i.test(m)) {
    return true;
  }
  if (/\b(don'?t know what category|what category|which category)\b/i.test(m) && /\b(sell|list|it'?s a|its a)\b/i.test(m)) {
    return true;
  }
  if (PRICE_DOLLAR.test(m) && (VEHICLE_BRANDS.test(m) || ITEM_SIGNALS.test(m) || KM_READING.test(m))) {
    return true;
  }
  if (/\b(lawn|mow|clean|handyman|tutor|template|ebook|canva|notion)\b/i.test(m) && SELL_RE.test(m)) {
    return true;
  }
  if (/\b(rental|vehicle|service|digital)\s+listing\b/i.test(m)) return true;
  if ((m.match(/(?:^|\n)\s*\w+\s*:/g) || []).length >= 2) return true;
  return false;
}

export function detectSkyAiIntent(message: string): SkyAiIntent {
  const m = message.trim();
  if (!m) return "general";
  if (VISIBILITY_RE.test(m)) return "visibility_issue";
  if (CANCEL_DRAFT_RE.test(m)) return "cancel_draft";
  if (DELETE_RE.test(m)) return "delete_listing";
  if (EDIT_RE.test(m)) return "edit_listing";
  if (SCAM_RE.test(m)) return "safety_scam";
  if (BUY_TROUBLE_RE.test(m)) return "buy_trouble";
  if (FIND_RE.test(m)) return "find_buy";
  if (PRICE_RE.test(m)) return "price_value";
  if (hasListingSellIntent(m)) return "sell_list";
  if (MESSAGE_RE.test(m)) return "message_negotiate";
  if (RENT_RE.test(m)) return "rent_hire";
  if (NAV_RE.test(m)) return "navigate_help";
  return "general";
}

/** Advice questions should not short-circuit to navigation. */
export function isSkyAiAdviceQuestion(message: string): boolean {
  return /\b(should i|which (sale type|one|option)|what.s (best|better|faster)|how much should|is it (safe|worth)|recommend|suggestion)\b/i.test(
    message
  );
}

const DRAFT_CONTEXT_RE =
  /\b(LISTING_FILL|draft|listing|sell|vehicle|bmw|iphone|couch|mazda|price|colour|color|km)\b/i;

/** Intent for a turn in an ongoing chat (short replies, topic switches). */
export function detectSkyAiConversationIntent(
  message: string,
  context?: { priorAssistant?: string; priorUserMessage?: string; pathname?: string }
): SkyAiIntent {
  const base = detectSkyAiIntent(message);
  const m = message.trim();
  const inDraftFlow =
    context?.pathname === "/post/ai" ||
    (context?.priorAssistant && DRAFT_CONTEXT_RE.test(context.priorAssistant));

  const inPriceFlow = Boolean(
    context?.priorAssistant && /price|worth|how much|help me price/i.test(context.priorAssistant)
  );

  const inFindFlow = Boolean(
    (context?.priorAssistant &&
      /find|search|looking for|opening.*listings|ps5|mower|\bunder\s*\$?\d/i.test(context.priorAssistant)) ||
      (context?.priorUserMessage &&
        /\b(find|show me|looking for|search for|want to buy|iso)\b/i.test(context.priorUserMessage))
  );

  if (inFindFlow) {
    if (PRICE_DOLLAR.test(m) || /\bunder \$?\d/i.test(m) || /\bin (auckland|wellington|christchurch|hamilton)\b/i.test(m)) {
      return "find_buy";
    }
  }

  if (inPriceFlow) {
    if (ITEM_SIGNALS.test(m) || VEHICLE_BRANDS.test(m) || /\b(good|excellent|fair|used|new)\s+condition\b/i.test(m)) {
      return "price_value";
    }
  }

  if (inDraftFlow && !inPriceFlow && RENT_RE.test(m) && /\b(instead|changed my mind|switch|actually)\b/i.test(m)) {
    return "rent_hire";
  }

  if (inDraftFlow && !inPriceFlow && base === "general") {
    if (/^(it'?s|its|make it|change to|update to)\s+/i.test(m)) return "sell_list";
    if (/^\d{4}\s+\w/i.test(m) || KM_READING.test(m) || PRICE_DOLLAR.test(m)) return "sell_list";
    if (/^(grey|gray|blue|red|black|white|silver|green|manual|automatic)\b/i.test(m)) return "sell_list";
    if (VEHICLE_BRANDS.test(m) || ITEM_SIGNALS.test(m)) return "sell_list";
  }

  return base;
}

const TASK_INTENTS = new Set<SkyAiIntent>([
  "sell_list",
  "find_buy",
  "price_value",
  "visibility_issue",
  "buy_trouble",
  "cancel_draft",
  "rent_hire",
  "message_negotiate",
  "edit_listing",
  "delete_listing",
]);

/** Bypass navigation shortcuts — user needs AI task completion, not rule-based nav. */
export function shouldBypassNavigationShortcut(message: string): boolean {
  const intent = detectSkyAiIntent(message);
  return TASK_INTENTS.has(intent) || hasListingSellIntent(message);
}

/** Per-message system injection so the model picks the right completion path. */
export function getSkyAiIntentHint(
  message: string,
  pathname?: string,
  priorAssistant?: string
): string {
  const intent = detectSkyAiConversationIntent(message, { pathname, priorAssistant });
  switch (intent) {
    case "find_buy":
      return `[INTENT: FIND/BUY] User wants to search or browse — NOT sell. Do NOT output LISTING_FILL or a wanted listing. Car parts/accessories (spoiler, rims, turbo, etc.) → Physical Items via /search?q=... — NEVER /vehicles. Whole vehicles (335i, Hilux, etc.) → /search?q=... or /vehicles. If uncertain, /search?q=... on all listings. End with one actionable next step.`;
    case "sell_list":
      return `[INTENT: SELL] Output [[LISTING_FILL]]{...}[[/LISTING_FILL]] immediately — never prose-only drafts. Infer NZ defaults from typos (blu, k, auck). End with photos + Publish.`;
    case "price_value":
      return `[INTENT: PRICE] Use Quick sale / Fair market / Optimistic / Confidence (NZD). Offer to set price in listing if on /post/ai.`;
    case "visibility_issue":
      return `[INTENT: VISIBILITY] Checklist: email verified, Active in My Listings, not sold/expired, limits. One fix step + [[NAV:/list-list]]. Do not navigate away without answering.`;
    case "buy_trouble":
      return `[INTENT: BUY BLOCKED] Cover: own listing, sold, Contact Seller only, not signed in, payment issue. One fix + ask which button they see.`;
    case "cancel_draft":
      return `[INTENT: CANCEL DRAFT] Tell them to refresh /post/ai or clear fields. One offer only: "Want to list something else?" — never ask what item or request details.`;
    case "rent_hire":
      return `[INTENT: RENT] Switch to rental LISTING_FILL if selling; include weekly rent/bond when inferring property.`;
    case "message_negotiate":
      return `[INTENT: MESSAGE/OFFER] [[NAV:/messages]] or explain Message Seller / Make Offer on listing page.`;
    default:
      return "";
  }
}
