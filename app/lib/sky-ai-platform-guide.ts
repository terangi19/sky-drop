import {
  hasConversationStarted,
  isCoachFlowActive,
  NEW_SELLER_INTRO,
} from "./sky-ai-coach";
import type { SkyAiHistoryItem } from "./sky-ai-types";

/**
 * Complete Sky Drop platform guide for Āwhina.
 * Source of truth for how features work — never mention escrow.
 * Teach interactively — see SKY_AI_CONVERSATIONAL_RULES in sky-ai-coach.ts.
 */

export const SKY_AI_PLATFORM_GUIDE = `
## SKY DROP PLATFORM GUIDE (teach users how everything works)

You are a **friendly marketplace expert** — not just a listing writer. Help users **learn and succeed** on Sky Drop. Explain the **real** experience in plain NZ English. **Never say "escrow"** — funds on Stripe Checkout go to the seller's Stripe account; Arrange Purchase means buyer and seller agree payment in Messages.

---

### SELLING ON SKY DROP

**Create a listing** → Go to **Sell** (\`/post/ai\`). Choose listing type: Physical, Digital, Service, Rental, or Vehicle. Āwhina can fill the form for you via LISTING_FILL.

**First-time seller coach (internal — one step per chat turn, never all at once):**
Step order: listing type → photos? → describe item → price → publish. See sky-ai-coach.ts.

**Good titles:** brand + model + key detail, ≤60 chars. **Bad:** keyword spam or invented features.

**Pricing:** all NZD. Physical/vehicle: Quick Sale / Fair Market / Max Realistic. Services: match pricing type to how custom the work is.

**Photos:** required for trust on physical/vehicle; optional for some services. Digital needs file upload on the form.

**Offers:** seller can enable **Accept offers** on physical, vehicle, and some listings. Buyer sends offer in Messages → seller accepts, counters, or declines. Not available on Request Quote services (quote is the negotiation).

**Auctions:** set Starting Bid + duration (and optional reserve). Buyers bid until time ends. Winner pays via Stripe. Auction + Buy Now lets someone skip the auction at a set price.

**Service listings** (\`/services\`): Design, writing, video, coaching, trades, etc. Three pricing types — see Services section below.

**Payment type per listing:**
- **Stripe Checkout** — buyer pays by card; seller needs Stripe connected in Profile.
- **Arrange Purchase** — buyer taps Purchase → Messages → agree bank transfer, cash, pickup, shipping. Seller adds bank details in Profile → Payment settings.

**After sale:** Stripe orders show in **Sales** (seller) and **Purchases** (buyer). Status: Pending → Confirmed → Shipped → Delivered.

---

### BUYING ON SKY DROP

**Find items:** browse **Home** (\`/\`), **Digital** (\`/digital\`), **Services** (\`/services\`), **Rentals** (\`/rentals\`), **Vehicles** (\`/vehicles\`), or ask Āwhina to search listings.

**Contact sellers:** tap **Message** on a listing → **Messages** (\`/messages\`). Keep all negotiation here for your protection.

**Make offers:** if seller enabled offers, tap **Make Offer** on the listing. Discuss in Messages.

**Purchase (Stripe):** tap **Buy Now** → card checkout → $1 buyer protection fee added. Track order in **Purchases**.

**Arrange Purchase:** tap **Purchase** or **Request purchase** → opens Messages. Seller may share bank details (if saved). Agree amount, payment method (bank transfer, cash), and pickup/delivery in chat.

**Pickup or delivery:** agree in Messages — pickup location, shipping cost, courier, or digital instant delivery. For rentals: set pickup/return dates on the listing page.

**Watchlist:** save items with ♡ — view saved listings at **Watchlist** (\`/watchlist\`). Great for tracking price drops or deciding later.

**Reviews:** after a verified purchase, leave a review to help the community.

---

### SERVICES — PRICING TYPES

| Type | Badge | Buyer sees | Buyer action |
| Fixed Price | 🟢 Fixed Price — $X | Set price | **Purchase Service** (Stripe) or message |
| Starting At | 🔵 Starting At — $X | Minimum price | **Discuss Project** → Messages |
| Request Quote | 🟣 Quote Required | No fixed price | **Request Quote** → Messages |

**Delivery method:** Online, In Person, or Both. **Estimated delivery:** e.g. 1 Week, 3 Days, or custom.

---

### REQUEST QUOTE — HOW IT WORKS (explain step-by-step when asked)

1. **Buyer submits project details** — taps Request Quote → opens Messages with the seller. Buyer describes goals, scope, timeline, budget if known.
2. **Seller reviews requirements** — asks clarifying questions in Messages.
3. **Seller provides a quote** — sends a **formal quote** in chat (amount + scope).
4. **Buyer accepts or declines** — accepts if happy, or negotiates further in Messages.
5. **Payment is arranged** — buyer pays through Sky Drop (Stripe) after accepting the quote, or as agreed for Arrange Purchase services.
6. **Work begins** — seller delivers; buyer tracks progress in Messages. Keep communication on Sky Drop.

Request Quote avoids messy Offer → Counter-offer chains — the quote **is** the negotiation.

---

### FEATURE EDUCATION (explain when users ask)

**Watchlists** — save listings to compare or buy later. Heart icon on cards → **Watchlist** page.

**Messages** — all buyer–seller chat. Offers, quotes, purchase coordination, bank details (Arrange). Stay here — don't move to random DMs.

**Offers** — buyer proposes a price below asking. Seller accepts/counters/declines. Disabled on Request Quote services.

**Auctions** — timed bidding; highest bidder wins when time ends. Pay via Stripe if you win.

**Referrals** — your **referral code** is on **Profile**. Share it; when friends sign up and verify, you earn **Drop Tokens** (dashboard rewards).

**Following sellers** — on a seller's profile (\`/seller/[username]\`), tap Follow to stay updated on their listings.

**Service listings** — browse **Services**; filter by category. Professional badges show pricing expectations upfront.

**Arrange Purchase** — no card at checkout. Buyer and seller agree payment privately in Messages. Seller should save bank details in Profile so buyers can copy them. Best for local pickup, cash, or bank transfer.

**Stripe Checkout** — instant card payment. Seller connects Stripe in Profile. Buyer protection fee $1. Disputes via **Purchases** within 7 days of delivery.

**Trade feed** (\`/trade-feed\`) — live marketplace activity.

**Dashboard** (\`/dashboard\`) — stats, XP, tokens, seller progress.

**Promote listing** — optional $5 boost for ~7 days better search placement.

---

### MARKETPLACE COACH — "I've never sold online before"

**Turn 1 only:** ask what they want to sell (Physical · Digital · Service · Rental · Vehicle). Stop. Wait.

**Turn 2:** ask if they have photos or want help drafting. Stop. Wait.

**Turn 3+:** gather description → LISTING_FILL. Then compact pricing. Never list all steps in one message.

---

### PHRASES TO AVOID
- Never say **escrow**, **funds held**, or **money held by Sky Drop**
- Say instead: "pay by card through Stripe" or "arrange payment in Messages"

### WHEN USERS ASK PLATFORM QUESTIONS
- **Answer the question in the first sentence** — define what it is or how it works directly
- Then offer one helpful follow-up (buying, selling, or step-by-step) — never open with "I can help you sell, buy..."
- Numbered steps only when user asks for full detail — max 4 steps per message
- Link to the right page with [[NAV:/path]] when helpful
- You cannot see their account data — direct to Purchases, Sales, Messages, Profile
`.trim();

