/**
 * Photo + text fusion BEFORE responding.
 * Parses domain-aware seller shorthand onto vision facts, then composes
 * identity-safe replies (never attribute-only "Looks like a PSA 10 Panini").
 */

import {
  assessIdentityCompleteness,
  isMalformedItemIdentity,
  type IdentityCompositionResult,
} from "./awhina-identity-composition";
import {
  resolveFactDomain,
  type AwhinaFactDomain,
} from "./awhina-domain-facts";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { mergeExtras } from "./awhina-pending-slots";
import {
  parseListingPriceFromMessage,
  validatePriceString,
} from "./awhina-listing-fill-tools";
import type { AwhinaPhotoIntent } from "./awhina-photo-intent";

export type FusedMarketplaceFacts = {
  price?: string;
  location?: string;
  pickupOnly?: boolean;
  pickupAvailable?: boolean;
  grader?: string;
  grade?: string;
  serialNumber?: string;
  storage?: string;
  size?: string;
  odometer?: string;
  condition?: string;
};

export type MultimodalFusionResult = {
  domain: AwhinaFactDomain;
  listingFill: SkyAiListingFill;
  userFacts: FusedMarketplaceFacts;
  identity: IdentityCompositionResult;
  sellIntentObvious: boolean;
  assistantMessage: string;
  pendingSlot: "card_subject" | "title" | "price" | "location" | null;
  notes: string[];
};

const NZ_CITY_RE =
  /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston\s+north|rotorua|queenstown|nelson|whangarei|henderson|manukau|albany|takapuna|newmarket|ponsonby|parnell|remuera|howick|botany|papakura|waitakere)\b/i;

function titleCasePlace(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 80);
}

function hasExtra(fill: Partial<SkyAiListingFill>, prefix: string): boolean {
  return (fill.extras || []).some((e) =>
    e.toLowerCase().startsWith(prefix.toLowerCase())
  );
}

/**
 * Domain-aware shorthand — NOT a dangerous universal regex.
 * Card: 15/25 → serial, PSA 10 → grade
 * Vehicle: 120k → odometer (when vehicle domain)
 * Phone: 128gb → storage
 */
export function extractDomainAwareShorthand(
  message: string,
  domain: AwhinaFactDomain
): FusedMarketplaceFacts {
  const m = message.trim();
  if (!m) return {};
  const out: FusedMarketplaceFacts = {};

  // Shared location / pickup ("pick up auckland" / "pickup only")
  if (/\bpick(?:\s*-?\s*up|up)\b/i.test(m)) {
    out.pickupAvailable = true;
  }
  if (/\bpick(?:\s*-?\s*up|up)\s+only\b/i.test(m)) {
    out.pickupOnly = true;
  }

  const city = m.match(NZ_CITY_RE);
  if (city) out.location = titleCasePlace(city[1]);

  if (domain === "TRADING_CARD") {
    const grade = m.match(/\b(psa|bgs|cgc|sgc)\s*([0-9]{1,2}(?:\.\d)?)\b/i);
    if (grade) {
      out.grader = grade[1].toUpperCase();
      out.grade = grade[2];
    }
    const serial = m.match(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/);
    if (serial) {
      const a = Number(serial[1]);
      const b = Number(serial[2]);
      if (a > 0 && b > a && b <= 10000) {
        out.serialNumber = `${serial[1]}/${serial[2]}`;
      }
    }
    // Price: scrub grade + serial + years before bare number
    let scrubbed = m
      .replace(/\b(psa|bgs|cgc|sgc)\s*[0-9]{1,2}(?:\.\d)?\b/gi, " ")
      .replace(/\b\d{1,4}\s*\/\s*\d{1,4}\b/g, " ")
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/\bcopies?\b/gi, " ");
    const priced =
      scrubbed.match(/\$\s*([\d,]{1,8}(?:\.\d{1,2})?)/) ||
      scrubbed.match(
        /\b([\d,]{2,8}(?:\.\d{1,2})?)\s*(?:bucks|nzd|dollars?)?\b/i
      );
    if (priced) {
      const n = Number(String(priced[1]).replace(/,/g, ""));
      if (Number.isFinite(n) && n >= 1 && n <= 10_000_000 && !(n >= 1980 && n <= 2035)) {
        const check = validatePriceString(String(Math.round(n)));
        if (check.ok) out.price = check.price;
      }
    }
    return out;
  }

  if (domain === "VEHICLE") {
    const odo = m.match(
      /\b([\d,]{1,3}(?:\.\d)?)\s*k\b|\b([\d,]{2,3}\s*[\d]{3})\s*k?m\b/i
    );
    if (odo) {
      if (odo[1]) {
        const n = Math.round(Number(odo[1].replace(/,/g, "")) * 1000);
        if (n >= 1000) out.odometer = String(n);
      } else if (odo[2]) {
        out.odometer = String(Number(odo[2].replace(/[\s,]/g, "")));
      }
    }
  }

  if (domain === "PHONE" || domain === "GAMING" || domain === "GENERIC") {
    const storage = m.match(/\b(\d+)\s?(gb|tb)\b/i);
    if (storage) {
      out.storage = `${storage[1]}${storage[2].toUpperCase()}`;
    }
  }

  if (domain === "GENERIC") {
    const size = m.match(/\bsize\s*(\d{1,2}(?:\.\d)?|XS|S|M|L|XL|XXL)\b/i);
    if (size) out.size = size[1].toUpperCase();
  }

  // Generic price fallback (caller may also merge companion notes)
  if (!out.price) {
    const soft = m.match(
      /\b(?:yep|yes|yeah|yup|want|wants|asking|take|for)\s+\$?\s*([\d,]{2,8}(?:\.\d{1,2})?)\s*(k|K)?\b/i
    );
    if (soft) {
      let n = Number(soft[1].replace(/,/g, ""));
      if (soft[2]) n *= 1000;
      const check = validatePriceString(String(Math.round(n)));
      if (check.ok) out.price = check.price;
    }
  }
  if (!out.price) {
    const p = parseListingPriceFromMessage(m);
    if (p && p !== "malformed") out.price = p;
  }
  if (!out.location) {
    const city2 = m.match(NZ_CITY_RE);
    if (city2) out.location = titleCasePlace(city2[1]);
  }
  if (/\bpick(?:\s*-?\s*up|up)\b/i.test(m)) out.pickupAvailable = true;

  return out;
}

