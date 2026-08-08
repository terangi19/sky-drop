import { AWHINA_NAME } from "./awhina-brand";
import { awhinaCapabilitiesReply } from "./awhina-personality";

/** Generic suggestion chips — no product-specific examples. */
export const SKY_AI_GENERIC_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "Find something", query: "Help me find something on Sky Drop" },
  { label: "Sell something", query: "I want to sell something" },
  { label: "Price an item", query: "Help me price an item" },
  { label: "Help me navigate", query: "Help me navigate Sky Drop" },
];

/** Shown on Quick Post (/post/ai) — same minimal generic set. */
export const SKY_AI_SELL_QUICK_PROMPTS = SKY_AI_GENERIC_QUICK_PROMPTS;

export const SKY_AI_QUICK_PROMPTS = SKY_AI_GENERIC_QUICK_PROMPTS;

export const SKY_AI_SELL_WELCOME =
  `Kia ora 👋 Describe what you're selling in one message — I'll fill the whole form.\n\n**Vehicles, rentals, services, digital, physical** — include price and location if you can. Or tap 📷 and send a photo.\n\nWhen you're happy, add photos and hit **Publish**.`;

export const SKY_AI_WELCOME =
  `Kia ora — I'm ${AWHINA_NAME}, your Sky Drop assistant.\n\nI can help you buy, sell, price, search, and navigate. Just tell me what you need.`;

export const SKY_AI_PROFILE_WELCOME =
  `Kia ora — I'm ${AWHINA_NAME}, your Sky Drop assistant.\n\nTell me about yourself and I'll update your profile — bio, region, social links.`;

export const SKY_AI_PROFILE_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "Write my bio", query: "Write a bio for my profile" },
  { label: "Set region", query: "Set my region" },
  { label: "Add Instagram", query: "Add my Instagram" },
  { label: "Add Facebook", query: "Add my Facebook page" },
  { label: "Add website", query: "Add my website URL" },
  { label: "Improve profile", query: "Make my profile look more professional" },
  { label: "Fill everything", query: "Fill out my entire profile based on what you know" },
];

/** User is asking what the assistant can do — not requesting navigation. */

/** Fallback after listing fill when welcome bleed is stripped — no export menus. */
export const SKY_AI_LISTING_FILL_SUCCESS =
  `Your listing is ready. Add clear photos, then hit **Publish** when you're ready. Tell me if you want the title or description tightened.`;

/** True when assistant text is the initial welcome / opener — not a real answer. */
export function isSkyAiWelcomeBleed(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t === SKY_AI_WELCOME.trim()) return true;
  if (t.replace(/\n/g, " ").trim() === SKY_AI_SELL_WELCOME.replace(/\n/g, " ").trim()) return true;
  if (t.replace(/\n/g, " ").trim() === SKY_AI_PROFILE_WELCOME.replace(/\n/g, " ").trim()) return true;
  if (/Tell me what you need/i.test(t) && /Tap a quick button below/i.test(t)) return true;
  if (/^Tell me what you need\b/i.test(t)) return true;
  if (/^Tap a quick button below/i.test(t)) return true;
  if (/Describe what you're selling in one message/i.test(t) && /hit \*\*Publish\*\*/i.test(t)) return true;
  // Current global welcome
  if (
    /^Kia ora — I'm /i.test(t) &&
    /your Sky Drop assistant/i.test(t) &&
    /buy, sell, price, search, and navigate/i.test(t) &&
    t.length < 400
  ) {
    return true;
  }
  // Legacy welcome with product Try: examples
  if (/^Kia ora — I'm \*\*/i.test(t) && /help you \*\*sell\*\*/i.test(t) && /Try:/i.test(t) && t.length < 400) {
    return true;
  }
  if (/^Kia ora 👋 Describe what you're selling/i.test(t)) return true;
  if (/create a listing, price help/i.test(t) && !/Here's what I do/i.test(t)) return true;
  return false;
}

export function isSkyAiGeneralQuestion(message: string): boolean {
  const n = message.toLowerCase().replace(/[^\w\s?]/g, " ").trim();

  return (
    /^(what can (you|u|sky ai|āwhina|awhina|sky drop ai) do|what do (you|u) do|what are you|who are you|help|help me|capabilities)\??$/.test(
      n
    ) ||
    /\b(what can (you|u) do|what do (you|u) do|how can (you|u) help|what are your capabilities)\b/.test(
      n
    ) ||
    /\b(what (is|do you know about) sky drop|how does sky drop work|tell me about sky drop)\b/.test(
      n
    )
  );
}

export function skyAiCapabilitiesReply(): string {
  return awhinaCapabilitiesReply();
}
