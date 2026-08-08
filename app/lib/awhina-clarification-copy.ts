/**
 * Canonical clarification copy for shopping / search slot asks.
 * One place for wording by activeTask × listing/search type × missing slots.
 * Never scatter pickup/service/rental phrasing through the route.
 */

import {
  extractFindSearchTerm,
  isActualVehicleQuery,
  isVehiclePartQuery,
} from "./sky-ai-find-routing";
import type { AwhinaActiveTask, SearchMissingSlot } from "./awhina-task-scope";

/** Search / listing flavour for clarification wording. */
export type ClarificationSearchType =
  | "physical"
  | "service"
  | "rental"
  | "vehicle"
  | "wanted"
  | "digital";

export type ClarificationCopyPhase = "proactive" | "followup";

const SERVICE_SEARCH_HINTS =
  /\b(lawn\s*mowing|mow(?:ing)?(?:\s+lawns?)?|mow\s+my\s+lawn|house\s*clean(?:ing)?|cleaning|cleaner|plumber|plumbing|electrician|handyman|tutor|tutoring|dog\s*walking|pet\s*sitting|massage|photographer|photography|graphic\s*design|web\s*design|someone\s+to\s+(?:mow|clean|fix|paint|tutor))\b/i;

const RENTAL_SEARCH_HINTS =
  /\b(rent|rental|hire|for\s+hire|to\s+rent|flat\s+to\s+rent|apartment|tenancy|bond|weekly\s+rent|room\s+for\s+rent|house\s+for\s+rent)\b/i;

/** Equipment-style rentals that often need collection — pickup wording OK. */
const RENTAL_COLLECTION_HINTS =
  /\b(trailer|mower|ladder|generator|skip|bin|marquee|party\s+(?:hire|gear)|ute\s+hire|tool(?:s)?|equipment|camera|speaker|pa\s+system)\b/i;

const WANTED_POST_HINTS =
  /\b(wanted\s*:|post\s+a\s+wanted|create\s+a\s+wanted|wanted\s+ad|wanted\s+listing)\b/i;

const DIGITAL_HINTS =
  /\b(ebook|e-book|template|software|digital\s+download|invoice\s+bundle|preset\s+pack)\b/i;

/**
 * Infer clarification search type from the user message and/or pending item.
 * Rental language wins over vehicle body words ("rent a trailer").
 * Lawn mower stays physical (not lawn mowing service).
 */
export function inferClarificationSearchType(
  message: string,
  item?: string
): ClarificationSearchType {
  const msg = (message || "").trim();
  const term = (item || extractFindSearchTerm(msg) || "").trim();
  const blob = `${msg} ${term}`.trim();

  if (WANTED_POST_HINTS.test(blob)) return "wanted";

  const lawnMowerPhysical =
    /\blawn\s*mower\b/i.test(blob) &&
    !/\b(?:lawn\s*mowing|mow(?:ing)?\s+lawns?|mow\s+my\s+lawn)\b/i.test(blob);

  if (!lawnMowerPhysical && (SERVICE_SEARCH_HINTS.test(blob) || SERVICE_SEARCH_HINTS.test(term))) {
    return "service";
  }

  if (RENTAL_SEARCH_HINTS.test(blob)) return "rental";

  // Makes alone (e.g. "find a BMW") are vehicles for copy — find-routing may still
  // classify them as physical browse until a body/model/year is present.
  const vehicleMakeAlone =
    /\b(bmw|toyota|mazda|honda|ford|nissan|holden|subaru|mitsubishi|hyundai|kia|volkswagen|vw|audi|mercedes|benz|lexus|isuzu|suzuki)\b/i.test(
      blob
    );

  if (
    !isVehiclePartQuery(msg || term, term) &&
    (isActualVehicleQuery(msg || term, term) || vehicleMakeAlone)
  ) {
    return "vehicle";
  }

  if (DIGITAL_HINTS.test(blob)) return "digital";

  // Buyer/request phrasing without a clearer category
  if (
    /\b(anyone\s+selling|iso\b|in\s+search\s+of|hunting\s+for)\b/i.test(msg) &&
    !SERVICE_SEARCH_HINTS.test(blob)
  ) {
    return "wanted";
  }

  return "physical";
}

function rentalUsesPickup(message?: string, item?: string): boolean {
  const blob = `${message || ""} ${item || ""}`;
  return RENTAL_COLLECTION_HINTS.test(blob);
}

function locationOnlyAsk(
  searchType: ClarificationSearchType,
  message?: string,
  item?: string
): string {
  switch (searchType) {
    case "service":
      return "Which city or suburb do you need the service in?";
    case "vehicle":
      return "Which city or region should I search?";
    case "rental":
      return rentalUsesPickup(message, item)
        ? "Which city do you want to pick up from?"
        : "Which area do you need it in?";
    case "wanted":
      return "Which area are you looking in?";
    case "digital":
      return "Any preferred region, or shall I search NZ-wide?";
    default:
      return "Which city do you want to pick up from?";
  }
}

function budgetOnlyAsk(searchType: ClarificationSearchType, item: string): string {
  switch (searchType) {
    case "service":
      return "What's your rough budget?";
    case "wanted":
      return `What's your rough budget for the **${item}**?`;
    case "vehicle":
    case "rental":
      return `What's your budget for the **${item}**?`;
    default:
      return `What's your budget?`;
  }
}

