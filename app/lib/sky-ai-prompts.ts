export const SKY_AI_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "What can you do?", query: "What can you do?" },
  { label: "Create listing", query: "Create my listing for me — fill title, description, price and open the sell page" },
  { label: "Improve description", query: "Improve my listing title and description" },
  { label: "Price estimate", query: "Suggest a fair NZD price range for my item" },
  { label: "Safety tips", query: "Safety tips for buying and selling on Sky Drop" },
  { label: "Seller guide", query: "Take me to seller guidelines" },
];

export const SKY_AI_WELCOME =
  "Kia ora — I'm **Sky AI**, your assistant on Sky Drop.\n\nI know the platform end to end — listings, Stripe vs Arrange Purchase, Messages, disputes, and every main page.\n\nAsk anything — or tap **What can you do?**";

/** User is asking what the assistant can do — not requesting navigation. */
export function isSkyAiGeneralQuestion(message: string): boolean {
  const n = message.toLowerCase().replace(/[^\w\s?]/g, " ").trim();
  return (
    /^(what can (you|u|sky ai|sky drop ai) do|what do (you|u) do|what are you|who are you|help|help me|capabilities)\??$/.test(
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

**Listings**
• **Auto-fill** your Sell form (title, description, price, category, vehicle fields)
• Improve copy and suggest fair **NZD** prices
• Explain listing types: physical, digital, services, vehicles, rentals, jobs, events, property

**Payments & orders**
• **Stripe Checkout** vs **Arrange Purchase** (bank transfer in Messages)
• Profile bank setup, Stripe Connect, Purchases, Sales, disputes (7-day window)

**Platform**
• Messages, watchlist, dashboard, trade feed, boosts, seller limits, verification, safety

**Navigation**
Say *"take me to seller guidelines"*, *"payment settings"*, *"messages"*, etc. and I'll open the page.

What do you want help with first?`;
}
