/**
 * Authoritative REPLACE vs PATCH policy for listing drafts.
 * Every sell pathway must use this — never ad-hoc merge/reset forks.
 */

import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { hasActiveListingDraft } from "./sky-ai-draft-merge";
import {
  hasActiveDraftCommandLanguage,
  isListPublishActionMessage,
} from "./awhina-active-draft-commands";
import {
  hasListingSellIntent,
  hasWantedListingIntent,
  isExplicitNewSellListingMessage,
} from "./sky-ai-intent";
import { normalizedAwhinaText } from "./awhina-input-normalize";
import { getActiveListingSlot } from "./awhina-pending-slots";
import type { PendingClarification } from "./awhina-task-scope";
import {
  isIdentityRichListingPaste,
  listingIdentitiesConflict,
} from "./awhina-listing-identity-conflict";

export type DraftTransitionMode = "REPLACE" | "PATCH";

export type DraftTransition = {
  mode: DraftTransitionMode;
  /** Client must wipe form + sessionStorage before applying fill */
  replaceDraft: boolean;
  /** Server must ignore prior draft base when building fill */
  freshStart: boolean;
  reason: string;
};

const PRICE_DOLLAR_RE = /\$\s*[\d,]+(?:\.\d{1,2})?|\b[\d,]+\s*(?:nzd|dollars?)\b/i;
const YEAR_MAKE_RE =
  /\b(19|20)\d{2}\s+(?:toyota|honda|nissan|mazda|ford|bmw|mercedes|holden|hyundai|kia|subaru|mitsubishi|lexus|audi|volkswagen|vw|isuzu|suzuki|volvo|land rover|range rover|jeep|chevrolet|chevy|dodge|ram|tesla|porsche|mini|jaguar|ferrari|lamborghini|mclaren|aston|bentley|rolls|harley|ducati|yamaha|ktm|triumph|skoda|seat|peugeot|renault|citroen|fiat|alfa|great wall|gwm|haval|ldv|ssangyong|mahindra|mg\b)/i;
const KM_READING_RE = /\b[\d,]+\s*(?:km|kms|kilomet(?:er|re)s?)\b/i;

