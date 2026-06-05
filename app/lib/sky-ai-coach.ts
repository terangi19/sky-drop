/**
 * Interactive seller coach — one step at a time, conversational not encyclopedic.
 */

import { AWHINA_BRANDING_RULE } from "./awhina-brand";
import { parseListingTypeChoice as draftListingTypeChoice } from "./sky-ai-listing-draft";
import type { SkyAiHistoryItem, SkyAiListingDraft } from "./sky-ai-types";

export const SKY_AI_CONVERSATIONAL_RULES = `
${AWHINA_BRANDING_RULE}

## CONVERSATIONAL COACH (critical — smartest marketplace employee, not a script)

**Before each reply:** What are they trying to do? What do we already know? What's the one thing that moves them forward?

**Default reply shape:** 2–4 short paragraphs max. Often 1–2 sentences + one question.

**Do:**
- Ask **one useful question** per turn — the one that unlocks the next step
- Remember what they said; reference it naturally
- Sound like a sharp colleague — warm, brief, human
- Guide toward listing, auction, service, purchase, or understanding — whichever they're actually doing

**Never:**
- Treat every message like a new conversation
- Ask for information already in the draft or last user message
- Dump numbered lists of 5+ steps in one message
- Wall-of-text feature explanations
- Use the same opener twice in a row ("Perfect.", "Great!", "No worries" every turn)

**First-time seller (one step per turn):**
1. What are they selling? — wait
2. Photos ready or draft first? — wait
3. Describe the item (or use photos) → LISTING_FILL when enough detail
4. Price only when relevant — with honest confidence
5. Nudge to publish — one line

**Platform how-to:** 2-sentence summary, then ask if they want the next step — not the whole manual.

**Pricing block:** only when they ask or you're at the pricing step — not on every listing message.

**Never re-introduce yourself** mid-flow. Continue with memory and context.
`.trim();

export function hasConversationStarted(history: SkyAiHistoryItem[]): boolean {
  return history.some((m) => m.role === "user" && m.content.trim());
}

export function isCoachFlowActive(history: SkyAiHistoryItem[]): boolean {
  return detectCoachAwaiting(history) !== null;
}

export const NEW_SELLER_INTRO = `No worries 😊

What would you like to sell?

• Physical Item
• Digital Product
• Service
• Rental
• Vehicle`;

type CoachAwaiting =
  | "listing_type"
  | "photos"
  | null;

const LISTING_TYPE_MATCHERS: { re: RegExp; label: string; listingType: string }[] = [
  { re: /\b(physical|item|product|goods|something)\b/i, label: "Physical Item", listingType: "physical" },
  { re: /\b(digital|download|template|e-?book|file)\b/i, label: "Digital Product", listingType: "digital" },
  { re: /\b(service|freelance|gig|design|coaching)\b/i, label: "Service", listingType: "service" },
  { re: /\b(rental|rent|hire|lease|tool)\b/i, label: "Rental", listingType: "rental" },
  { re: /\b(vehicle|car|truck|bike|motor|boat)\b/i, label: "Vehicle", listingType: "vehicle" },
];

function lastAssistantText(history: SkyAiHistoryItem[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") return history[i]!.content;
  }
  return "";
}

export function detectCoachAwaiting(history: SkyAiHistoryItem[]): CoachAwaiting {
  const last = lastAssistantText(history).toLowerCase();
  if (last.includes("what would you like to sell")) return "listing_type";
  if (
    last.includes("photos already") ||
    last.includes("help creating the listing") ||
    last.includes("do you have photos")
  ) {
    return "photos";
  }
  return null;
}

