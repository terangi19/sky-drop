/**
 * Expert marketplace mindset — how Āwhina reasons before every reply.
 * Not scripted steps; situational understanding with memory and workflow awareness.
 */

import {
  getMissingAuctionFields,
  getMissingListingFields,
  getMissingServiceFields,
  getMissingVehicleFields,
  normalizeFlow,
} from "./sky-ai-listing-draft";
import type { SkyAiFlow, SkyAiListingDraft } from "./sky-ai-types";

export const SKY_AI_EXPERT_PRINCIPLES = `
## EXPERT MINDSET (read before every reply — internal reasoning, not shown to user)

You are the **smartest marketplace employee on Sky Drop** — not a scripted chatbot, not a help article.

**1. Understand before responding**
Before writing, determine:
- What is the user trying to achieve right now?
- What stage are they at in that workflow?
- What do we already know (draft + chat + form)?
- What is still missing?
Never answer before you understand the situation.

**2. Think step-by-step**
Do not jump to conclusions. Reason through the workflow first.
Example: "PS4 Pro with 2 controllers" → physical item, gaming, likely includes controllers — still need condition, games?, auction vs buy now, photos?, location — then ask the **single most useful** next question.

**3. Remember context**
This is a continuing conversation. Use ACTIVE SESSION context and chat history.
If they already told you something, **never ask again**. Reference what you know naturally ("Since you mentioned Auckland…").

**4. Stay focused**
If they are creating an auction, stay in auction mode. Do not switch to pricing comps, search, or platform lectures unless they **clearly change topic**.
Signals of topic change: "actually", "forget that", "how does X work", "find me a", "what's a fair price for", "search for".

**5. Verify before speaking**
Ask yourself:
- Am I asking for something already in the draft?
- Am I repeating a question from my last message?
- Does this fit the current workflow?
- Will this move them toward their goal?
If not — fix it before replying.

**6. Be practical**
Goal is not to sound clever. Goal is to help them: create listings, run auctions, list services, find products, understand Sky Drop, price accurately.

**7. Guide naturally**
New sellers: one step at a time. No walls of text. No dumping every feature at once.

**8. Be honest**
Low confidence → say so. Ask one clarification. Never invent mileage, condition, comps, or features.

**9. Marketplace first**
Think like a top NZ seller, a careful buyer, a moderator, and a pricing analyst — **before** generic AI creativity.

**10. Reliability > intelligence**
A correct simple answer beats a clever wrong one. Success = workflow completes, user reaches their goal, context never lost.

**Voice:** Warm, direct, human — like a sharp colleague at Trade Me who remembers what you said two messages ago. Vary phrasing; never use the same opener twice in a row. No "Welcome to Sky Drop" mid-flow. No robotic checklists unless asked.
`.trim();

const TOPIC_CHANGE_SIGNALS =
  /\b(forget (that|this)|never mind|nevermind|actually\b|different question|new question|stop that|cancel (this|that)|how does|how do i|what is|what's the difference|explain |help me find|find me|search for|show me listings|browse for|fair price|what should i charge|worth\b|price estimate|market value)\b/i;

export function isExplicitTopicChange(
  message: string,
  currentFlow: SkyAiFlow | null | undefined
): boolean {
  if (!currentFlow || !normalizeFlow(currentFlow)) return false;
  const q = message.trim();
  if (q.length < 8) return false;
  return TOPIC_CHANGE_SIGNALS.test(q);
}

export function inferUserGoal(
  flow: SkyAiFlow | null | undefined,
  draft: SkyAiListingDraft
): string {
  const f = normalizeFlow(flow ?? draft.flow);
  if (f === "auction_creation" || draft.saleType === "auction") return "Set up and publish an auction listing";
  if (f === "vehicle_listing" || draft.listingType === "vehicle") return "List a vehicle for sale";
  if (f === "service_listing" || f === "request_quote" || draft.listingType === "service") {
    return "List a service (fixed, hourly, or Request Quote)";
  }
  if (f === "listing_creation") return "Create a marketplace listing";
  if (f === "pricing_estimate") return "Get an accurate NZ price estimate";
  if (draft.listingType) return `Sell a ${draft.listingType} item on Sky Drop`;
  return "Get marketplace help on Sky Drop";
}

export function getDraftMissingFieldsSummary(draft: SkyAiListingDraft): string[] {
  const flow = normalizeFlow(draft.flow);
  if (flow === "auction_creation" || draft.saleType === "auction" || draft.startingBid) {
    return getMissingAuctionFields(draft);
  }
  if (draft.listingType === "vehicle" || flow === "vehicle_listing") {
    return getMissingVehicleFields(draft);
  }
  if (draft.listingType === "service" || flow === "service_listing" || flow === "request_quote") {
    return getMissingServiceFields(draft);
  }
  return getMissingListingFields(draft);
}

export function formatExpertContextForPrompt(draft: SkyAiListingDraft): string {
  const flow = normalizeFlow(draft.flow);
  const missing = getDraftMissingFieldsSummary(draft);
  const collected: Record<string, string> = {};

  const keys = [
    "listingType",
    "saleType",
    "title",
    "category",
    "condition",
    "price",
    "startingBid",
    "reservePrice",
    "durationDays",
    "location",
    "description",
    "vehicleMake",
    "vehicleModel",
    "vehicleYear",
    "vehicleOdometer",
    "servicePricingType",
    "serviceDeliveryMethod",
  ] as const;

  for (const key of keys) {
    const v = draft[key];
    if (typeof v === "string" && v.trim()) collected[key] = v.trim();
  }

  return JSON.stringify(
    {
      userGoal: inferUserGoal(flow, draft),
      currentEntity: draft.entityKey
        ? { type: draft.entityType, name: draft.entityName, key: draft.entityKey }
        : null,
      workflow: {
        flow: flow ?? null,
        step: draft.step ?? null,
        status: draft.status,
      },
      alreadyCollected: Object.keys(collected).length ? collected : null,
      stillMissing: missing.length ? missing : null,
      nextAction:
        missing.length > 0
          ? `Ask ONE question about the highest-priority missing field: ${missing[0]}`
          : "Offer to create/fill Quick Post or confirm publish — do not re-collect known fields",
      doNotAskAgain: Object.keys(collected),
    },
    null,
    2
  );
}

/** Natural phrasing for deterministic flow handlers (not robotic templates). */
export function formatMissingFieldsPrompt(
  draft: SkyAiListingDraft,
  missing: string[],
  context: "auction" | "listing" | "vehicle" | "service"
): string {
  if (missing.length === 0) return "";

  const reserveNote =
    context === "auction" && !draft.reservePrice ? " Reserve price is optional." : "";

  if (missing.length === 1) {
    const field = missing[0]!;
    if (context === "auction" && field === "starting bid") {
      return `What starting bid do you want?${reserveNote}`;
    }
    if (context === "auction" && field.includes("duration")) {
      return `How many days should the auction run?${reserveNote}`;
    }
    return `I still need ${field} — what would you like to set?`;
  }

  return `I've got part of this saved. To finish the ${context === "auction" ? "auction" : "listing"}, I still need ${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}.${reserveNote}`;
}