function tokens(text: string): Set<string> {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !/^(the|and|for|with|my|sell|list|listing|want|to|a|an|in|at|on|is|it|its|has|have|no|not|new|used|good|fair|like|also|now|actually|change|make|set|update|located|condition|automatic|manual|diesel|petrol|hybrid|electric|black|white|silver|grey|gray|blue|red|green|auckland|wellington|christchurch|hamilton|tauranga|dunedin)$/.test(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / new Set([...a, ...b]).size;
}

function priorIdentityBlob(
  prior: SkyAiListingContext | SkyAiListingFill | null | undefined
): string {
  if (!prior) return "";
  const extras = Array.isArray(prior.extras) ? prior.extras.join(" ") : "";
  return [
    prior.title,
    prior.category,
    prior.listingType,
    prior.vehicleMake,
    prior.vehicleModel,
    prior.vehicleGeneration,
    prior.vehicleYear,
    extras,
  ]
    .filter(Boolean)
    .join(" ");
}

function messageIdentityBlob(message: string): string {
  const m = normalizedAwhinaText(message);
  return m
    .replace(
      /^(?:also|now|i\s+also|i\s+want\s+to|want\s+to|i'?m|please|can\s+you|help\s+me|let'?s|lets)\s+/i,
      ""
    )
    .replace(
      /^(?:sell(?:ing)?|list(?:ing)?|post(?:ing)?|create\s+(?:a\s+)?listing\s+(?:for|of)?)\s+(?:my|a|an|the)\s+/i,
      ""
    )
    .replace(/\$[\d,]+(?:\.\d{1,2})?.*$/i, "")
    .replace(/\blocated\s+in\b.*$/i, "")
    .trim();
}

/** Data-rich paste — not a terse "continue current draft" command. */
export function isStructuredListingPaste(message: string): boolean {
  const m = normalizedAwhinaText(message);
  if (!m) return false;
  const hasPrice = PRICE_DOLLAR_RE.test(m);
  const hasYearMake = YEAR_MAKE_RE.test(m);
  const hasKm = KM_READING_RE.test(m);
  const commaFacts = (m.match(/,/g) || []).length >= 2;
  const wordCount = m.split(/\s+/).length;
  return wordCount >= 12 && hasPrice && (hasYearMake || hasKm || commaFacts);
}

/** Short sell command on an existing draft — "list it", "sell this", seed-only. */
export function isTerseListingCommand(message: string): boolean {
  const m = normalizedAwhinaText(message);
  if (!m) return false;
  if (isStructuredListingPaste(m)) return false;
  if (isExplicitNewSellListingMessage(m) && m.split(/\s+/).length > 8) return false;
  return m.split(/\s+/).length <= 14;
}

export function assessTextObjectContinuity(
  message: string,
  prior: SkyAiListingContext | SkyAiListingFill | null | undefined
): "SAME_OBJECT" | "NEW_OBJECT" | "UNKNOWN" {
  const priorBlob = priorIdentityBlob(prior);
  if (!prior || !priorBlob.trim()) return "UNKNOWN";

  const msgBlob = messageIdentityBlob(message);
  const priorTok = tokens(priorBlob);
  const msgTok = tokens(msgBlob);
  const overlap = jaccard(priorTok, msgTok);

  const priorLower = priorBlob.toLowerCase();
  const msgLower = msgBlob.toLowerCase();

  const priorIsPhone = /\b(iphone|ipad|galaxy|pixel|samsung\s+(?:s|a|z|note|fold|flip)|oneplus|oppo|vivo|xiaomi|huawei)\b/i.test(
    priorLower
  );
  const msgIsPhone = /\b(iphone|ipad|galaxy|pixel|samsung\s+(?:s|a|z|note|fold|flip)|oneplus|oppo|vivo|xiaomi|huawei)\b/i.test(
    msgLower
  );
  const priorIsVehicle =
    String(prior.listingType || "").toLowerCase() === "vehicle" ||
    Boolean(prior.vehicleMake);
  const msgIsVehicle =
    YEAR_MAKE_RE.test(msgLower) ||
    /\b(hilux|ranger|navara|d-max|bt-50|amarok|corolla|axela|camry|commodore|falcon|skyline|silvia|supra|wrx|outback|forester|pajero|patrol|land\s*cruiser|prado|fortuner|highlander|rav4|cx-5|cx-5|x-trail|leaf|model\s+[3sxy]|tesla|335i|330i|320i|328i|340i|m3|m4|bmw)\b/i.test(
      msgLower
    );
  const priorIsConsole = /\b(ps5|ps4|xbox|switch|nintendo|playstation)\b/i.test(priorLower);
  const msgIsConsole = /\b(ps5|ps4|xbox|switch|nintendo|playstation)\b/i.test(msgLower);

  if ((priorIsPhone && msgIsVehicle) || (priorIsVehicle && msgIsPhone)) {
    return "NEW_OBJECT";
  }
  if ((priorIsPhone && msgIsConsole) || (priorIsConsole && msgIsPhone)) {
    return "NEW_OBJECT";
  }
  if ((priorIsVehicle && msgIsConsole) || (priorIsConsole && msgIsVehicle)) {
    return "NEW_OBJECT";
  }

  if (prior.vehicleMake && msgIsVehicle) {
    const priorMake = String(prior.vehicleMake).toLowerCase();
    const makeMatch = msgLower.match(
      /\b(toyota|honda|nissan|mazda|ford|bmw|mercedes|holden|hyundai|kia|subaru|mitsubishi|lexus|audi|volkswagen|vw|isuzu|suzuki|volvo|land rover|range rover|jeep|chevrolet|chevy|dodge|ram|tesla|porsche)\b/i
    );
    if (makeMatch && makeMatch[1].toLowerCase() !== priorMake) {
      return "NEW_OBJECT";
    }
  }

  if (priorIsPhone && isListingPatchFollowUp(message)) {
    return "SAME_OBJECT";
  }
  if (priorIsVehicle && isListingPatchFollowUp(message) && !msgIsPhone && !msgIsConsole) {
    return "SAME_OBJECT";
  }
  const priorIsRental = String(prior.listingType || "").toLowerCase() === "rental";
  if (priorIsRental && isListingPatchFollowUp(message)) {
    return "SAME_OBJECT";
  }
  const priorIsService = String(prior.listingType || "").toLowerCase() === "service";
  if (priorIsService && isListingPatchFollowUp(message)) {
    return "SAME_OBJECT";
  }

  if (priorIsPhone && msgIsPhone) {
    const priorModel = priorLower.match(/\b(iphone|galaxy|pixel|s\d+|note|fold|flip)\b/i)?.[0];
    const msgModel = msgLower.match(/\b(iphone|galaxy|pixel|s\d+|note|fold|flip)\b/i)?.[0];
    if (priorModel && msgModel && priorModel !== msgModel && overlap < 0.35) {
      return "NEW_OBJECT";
    }
  }

  if (overlap >= 0.4) return "SAME_OBJECT";
  if (overlap < 0.18 && msgTok.size >= 2) return "NEW_OBJECT";
  return "UNKNOWN";
}

/**
 * Single authority: should this message REPLACE the draft or PATCH it?
 */
export function assessDraftTransition(opts: {
  message: string;
  priorDraft?: SkyAiListingContext | SkyAiListingFill | null;
  freshStartHint?: boolean;
  pendingClarification?: PendingClarification | null;
}): DraftTransition {
  const message = opts.message.trim();
  const prior = opts.priorDraft;
  const hasPrior = hasActiveListingDraft(prior) || Boolean(prior?.title?.trim());

  if (opts.freshStartHint) {
    return {
      mode: "REPLACE",
      replaceDraft: true,
      freshStart: true,
      reason: "fresh_start_hint",
    };
  }

  if (!hasPrior) {
    return {
      mode: "REPLACE",
      replaceDraft: true,
      freshStart: true,
      reason: "no_prior_draft",
    };
  }

  const activeSlot = getActiveListingSlot(opts.pendingClarification);
  const patchFollowUp =
    isListingPatchFollowUp(message) ||
    hasActiveDraftCommandLanguage(message) ||
    isListPublishActionMessage(message) ||
    Boolean(activeSlot);

  const continuity = assessTextObjectContinuity(message, prior);
  const explicitNew = isExplicitNewSellListingMessage(message);
  const structured = isStructuredListingPaste(message);
  const priorType = String(prior?.listingType || "").toLowerCase();
  const incomingType = inferIncomingListingType(message);
  const domainShift =
    Boolean(incomingType && priorType && incomingType !== priorType);

  const alsoSwitch =
    /\b(also\s+(?:want\s+to\s+)?(?:sell|list)|now\s+(?:sell|list)|different\s+(?:item|listing|product)|start\s+(?:a\s+)?new\s+listing|new\s+listing)\b/i.test(
      message
    );

  const shouldReplace =
    alsoSwitch ||
    (continuity === "NEW_OBJECT" && isIdentityRichListingPaste(message)) ||
    (continuity === "NEW_OBJECT" && listingIdentitiesConflict(prior, message)) ||
    (explicitNew && (structured || isIdentityRichListingPaste(message) || continuity === "NEW_OBJECT" || domainShift)) ||
    (structured && continuity === "NEW_OBJECT") ||
    (structured && domainShift) ||
    (isIdentityRichListingPaste(message) && continuity === "NEW_OBJECT") ||
    (hasListingSellIntent(message) && continuity === "NEW_OBJECT" && !patchFollowUp);

  if (shouldReplace && !patchFollowUp) {
    return {
      mode: "REPLACE",
      replaceDraft: true,
      freshStart: true,
      reason: explicitNew
        ? "explicit_new_listing"
        : domainShift
          ? "domain_shift"
          : continuity === "NEW_OBJECT"
            ? "new_object"
            : "structured_new_seed",
    };
  }

  if (patchFollowUp || continuity === "SAME_OBJECT") {
    return {
      mode: "PATCH",
      replaceDraft: false,
      freshStart: false,
      reason: activeSlot ? "pending_slot_answer" : "same_object_patch",
    };
  }

  if (explicitNew) {
    return {
      mode: "REPLACE",
      replaceDraft: true,
      freshStart: true,
      reason: "explicit_new_seed",
    };
  }

  return {
    mode: "PATCH",
    replaceDraft: false,
    freshStart: false,
    reason: "default_patch",
  };
}

export function isListingPatchFollowUp(message: string): boolean {
  const t = String(message || "").trim();
  if (!t) return false;
  if (isExplicitNewSellListingMessage(t) && t.split(/\s+/).length >= 8) return false;
  if (isStructuredListingPaste(t) || isIdentityRichListingPaste(t)) return false;
  if (/\bforget\s+(?:the|that|this)\b/i.test(t) && /\b(?:sell(?:ing)?|list(?:ing)?)\b/i.test(t)) {
    return false;
  }
  if (/^(wait\s+)?(nah|nope|no)\b/i.test(t)) return true;
  if (/\bwait\s+(?:nah|no)\b/i.test(t)) return true;
  if (/^(actually|also|and also|plus)\b/i.test(t)) return true;
  if (/^and\b/i.test(t) && t.split(/\s+/).length <= 12) return true;
  if (/\bforget\s+that\b/i.test(t) && !/\b(?:sell(?:ing)?|list(?:ing)?)\s+(?:my|a|an|the)\b/i.test(t)) {
    return true;
  }
  if (/^(change|make it|set|update|correct|fix|instead|rather|add)\b/i.test(t)) {
    return true;
  }
  if (/^\s*\$?\s*[\d,]+(?:\.\d{1,2})?\s*(k|K)?\s*$/i.test(t)) return true;
  if (/^\d+\s?(gb|tb)$/i.test(t)) return true;
  if (/^(new|used|like[\s-]?new|good|fair|mint|manual|automatic|petrol|diesel|hybrid)$/i.test(t)) {
    return true;
  }
  if (/^\s*[\d,]+\s*(km|kms)\s*$/i.test(t)) return true;
  if (/^\d+\s+(pads?|controllers?|chargers?|games?|remotes?|keys?|batter(?:y|ies)|cards?|chains?)\b/i.test(t)) {
    return true;
  }
  if (
    /^(?:rust|crack(?:ed)?|scratch(?:ed)?|dent(?:ed)?|chip(?:ped)?|scuff(?:ed)?)\b/i.test(t) &&
    t.split(/\s+/).length <= 8
  ) {
    return true;
  }
  if (/^pickup\b/i.test(t) && t.split(/\s+/).length <= 8) return true;
  if (/^still\b/i.test(t) && t.split(/\s+/).length <= 8) return true;
  if (/^bond\b/i.test(t) && t.split(/\s+/).length <= 6) return true;
  if (/^(?:space\s+)?(?:grey|gray|black|white|blue|red|purple|silver|green|gold|pink)\b/i.test(t) && t.split(/\s+/).length <= 5) {
    return true;
  }
  if (/^(?:comes?\s+with|must\s+have|need(?:s)?)\b/i.test(t) && t.split(/\s+/).length <= 12) {
    return true;
  }
  if (/^don'?t\s+put\b/i.test(t) && t.split(/\s+/).length <= 14) return true;
  if (/^(?:or\s+)?maybe\b/i.test(t) && t.split(/\s+/).length <= 8) return true;
  if (/^(?:make\s+it|nah\s+\d|wait\s+\d)\b/i.test(t)) return true;
  if (
    /^(?:budget|around|about|max(?:imum)?|under|up\s+to)\b/i.test(t) &&
    t.split(/\s+/).length <= 10
  ) {
    return true;
  }
  if (/^no\s+(?:rust|scams?|time\s*wasters?)\b/i.test(t) && t.split(/\s+/).length <= 12) {
    return true;
  }
  if (/\b(?:not\s+selling|looking\s+to\s+buy|no\s+scams|serious\s+only)\b/i.test(t) && t.split(/\s+/).length <= 16) {
    return true;
  }
  if (/\b(?:\d+\s+(?:pads?|controllers?|games?|chargers?|batter(?:y|ies)|cards?|chains?)|1\s+(?:pad|battery)\s+is\s+fine)\b/i.test(t) && t.split(/\s+/).length <= 16) {
    return true;
  }
  if (/\b(?:a\s+day|a\s+week|per\s+day|per\s+week|\/\s*day|\/\s*week)\b/i.test(t) && t.split(/\s+/).length <= 10) {
    return true;
  }
  return false;
}

function inferIncomingListingType(
  message: string
): "physical" | "vehicle" | "service" | "rental" | undefined {
  const m = normalizedAwhinaText(message);
  if (!m) return undefined;
  if (hasWantedListingIntent(m)) return undefined;
  if (YEAR_MAKE_RE.test(m) || KM_READING_RE.test(m)) return "vehicle";
  const lawnMowerPhysical =
    /\blawn\s*mower\b/i.test(m) &&
    !/\b(?:i\s+mow|mow(?:ing)?\s+lawns?|lawn\s*mowing)\b/i.test(m);
  if (
    !lawnMowerPhysical &&
    /\b(lawn|clean|handyman|tutor|service|hourly|per hour|hedge)\b/i.test(m)
  ) {
    return "service";
  }
  if (/\b(rent|rental|hire out|for hire|weekly rent)\b/i.test(m)) return "rental";
  if (/\b(iphone|galaxy|pixel|couch|tv|laptop|ps5|xbox|drill|camera)\b/i.test(m)) {
    return "physical";
  }
  return undefined;
}

/** Apply transition flags onto a listing fill payload. */
export function stampReplaceDraft(fill: SkyAiListingFill): SkyAiListingFill {
  return { ...fill, replaceDraft: true };
}