/** Infer domain from vision fill + seller text cues before fusion. */
export function inferFusionDomain(
  fill: Partial<SkyAiListingFill>,
  sellerMessage: string,
  visionDomain?: string
): AwhinaFactDomain {
  const fromFill = resolveFactDomain(fill);
  if (fromFill !== "GENERIC") return fromFill;
  const blob = `${visionDomain || ""} ${sellerMessage} ${fill.title || ""}`.toLowerCase();
  if (
    /\b(psa|bgs|cgc|sgc)\b/.test(blob) ||
    /\b\d{1,4}\s*\/\s*\d{1,4}\b/.test(blob) ||
    /\b(panini|topps|rookie|trading\s*card|football\s*card)\b/.test(blob)
  ) {
    return "TRADING_CARD";
  }
  if (/\b(iphone|samsung|pixel|gb|tb)\b/.test(blob) && /\b(phone|iphone|galaxy)\b/.test(blob)) {
    return "PHONE";
  }
  if (/\b(bmw|toyota|mazda|km|odometer|manual|automatic)\b/.test(blob)) {
    return "VEHICLE";
  }
  return fromFill;
}

export function applyUserFactsToFill(
  base: SkyAiListingFill,
  facts: FusedMarketplaceFacts,
  domain: AwhinaFactDomain
): SkyAiListingFill {
  const next: SkyAiListingFill = { ...base };
  const extras: string[] = [...(base.extras || [])];

  if (facts.price) next.price = facts.price;
  if (facts.location) {
    next.location = facts.location;
    next.pickupArea = facts.location;
  }
  if (facts.pickupAvailable) next.pickupAvailable = true;
  if (facts.condition) next.condition = facts.condition;

  if (facts.grader && facts.grade) {
    const g = `grade:${facts.grader} ${facts.grade}`;
    if (!extras.some((e) => e.toLowerCase().startsWith("grade:"))) extras.push(g);
    next.condition = next.condition || "Used - Like New";
  }
  if (facts.serialNumber) {
    const s = `serial:${facts.serialNumber}`;
    if (!extras.some((e) => e.toLowerCase().startsWith("serial:"))) extras.push(s);
    const numbered = `numbered:${facts.serialNumber}`;
    if (!extras.some((e) => e.toLowerCase().startsWith("numbered:"))) {
      extras.push(numbered);
    }
  }
  if (facts.storage) {
    if (!extras.some((e) => e.toLowerCase().startsWith("storage:"))) {
      extras.push(`storage:${facts.storage}`);
    }
  }
  if (facts.size) {
    if (!extras.some((e) => e.toLowerCase().startsWith("size:"))) {
      extras.push(`size:${facts.size}`);
    }
  }
  if (facts.odometer) next.vehicleOdometer = facts.odometer;

  if (domain === "TRADING_CARD") {
    next.listingType = next.listingType || "physical";
    next.category = next.category || "Collectibles";
    // Soft category cue for identity composition
    if (
      !extras.some((e) => /football|soccer|card/i.test(e)) &&
      /\b(panini|football|soccer)\b/i.test([base.title, ...(base.extras || [])].join(" "))
    ) {
      // keep as-is
    }
  }

  next.extras = mergeExtras(base.extras, extras);
  return next;
}

