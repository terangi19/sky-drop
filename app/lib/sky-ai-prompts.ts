import { AWHINA_NAME } from "./awhina-brand";

/** Shown on Quick Post (/post/ai) — listing-focused shortcuts */
export const SKY_AI_SELL_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "Create listing", query: "Create my listing for me — fill title, description, price and open the sell page" },
  { label: "List a service", query: "Help me list a service on Sky Drop — fill the sell form with listingType service" },
  { label: "Sell digital", query: "Help me list a digital product on Sky Drop — fill the sell form with listingType digital" },
  { label: "List rental", query: "Help me list something for rent on Sky Drop — fill rental rates and location" },
  { label: "Improve description", query: "Improve my listing title and description" },
  { label: "Price estimate", query: "Suggest a fair NZD price range for my item" },
];

export const SKY_AI_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "What can you do?", query: "What can you do?" },
  { label: "Create listing", query: "Create my listing for me — fill title, description, price and open the sell page" },
  { label: "List a service", query: "Help me list a service on Sky Drop — fill the sell form with listingType service" },
  { label: "Sell digital", query: "Help me list a digital product on Sky Drop — fill the sell form with listingType digital" },
  { label: "List rental", query: "Help me list something for rent on Sky Drop — fill rental rates and location" },
  { label: "Improve description", query: "Improve my listing title and description" },
  { label: "Price estimate", query: "Suggest a fair NZD price range for my item" },
  { label: "Safety tips", query: "Safety tips for buying and selling on Sky Drop" },
  { label: "Seller guide", query: "Take me to seller guidelines" },
];

export const SKY_AI_WELCOME =
  `You can list **physical items, digital downloads, services, rentals, and vehicles** — I can fill the Sell form for you.\n\nAsk anything — or tap **What can you do?**`;

/** First message when opening Āwhina on Quick Post (/post/ai) */
export const SKY_AI_SELL_WELCOME =
  `Tell me every detail about your product, or tap 📷 to send photos — I'll add them to your listing and fill the form for you 🙂`;

/** User is asking what the assistant can do — not requesting navigation. */
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
  return `Here's what I know and can do on **Sky Drop**:

**You can list**
• **Physical** items (ship or pickup)
• **Digital** products — templates, ebooks, art, software (/digital)
• **Services** — design, writing, video, coaching (/services)
• **Rentals** — gear, tools, vehicles by the day (/rentals)
• **Vehicles** for sale

**${AWHINA_NAME}**
• **Auto-fill** Sell — including digital, service, and rental listings
• Improve copy and suggest fair **NZD** prices

**Payments & orders**
• **Stripe Checkout** vs **Arrange Purchase** (bank transfer in Messages)
• Profile bank setup, Stripe Connect, Purchases, Sales, disputes (7-day window)

**Platform**
• Messages, watchlist, dashboard, trade feed, boosts, seller limits, verification, safety

**Navigation**
Say *"take me to seller guidelines"*, *"payment settings"*, *"messages"*, etc. and I'll open the page.

What do you want help with first?`;
}
