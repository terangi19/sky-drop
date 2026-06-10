import { AWHINA_NAME } from "./awhina-brand";

/** Shown on Quick Post (/post/ai) — listing-focused shortcuts */
export const SKY_AI_SELL_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "🚗 Sell a vehicle", query: "I want to sell a vehicle — help me create a complete vehicle listing with all details filled in" },
  { label: "🏠 List a rental", query: "I want to list a property or item for rent — fill the rental form with weekly rates and deposit" },
  { label: "🔧 Offer a service", query: "I offer a local service and want to list it — fill the service form with pricing and description" },
  { label: "💾 Sell digital", query: "I want to sell a digital product or online service — fill the digital listing form" },
  { label: "✨ Improve listing", query: "Improve my listing title and description to be more compelling and get more views" },
  { label: "💰 Price my item", query: "Suggest a fair NZD price for my item based on the NZ market" },
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

export const SKY_AI_SELL_WELCOME =
  `Kia ora 👋 Tell me what you're selling — just describe it in plain English (or paste a full listing), and I'll fill the entire form for you.\n\nFor **vehicles** I fill make, model, year, km, colour, and more. For **rentals** I set weekly rates and deposit. For **services** I choose the right pricing type. For **digital products** I pick the correct category.\n\nOr tap 📷 to send photos and I'll figure it out from the image.`;

export const SKY_AI_WELCOME =
  `You can list **physical items, digital downloads, services, rentals, and vehicles** — I can fill the Sell form for you.\n\nAsk anything — or tap **What can you do?**`;

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