/**
 * Sell is obvious when photo + marketplace facts imply listing, or /post/ai.
 */
export function inferObviousSellIntent(opts: {
  message: string;
  onSellPage?: boolean;
  priorSellingTask?: boolean;
  photoIntent?: AwhinaPhotoIntent;
  userFacts?: FusedMarketplaceFacts;
}): boolean {
  if (opts.onSellPage) return true;
  if (opts.priorSellingTask) return true;
  if (opts.photoIntent === "sell") return true;
  const f = opts.userFacts || {};
  const hasPrice = Boolean(f.price);
  const hasLoc = Boolean(f.location);
  const hasGrade = Boolean(f.grader || f.grade);
  const hasSerial = Boolean(f.serialNumber);
  const hasPickup = Boolean(f.pickupOnly || f.pickupAvailable);
  // Price + (location | grade | serial | pickup) with a photo ≈ sell
  if (hasPrice && (hasLoc || hasGrade || hasSerial || hasPickup)) return true;
  if (hasPrice && hasLoc) return true;
  return false;
}

function buildFactAck(identity: IdentityCompositionResult, facts: FusedMarketplaceFacts): string {
  if (!identity.isComplete) {
    let lead = identity.knownSummary
      ? `I've got ${identity.knownSummary}`
      : "I've got this item";
    if (facts.serialNumber && !/numbered/i.test(lead)) {
      lead += ` numbered **${facts.serialNumber}**`;
    }
    if (facts.price) lead += ` for **$${facts.price}**`;
    if (facts.location) {
      lead +=
        facts.pickupOnly || facts.pickupAvailable
          ? `, pickup in **${facts.location}**`
          : ` in **${facts.location}**`;
    }
    return `${lead.trim()}.`;
  }

  const detail: string[] = [];
  if (facts.serialNumber) detail.push(`numbered **${facts.serialNumber}**`);
  if (facts.price) detail.push(`for **$${facts.price}**`);
  if (facts.location) {
    detail.push(
      facts.pickupOnly || facts.pickupAvailable
        ? `pickup in **${facts.location}**`
        : `in **${facts.location}**`
    );
  }
  const lead = `I've got **${identity.displayIdentity}**`;
  return detail.length
    ? `${lead} ${detail.join(", ")}.`.replace(/\s+/g, " ")
    : `${lead}.`;
}

/**
 * Compose assistant reply after fusion — acknowledge facts, ask only missing core.
 */
export function composeFusedAssistantReply(opts: {
  identity: IdentityCompositionResult;
  userFacts: FusedMarketplaceFacts;
  sellIntentObvious: boolean;
  photoIntent?: AwhinaPhotoIntent;
}): string {
  const { identity, userFacts, sellIntentObvious, photoIntent } = opts;

  // Identify-only path: never pitch sell
  if (photoIntent === "identify" && !sellIntentObvious) {
    if (identity.isComplete) {
      return `Looks like a **${identity.displayIdentity}**.`;
    }
    return `I can see ${identity.knownSummary}, but ${identity.missingCoreQuestion || "what exactly is it?"}`;
  }

  const ack = buildFactAck(identity, userFacts);

  if (!identity.isComplete && identity.missingCoreQuestion) {
    // Never ask "Want to sell?" when sell is obvious / facts present
    return `${ack} ${identity.missingCoreQuestion}`.replace(/\s+/g, " ").trim();
  }

  if (identity.isComplete) {
    if (!userFacts.price) {
      return `${ack} What's your asking price?`;
    }
    if (!userFacts.location) {
      return `${ack} Where's pickup?`;
    }
    return `${ack} Add photos if needed, then hit **Publish** when it looks right.`;
  }

  // Incomplete without a specific question
  return `${ack} What exactly is it?`;
}