function budgetAndLocationAsk(
  searchType: ClarificationSearchType,
  item: string,
  message?: string
): { proactive: string; followup: string } {
  switch (searchType) {
    case "service":
      return {
        proactive: `I can search for **${item}**. What's your rough budget, or what area should I search?`,
        followup: `what's your rough budget, or what area should I search?`,
      };
    case "vehicle":
      return {
        proactive: `I can search for **${item}**. What's your budget, or which city or region should I search?`,
        followup: `what's your budget, or which city or region should I search?`,
      };
    case "rental": {
      const loc = rentalUsesPickup(message, item)
        ? "which city do you want to pick up from"
        : "which area do you need it in";
      return {
        proactive: `I can search for **${item}**. What's your budget, or ${loc}?`,
        followup: `what's your budget, or ${loc}?`,
      };
    }
    case "wanted":
      return {
        proactive: `I can help find a **${item}**. What's your rough budget, or which area are you looking in?`,
        followup: `what's your rough budget, or which area are you looking in?`,
      };
    case "digital":
      return {
        proactive: `I can search for **${item}**. Rough budget?`,
        followup: `roughly what budget for the **${item}**?`,
      };
    default:
      return {
        proactive: `I can search for **${item}**. Rough budget, or a city for pickup?`,
        followup: `what's your budget, or which city do you want to pick up from?`,
      };
  }
}

export type BuildClarificationCopyOpts = {
  /** Active task — shopping search copy is the main path today. */
  activeTask?: AwhinaActiveTask | string;
  searchType?: ClarificationSearchType;
  /** Original user message (preferred for type inference). */
  message?: string;
  item?: string;
  missingSlots: SearchMissingSlot[];
  phase?: ClarificationCopyPhase;
};

/**
 * Build one clarification question from task + type + missing slots.
 * Callers must not hardcode pickup/service wording elsewhere.
 */
export function buildClarificationCopy(opts: BuildClarificationCopyOpts): string {
  const item = (opts.item || "that").trim() || "that";
  const phase: ClarificationCopyPhase = opts.phase || "proactive";
  const searchType =
    opts.searchType ||
    inferClarificationSearchType(opts.message || "", item);
  const slots =
    opts.missingSlots?.length > 0
      ? opts.missingSlots
      : (["budget", "location"] as SearchMissingSlot[]);

  const hasBudget = slots.includes("budget");
  const hasLocation = slots.includes("location");
  const hasEdition = slots.includes("edition");
  const hasCondition = slots.includes("condition");

  if (hasEdition && hasBudget) {
    return phase === "followup"
      ? `Sure — disc or digital for the **${item}**, and roughly what budget?`
      : `Happy to help find a **${item}**. Disc or digital — and roughly what budget?`;
  }

  if (hasBudget && hasCondition) {
    return phase === "followup"
      ? `Sure — what's your budget for the **${item}**, and new or used?`
      : `I can search for **${item}**. Rough budget, and new or used?`;
  }

  if (hasBudget && hasLocation) {
    const both = budgetAndLocationAsk(searchType, item, opts.message);
    return phase === "followup" ? `Sure — ${both.followup}` : both.proactive;
  }

  if (hasBudget) {
    const ask = budgetOnlyAsk(searchType, item);
    return phase === "followup" ? `Sure — ${ask.charAt(0).toLowerCase()}${ask.slice(1)}` : ask;
  }

  if (hasLocation) {
    const ask = locationOnlyAsk(searchType, opts.message, item);
    if (phase === "followup") {
      // Soften service opener for ack continuation
      if (searchType === "service") {
        return `Sure — what area are you looking in?`;
      }
      return `Sure — ${ask.charAt(0).toLowerCase()}${ask.slice(1)}`;
    }
    return ask;
  }

  if (hasEdition) {
    return phase === "followup" ? `Sure — disc or digital?` : `Disc or digital for the **${item}**?`;
  }

  if (hasCondition) {
    return phase === "followup" ? `Sure — new or used?` : `New or used for the **${item}**?`;
  }

  // Fallback — still type-aware, never force pickup on services
  if (searchType === "service") {
    return phase === "followup"
      ? `Sure — any rough budget or area for the **${item}**?`
      : `I can search for **${item}**. Any rough budget or area?`;
  }
  if (searchType === "vehicle") {
    return phase === "followup"
      ? `Sure — any budget or city/region for the **${item}**?`
      : `I can search for **${item}**. Any budget or city/region?`;
  }
  if (searchType === "rental") {
    return phase === "followup"
      ? `Sure — any budget or area for the **${item}**?`
      : `I can search for **${item}**. Any budget or area?`;
  }
  return phase === "followup"
    ? `Sure — any budget or city for the **${item}**?`
    : `I can search for **${item}**. Any budget or city?`;
}

/** True when copy must never mention pickup / pick up (services, wanted, most rentals). */
export function clarificationForbidsPickup(searchType: ClarificationSearchType): boolean {
  return searchType === "service" || searchType === "wanted" || searchType === "digital";
}