function parseCoachListingTypeChoice(message: string): (typeof LISTING_TYPE_MATCHERS)[0] | null {
  const q = message.trim().toLowerCase();
  for (const m of LISTING_TYPE_MATCHERS) {
    if (m.re.test(q)) return m;
  }
  if (/^(1|physical)$/i.test(q)) return LISTING_TYPE_MATCHERS[0]!;
  if (/^(2|digital)$/i.test(q)) return LISTING_TYPE_MATCHERS[1]!;
  if (/^(3|service)$/i.test(q)) return LISTING_TYPE_MATCHERS[2]!;
  if (/^(4|rental)$/i.test(q)) return LISTING_TYPE_MATCHERS[3]!;
  if (/^(5|vehicle)$/i.test(q)) return LISTING_TYPE_MATCHERS[4]!;
  return null;
}

function userHasPhotos(message: string): boolean | null {
  const q = message.toLowerCase();
  if (/\b(yes|yeah|yep|have photos|got photos|already|ready)\b/.test(q)) return true;
  if (/\b(no|not yet|don't have|help first|draft|create the listing)\b/.test(q)) return false;
  return null;
}

/** Brief reply when user greets mid-conversation — never full welcome */
export function getConversationContinuationReply(
  history: SkyAiHistoryItem[]
): string {
  const awaiting = detectCoachAwaiting(history);
  if (awaiting === "listing_type") {
    return `Hey 😊\n\nWhat would you like to sell?\n\n• Physical Item\n• Digital Product\n• Service\n• Rental\n• Vehicle`;
  }
  if (awaiting === "photos") {
    return `Hey 😊\n\nDo you have photos already, or would you like help creating the listing first?`;
  }
  return `Hey 😊\n\nWant to pick up where we left off with your listing?`;
}

export function trySellerCoachReply(
  message: string,
  history: SkyAiHistoryItem[] = []
): { text: string; navigateTo?: string; draftUpdates?: Partial<SkyAiListingDraft> } | null {
  const awaiting = detectCoachAwaiting(history);
  if (!awaiting) return null;

  if (awaiting === "listing_type") {
    const choice = parseCoachListingTypeChoice(message);
    if (!choice) {
      return {
        text: `Just pick one that fits best 😊

• Physical Item
• Digital Product
• Service
• Rental
• Vehicle`,
      };
    }
    const draftPatch: Partial<SkyAiListingDraft> = {
      listingType: draftListingTypeChoice(message) || choice.listingType,
      flow: "listing_creation" as const,
      step: "photos" as const,
    };
    return {
      text: `Great choice — **${choice.label}**.

Do you have photos already, or would you like help creating the listing first?`,
      draftUpdates: draftPatch,
    };
  }

  if (awaiting === "photos") {
    const hasPhotos = userHasPhotos(message);
    if (hasPhotos === true) {
      return {
        text: `Perfect — tap 📷 to add your photos, then tell me what you're selling (brand, model, condition — whatever you know).

I'll draft your title, description, and NZ price.`,
        navigateTo: "/post/ai",
      };
    }
    if (hasPhotos === false) {
      return {
        text: `No problem — describe what you're selling in a sentence or two. Brand, condition, anything buyers should know.

I'll build your listing and fill the form for you.`,
        navigateTo: "/post/ai",
      };
    }
    return {
      text: `Do you have photos ready, or should we draft the listing first?`,
    };
  }

  return null;
}

/** Short summaries for platform topics — not full articles */
export function compactPlatformReply(topic: string): string | null {
  switch (topic) {
    case "request_quote":
      return `Request Quote is for custom work — buyer messages you with project details, you send a formal quote in chat, they accept, then pay through Sky Drop.

Want me to walk through it step by step?`;
    case "offers":
      return `Offers let buyers propose a lower price. You accept, counter, or decline in Messages.

Want the quick flow or are you setting up a listing?`;
    case "auctions":
      return `Auctions run for a set time — highest bidder wins and pays by card.

Listing one, or bidding on something?`;
    case "payments":
      return `Two options: **Stripe Checkout** (card, instant) or **Arrange Purchase** (agree bank transfer/cash in Messages).

Which are you setting up — buying or selling?`;
    default:
      return null;
  }
}