/**
 * Full fusion: vision fill + seller message → fill + identity-safe reply.
 */
export function fuseVisionAndSellerText(opts: {
  listingFill: SkyAiListingFill;
  displayIdentity?: string;
  sellerMessage: string;
  visionDomain?: string;
  onSellPage?: boolean;
  priorSellingTask?: boolean;
  photoIntent?: AwhinaPhotoIntent;
}): MultimodalFusionResult {
  const notes: string[] = [];
  const domain = inferFusionDomain(
    opts.listingFill,
    opts.sellerMessage,
    opts.visionDomain
  );
  notes.push(`domain:${domain}`);

  const userFacts = extractDomainAwareShorthand(opts.sellerMessage, domain);
  // Prefer price/location already on fill (companion merge ran upstream)
  if (!userFacts.price && opts.listingFill.price) {
    userFacts.price = opts.listingFill.price;
  }
  if (!userFacts.location && (opts.listingFill.location || opts.listingFill.pickupArea)) {
    userFacts.location = opts.listingFill.location || opts.listingFill.pickupArea;
  }
  if (opts.listingFill.pickupAvailable) userFacts.pickupAvailable = true;

  let listingFill = applyUserFactsToFill(opts.listingFill, userFacts, domain);

  // Seed category noun for cards when vision said panini / football
  const idBlob = [
    opts.displayIdentity,
    listingFill.title,
    opts.visionDomain,
    opts.sellerMessage,
  ]
    .filter(Boolean)
    .join(" ");
  if (domain === "TRADING_CARD" && /football|soccer|panini/i.test(idBlob)) {
    if (!hasExtra(listingFill, "category:")) {
      listingFill = {
        ...listingFill,
        extras: mergeExtras(listingFill.extras, ["category:football card"]),
      };
    }
  }

  const claimed = opts.displayIdentity || listingFill.title || "";
  if (claimed && isMalformedItemIdentity(claimed, domain)) {
    notes.push("stripped_malformed_vision_identity");
    // Don't keep attribute stack as title
    if (
      listingFill.title &&
      isMalformedItemIdentity(listingFill.title, domain)
    ) {
      const { title: _drop, ...rest } = listingFill;
      listingFill = rest as SkyAiListingFill;
      // restore other fields — title cleared
      listingFill = { ...listingFill, title: undefined };
    }
  }

  const identity = assessIdentityCompleteness({
    fill: listingFill,
    claimedIdentity: claimed,
    domain,
  });

  // Soft title: only set when complete
  if (identity.isComplete && identity.displayIdentity) {
    listingFill = { ...listingFill, title: identity.displayIdentity };
  } else if (!listingFill.title?.trim()) {
    // Placeholder title from known summary without claiming player
    const soft = identity.knownSummary
      .replace(/^an?\s+/i, "")
      .replace(/\*\*/g, "");
    if (soft) listingFill = { ...listingFill, title: soft.slice(0, 80) };
  }

  const sellIntentObvious = inferObviousSellIntent({
    message: opts.sellerMessage,
    onSellPage: opts.onSellPage,
    priorSellingTask: opts.priorSellingTask,
    photoIntent: opts.photoIntent,
    userFacts,
  });

  const assistantMessage = composeFusedAssistantReply({
    identity,
    userFacts,
    sellIntentObvious,
    photoIntent: opts.photoIntent,
  });

  let pendingSlot: MultimodalFusionResult["pendingSlot"] = null;
  if (!identity.isComplete && domain === "TRADING_CARD") {
    pendingSlot = "card_subject";
  } else if (!identity.isComplete) {
    pendingSlot = "title";
  } else if (!userFacts.price && !listingFill.price) {
    pendingSlot = "price";
  } else if (!userFacts.location && !listingFill.location) {
    pendingSlot = "location";
  }

  return {
    domain,
    listingFill,
    userFacts,
    identity,
    sellIntentObvious,
    assistantMessage,
    pendingSlot,
    notes,
  };
}
