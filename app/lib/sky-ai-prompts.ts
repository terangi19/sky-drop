import type { SkyAiHistoryItem } from "./sky-ai-types";
import {
  getConversationContinuationReply,
  hasConversationStarted,
} from "./sky-ai-coach";

/** Shown on Quick Post (/post/ai) — listing-focused shortcuts */
export const SKY_AI_SELL_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "Create listing", query: "Create my listing for me — fill title, description, price and open the sell page" },
  { label: "List a service", query: "Help me list a service on Sky Drop — fill the sell form with listingType service" },
  { label: "Sell digital", query: "Help me list a digital product on Sky Drop — fill the sell form with listingType digital" },
  { label: "List rental", query: "Help me list something for rent on Sky Drop — fill rental rates and location" },
  { label: "Improve description", query: "Improve my listing title and description" },
  { label: "Price estimate", query: "Give me smart NZD pricing — Quick Sale, Fair Market, Max Realistic with confidence" },
  { label: "First time selling", query: "I've never sold online before" },
  { label: "Request Quote", query: "How does Request Quote work on Sky Drop?" },
];

export const SKY_AI_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "What can you do?", query: "What can you do?" },
  { label: "Find listings", query: "Find me listings for a PS5 on Sky Drop" },
  { label: "Create listing", query: "Create my listing for me — fill title, description, price and open the sell page" },
  { label: "First time selling", query: "I've never sold online before — guide me through creating my first listing" },
  { label: "How to buy", query: "How do I buy something on Sky Drop?" },
  { label: "Request Quote", query: "How does Request Quote work?" },
  { label: "Offers & auctions", query: "How do offers and auctions work on Sky Drop?" },
  { label: "Payments", query: "What's the difference between Stripe Checkout and Arrange Purchase?" },
  { label: "List a service", query: "Help me list a service on Sky Drop — fill the sell form with listingType service" },
  { label: "Price estimate", query: "Give me smart NZD pricing — Quick Sale, Fair Market, Max Realistic with confidence" },
  { label: "Safety tips", query: "Safety tips for buying and selling on Sky Drop" },
  { label: "Seller guide", query: "Take me to seller guidelines" },
];

/** Global floating Sky AI — compact, conversational */
export const SKY_AI_WELCOME = `Kia ora 👋

I'm Sky, your Sky Drop assistant.

Ask me about listings, pricing, finding products, or how buying and selling works on Sky Drop.

New to selling online? Just say "I've never sold online before" and I'll walk you through it step-by-step.`;

/** Subtitle under Sky AI on the Quick Post card (header only) */
export const SKY_AI_SELL_HEADER =
  "Describe your item or send photos — I'll price it for NZ, write a premium listing, and fill the form for you";

/** First message when opening Sky AI on Quick Post (/post/ai) */
export const SKY_AI_SELL_WELCOME = `Kia ora 👋

I'm Sky, your Sky Drop assistant.

Tell me what you're selling (or tap 📷 for photos) and I'll help with pricing, titles, descriptions, categories, and listing setup.

New to selling online? Just say "I've never sold online before" and I'll walk you through it step-by-step.`;

/** Collapse excessive newlines so chat bubbles stay compact */
export function normalizeSkyAiChatText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Greetings — never trigger listing search */
export function isSkyAiGreeting(message: string): boolean {
  const n = message
    .toLowerCase()
    .replace(/[^\w\s'?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[!?.]+$/g, "");
  if (
    /^(hi|hello|hey|yo|hiya|sup|howdy|gday|g day|kia ora|morning|afternoon|evening)$/.test(
      n
    )
  ) {
    return true;
  }
  if (/^(good\s+(morning|afternoon|evening))$/.test(n)) return true;
  return false;
}

export function isSkyAiThanks(message: string): boolean {
  const n = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[!?.]+$/g, "");
  return /^(thanks?|thank you|thx|ty|cheers|nice one|sweet as)$/.test(n);
}

export function skyAiGreetingReply(history: SkyAiHistoryItem[] = []): string {
  if (hasConversationStarted(history)) {
    return getConversationContinuationReply(history);
  }
  return SKY_AI_WELCOME;
}

export function skyAiThanksReply(): string {
  return "You're welcome 😊 Need help listing something, learning how a feature works, or finding a product?";
}

/** Explicit "what can you do" / identity — NOT platform feature questions. */
export function isSkyAiCapabilitiesQuestion(message: string): boolean {
  const n = message.toLowerCase().replace(/[^\w\s?]/g, " ").trim();
  return (
    /^(what can (you|u|sky ai|āwhina|awhina|sky drop ai) do|what do (you|u) do|what are you|who are you|capabilities|help|help me)\??$/.test(
      n
    ) ||
    /\b(what can (you|u) do|what do (you|u) do|how can (you|u) help|what are your capabilities)\b/.test(
      n
    )
  );
}

/** @deprecated Use isSkyAiCapabilitiesQuestion for capability checks. */
export function isSkyAiGeneralQuestion(message: string): boolean {
  return isSkyAiCapabilitiesQuestion(message);
}

export function skyAiCapabilitiesReply(history: SkyAiHistoryItem[] = []): string {
  if (hasConversationStarted(history)) {
    return normalizeSkyAiChatText(
      `I'm **${AWHINA_NAME}** — I help with listings, pricing, finding products, auctions, services, and how Sky Drop features work.

What would you like to do?`
    );
  }
  return normalizeSkyAiChatText(`I'm **${AWHINA_NAME}**, Sky Drop's marketplace assistant — listings, pricing, search, and platform how-to.

What are you trying to do — sell, buy, or learn how something works?`);
}
