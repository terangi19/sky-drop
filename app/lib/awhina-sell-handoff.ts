/**
 * Homepage quick-start → listing workspace handoff policy.
 *
 * Homepage establishes sell intent + basic identity, then expands into /post/ai.
 * Ambiguous product mentions without sell intent must NOT navigate.
 */

import { hasListingSellIntent, hasRentalOfferingIntent, hasServiceOfferingIntent } from "./sky-ai-intent";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

export type SellHandoffDecision = {
  shouldExpand: boolean;
  reason:
    | "listing_fill"
    | "clear_sell_identity"
    | "service_offer"
    | "rental_offer"
    | "image_sell"
    | "ambiguous"
    | "already_workspace"
    | "none";
  briefLead?: string;
};

const IDENTITY_RE =
  /\b(skyline|r[\s-]?3[2-4]|ps5|playstation|xbox|iphone|ipad|macbook|samsung|couch|sofa|trailer|lawn|mow|cleaner|handyman|bike|guitar|camera|tv|laptop|shoes|card|messi|supra|hilux|ranger|corolla|axela)\b/i;

const BARE_PRODUCT_RE =
  /^(the\s+)?(skyline|r34|r33|r32|ps5|iphone|xbox|macbook|trailer)(\s+(r[\s-]?3[2-4]|pro|max|slim))?$/i;

function identityLabel(message: string, fill?: Partial<SkyAiListingFill> | null): string {
  if (fill?.vehicleMake || fill?.vehicleModel) {
    return [fill.vehicleYear, fill.vehicleMake, fill.vehicleModel]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (fill?.title?.trim()) return fill.title.trim();
  const m = message.trim();
  if (/\bskyline\b/i.test(m)) {
    if (/\br[\s-]?34\b/i.test(m)) return "Nissan Skyline R34";
    if (/\br[\s-]?33\b/i.test(m)) return "Nissan Skyline R33";
    if (/\br[\s-]?32\b/i.test(m)) return "Nissan Skyline R32";
    return "Nissan Skyline";
  }
  if (/\bps5|playstation\s*5\b/i.test(m)) return "PS5";
  if (/\biphone\b/i.test(m)) return "iPhone";
  if (/\btrailer\b/i.test(m)) return "trailer";
  if (/\blawn|mow\b/i.test(m)) return "lawn mowing";
  return "your listing";
}

/**
 * Should the global sheet expand into the listing workspace?
 * Call after canonical/API response (prefer when listingFill present).
 */
export function decideSellWorkspaceHandoff(opts: {
  message: string;
  pathname?: string | null;
  listingFill?: Partial<SkyAiListingFill> | null;
  navigateTo?: string | null;
  hasImages?: boolean;
}): SellHandoffDecision {
  const pathname = opts.pathname || "/";
  if (pathname.startsWith("/post/ai")) {
    return { shouldExpand: false, reason: "already_workspace" };
  }

  const msg = (opts.message || "").trim();
  if (!msg && !opts.hasImages) {
    return { shouldExpand: false, reason: "none" };
  }

  // Ambiguous bare product — clarify buy vs sell, do not navigate
  if (msg && BARE_PRODUCT_RE.test(msg) && !hasListingSellIntent(msg)) {
    return { shouldExpand: false, reason: "ambiguous" };
  }

  if (opts.listingFill) {
    const label = identityLabel(msg, opts.listingFill);
    return {
      shouldExpand: true,
      reason: "listing_fill",
      briefLead: `Got it — **${label}**. I'll build the listing with you.`,
    };
  }

  if (opts.navigateTo === "/post/ai") {
    return {
      shouldExpand: true,
      reason: "clear_sell_identity",
      briefLead: `Got it — **${identityLabel(msg)}**. I'll build the listing with you.`,
    };
  }

  if (opts.hasImages && (hasListingSellIntent(msg) || /sell|list|post/i.test(msg) || !msg)) {
    return {
      shouldExpand: true,
      reason: "image_sell",
      briefLead: "Got it — I'll use your photo and build the listing with you.",
    };
  }

  if (hasServiceOfferingIntent(msg)) {
    return {
      shouldExpand: true,
      reason: "service_offer",
      briefLead: `Got it — **${identityLabel(msg)}**. I'll build the listing with you.`,
    };
  }

  if (hasRentalOfferingIntent(msg)) {
    return {
      shouldExpand: true,
      reason: "rental_offer",
      briefLead: `Got it — **${identityLabel(msg)}**. I'll build the listing with you.`,
    };
  }

  if (hasListingSellIntent(msg) && IDENTITY_RE.test(msg)) {
    return {
      shouldExpand: true,
      reason: "clear_sell_identity",
      briefLead: `Got it — **${identityLabel(msg)}**. I'll build the listing with you.`,
    };
  }

  // Explicit sell without identity — still expand so workspace can ask next question
  if (hasListingSellIntent(msg) && /\b(sell|selling|list|listing)\b/i.test(msg)) {
    // "I want to sell something" — weak; stay on home unless fill/nav already set
    if (/sell\s+something|want to sell\b(?!\s+\w)/i.test(msg) && !IDENTITY_RE.test(msg)) {
      return { shouldExpand: false, reason: "none" };
    }
    if (IDENTITY_RE.test(msg) || msg.split(/\s+/).length >= 3) {
      return {
        shouldExpand: true,
        reason: "clear_sell_identity",
        briefLead: `Got it — **${identityLabel(msg)}**. I'll build the listing with you.`,
      };
    }
  }

  return { shouldExpand: false, reason: "none" };
}

/** Prefer a short expand reply over a long homepage interrogation. */
export function preferBriefHandoffReply(
  existingReply: string | undefined,
  decision: SellHandoffDecision
): string | undefined {
  if (!decision.shouldExpand || !decision.briefLead) return existingReply;
  const existing = (existingReply || "").trim();
  if (!existing || existing.length < 20) return decision.briefLead;

  const questionCount = (existing.match(/\?/g) || []).length;
  // Homepage must not run a full questionnaire — keep one next question max
  if (questionCount >= 2) {
    const firstQuestion = existing
      .split(/(?<=[?])/)
      .map((s) => s.trim())
      .find((s) => s.includes("?") && s.length < 140);
    if (firstQuestion) {
      return `${decision.briefLead} ${firstQuestion}`.replace(/\s+/g, " ").trim();
    }
    return decision.briefLead;
  }
  return existing;
}