export type PlatformGuideTopic =
  | "request_quote"
  | "new_seller"
  | "offers_auctions"
  | "offers"
  | "auctions"
  | "service_pricing"
  | "selling"
  | "buying"
  | "watchlist"
  | "messages"
  | "arranged_purchase"
  | "referrals"
  | "following"
  | "payments";

function normalizeQuery(message: string): string {
  return message.toLowerCase().replace(/[^\w\s'?]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectPlatformGuideTopic(message: string): PlatformGuideTopic | null {
  const q = normalizeQuery(message);

  if (
    /\b(request quote|quote required)\b/.test(q) &&
    /\b(how|work|what|explain|process|flow)\b/.test(q)
  ) {
    return "request_quote";
  }
  if (/\brequest quote\b/.test(q) && q.length < 80) return "request_quote";

  if (
    /\b(never sold|first time sell|new to sell|never listed|beginner seller|start selling)\b/.test(q) ||
    /\b(i've|i have) never (sold|listed)\b/.test(q)
  ) {
    return "new_seller";
  }

  if (/\boffer/.test(q) && /\bauction/.test(q) && /\bhow\b/.test(q)) {
    return "offers_auctions";
  }

  if (/\b(how do|how does|what are)\b.*\boffer/.test(q) || (/\bmake offer\b/.test(q) && /\bhow\b/.test(q))) {
    return "offers";
  }

  if (/\b(how do|how does|what is)\b.*\bauction/.test(q) || (/\bbid\b/.test(q) && /\bhow\b/.test(q))) {
    return "auctions";
  }

  if (
    /\b(fixed price|starting at|request quote|service pricing|service listing)\b/.test(q) &&
    /\b(how|what|difference|explain|work)\b/.test(q)
  ) {
    return "service_pricing";
  }

  if (/\b(how to sell|how do i sell|create listing|make a listing|list an item)\b/.test(q)) {
    return "selling";
  }

  if (/\b(how to buy|how do i buy|purchase item|find item)\b/.test(q)) {
    return "buying";
  }

  if (/\bwatchlist\b/.test(q) && /\b(how|what|work)\b/.test(q)) return "watchlist";
  if (/\barrange purchase\b/.test(q) && /\bwhat\b/.test(q)) return "arranged_purchase";
  if (/\bmessages?\b/.test(q) && /\b(how|what|work|use)\b/.test(q)) return "messages";
  if (/\barrange purchase\b/.test(q) && /\b(how|what|work)\b/.test(q)) return "arranged_purchase";
  if (/\breferral\b/.test(q)) return "referrals";
  if (/\bfollow(ing)?\s+(seller|user)\b/.test(q)) return "following";
  if (
    /\b(stripe|arrange purchase|payment type|how to pay|how do i pay|buyer protection)\b/.test(q) &&
    /\b(how|what|difference|work)\b/.test(q)
  ) {
    return "payments";
  }

  return null;
}

export function getPlatformGuideReply(topic: PlatformGuideTopic): {
  text: string;
  navigateTo?: string;
} {
  switch (topic) {
    case "request_quote":
      return {
        text: `**Request Quote** is for custom services where price depends on scope.

1. Buyer taps **Request Quote** on your listing → opens Messages
2. Buyer describes goals, scope, timeline, and budget if they have one
3. You send a **formal quote** in chat (price + what's included)
4. Buyer accepts → pays through Sky Drop → work begins

Want me to walk through it step by step, or help you list a Request Quote service?`,
      };

    case "new_seller":
      return {
        text: NEW_SELLER_INTRO,
      };

    case "offers_auctions":
      return {
        text: `**Offers** — buyers propose a price; you accept, counter, or decline in Messages.

**Auctions** — timed bidding; highest bid wins and pays by card.

Setting up a listing, or trying to buy something?`,
      };

    case "offers":
      return {
        text: `Offers let buyers propose a lower price. You accept, counter, or decline in Messages — not used on Request Quote services.

Want the quick buyer/seller flow, or help enabling offers on your listing?`,
      };

    case "auctions":
      return {
        text: `An auction is a timed listing where buyers bid against each other and the highest bidder wins when time ends — you set starting bid, duration, and optional reserve; winner pays by card.

Are you listing something at auction, or bidding on one?`,
      };

    case "service_pricing":
      return {
        text: `Three options: **Fixed Price** (set price), **Starting At** (minimum shown), **Request Quote** (custom scope in Messages).

Which fits what you're offering? I can help you pick and list it.`,
      };

    case "selling":
      return {
        text: `Selling starts on **Sell** — pick your type, add photos, set title, price, and publish.

What are you selling? I'll guide you through it.`,
      };

    case "buying":
      return {
        text: `Browse or ask me to search → Message or Buy Now on a listing → pay by card (Stripe) or arrange payment in Messages.

Looking for something specific?`,
      };

    case "watchlist":
      return {
        text: `Your watchlist saves listings you want to track — tap ♡ on any card, then view them all on **Watchlist**.

Tracking something in particular?`,
        navigateTo: "/watchlist",
      };

    case "messages":
      return {
        text: `Messages is where all buyer–seller chat happens — offers, quotes, payment, pickup.

Buying or selling something right now?`,
      };

    case "arranged_purchase":
      return {
        text: `Arrange Purchase means no card checkout — buyer taps Purchase, you agree price and payment (bank transfer, cash, etc.) in Messages.

Setting that up as a seller, or buying something?`,
      };

    case "referrals":
      return {
        text: `Your referral code is on Profile — share it and earn Drop Tokens when friends verify.

Want help finding it?`,
      };

    case "following":
      return {
        text: `Follow sellers from their profile page to keep track of their listings.

Found someone you like?`,
      };

    case "payments":
      return {
        text: `**Stripe Checkout** — pay by card at Buy Now. **Arrange Purchase** — agree bank transfer or cash in Messages.

Are you buying or setting up how you get paid as a seller?`,
      };

    default:
      return { text: "" };
  }
}

export function tryPlatformGuideReply(
  message: string,
  history: SkyAiHistoryItem[] = []
): {
  text: string;
  navigateTo?: string;
} | null {
  const topic = detectPlatformGuideTopic(message);
  if (!topic) return null;

  if (
    topic === "new_seller" &&
    (hasConversationStarted(history) || isCoachFlowActive(history))
  ) {
    return null;
  }

  const reply = getPlatformGuideReply(topic);
  if (!reply.text) return null;
  return reply;
}
