/**
 * Direct marketplace Q&A — answer first, then offer help.
 * Used before generic capability fallbacks.
 */

import type { SkyAiHistoryItem } from "./sky-ai-types";

export type MarketplaceKnowledgeTopic =
  | "sky_drop"
  | "listings"
  | "auctions"
  | "offers"
  | "services"
  | "rentals"
  | "watchlist"
  | "purchases"
  | "messages"
  | "seller_profiles"
  | "safety"
  | "arrange_purchase"
  | "stripe_checkout"
  | "request_quote";

function normalize(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^\w\s'?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDirectQuestion(q: string): boolean {
  return (
    /^(what|who|how|where|when|why|can|do|does|is|are)\b/.test(q) ||
    /\b(what is|what are|what's|how do|how does|how to|tell me about|explain)\b/.test(q)
  );
}

export function detectMarketplaceQuestion(message: string): MarketplaceKnowledgeTopic | null {
  const q = normalize(message);
  if (!q || q.length < 4) return null;

  if (
    /\b(what is|what's|tell me about|explain)\b.*\bsky drop\b/.test(q) ||
    /^what is sky drop\??$/.test(q) ||
    (/\bsky drop\b/.test(q) && /\b(what is|how does it work)\b/.test(q))
  ) {
    return "sky_drop";
  }

  if (
    /\b(what is|what are|how do|how does|explain)\b.*\bauction/.test(q) ||
    (/\bauction/.test(q) && isDirectQuestion(q))
  ) {
    return "auctions";
  }

  if (
    /\b(what is|what are|how do|how does|explain)\b.*\boffer/.test(q) ||
    (/\bmake offer\b/.test(q) && isDirectQuestion(q))
  ) {
    return "offers";
  }

  if (
    /\b(what is|what are|how do|how does|explain)\b.*\bwatch\s*list/.test(q) ||
    /\bwatchlist\b/.test(q)
  ) {
    return "watchlist";
  }

  if (
    /\b(what is|what's|how does|explain)\b.*\barrange purchase/.test(q) ||
    (/\barrange purchase\b/.test(q) && isDirectQuestion(q))
  ) {
    return "arrange_purchase";
  }

  if (
    /\b(what is|what's|how does|explain)\b.*\bstripe/.test(q) ||
    /\bstripe checkout\b/.test(q)
  ) {
    return "stripe_checkout";
  }

  if (
    /\b(what is|how does|explain)\b.*\brequest quote/.test(q) ||
    (/\brequest quote\b/.test(q) && isDirectQuestion(q))
  ) {
    return "request_quote";
  }

  if (
    /\b(what is|what are|how do|how does)\b.*\b(service|services)\b/.test(q) ||
    (q.includes("service") && /\bhow\b/.test(q) && /\bwork/.test(q))
  ) {
    return "services";
  }

  if (
    /\b(what is|what are|how do|how does)\b.*\brental/.test(q) ||
    (/\brentals?\b/.test(q) && isDirectQuestion(q))
  ) {
    return "rentals";
  }

  if (
    /\b(what is|how do|how does)\b.*\blisting/.test(q) ||
    /\bcreate (a )?listing\b/.test(q) && /\bhow\b/.test(q)
  ) {
    return "listings";
  }

  if (
    /\b(what is|where is|how do)\b.*\bpurchases?\b/.test(q) ||
    /\bmy purchases\b/.test(q)
  ) {
    return "purchases";
  }

  if (
    /\b(what is|what are|how do|how does)\b.*\bmessages?\b/.test(q) ||
    (/\bmessages?\b/.test(q) && isDirectQuestion(q) && !/\barrange/.test(q))
  ) {
    return "messages";
  }

  if (
    /\b(what is|how do)\b.*\bseller profile/.test(q) ||
    /\bfollow(ing)?\s+(a )?seller/.test(q) ||
    /\bseller profile\b/.test(q)
  ) {
    return "seller_profiles";
  }

  if (
    /\b(safety|scam|trust|buyer protection|seller protection|stay safe)\b/.test(q) &&
    isDirectQuestion(q)
  ) {
    return "safety";
  }

  return null;
}

export function getMarketplaceKnowledgeReply(topic: MarketplaceKnowledgeTopic): {
  text: string;
  navigateTo?: string;
} {
  switch (topic) {
    case "sky_drop":
      return {
        text: `Sky Drop is a New Zealand marketplace where people buy and sell physical items, vehicles, services, rentals, and digital products — with Stripe card checkout or Arrange Purchase agreed in Messages.

Would you like help buying, selling, or creating a listing?`,
        navigateTo: "/about",
      };

    case "listings":
      return {
        text: `A listing is your item or service on Sky Drop — title, photos, price, and category. Create one on **Sell** (\`/post/ai\`); Āwhina can fill the form from a short description or photos.

What are you looking to list?`,
        navigateTo: "/post/ai",
      };

    case "auctions":
      return {
        text: `An auction is a timed listing where buyers place bids and the highest bidder wins when time runs out. You set a starting bid, duration, and optional reserve price; the winner pays by card through Stripe.

Are you setting up an auction or bidding on one?`,
      };

    case "offers":
      return {
        text: `An offer lets a buyer propose a price below your asking price. You accept, counter, or decline in **Messages** — offers aren't used on Request Quote services.

Want help making an offer, or enabling offers on your listing?`,
      };

    case "services":
      return {
        text: `Services on Sky Drop are professional listings — design, trades, coaching, and more. Sellers choose **Fixed Price**, **Starting At**, or **Request Quote** depending on how custom the work is.

Browse at **Services**, or want help listing your own service?`,
        navigateTo: "/services",
      };

    case "rentals":
      return {
        text: `Rentals let you hire out items or property by the day, week, or month — tools, gear, vehicles, and more. Set daily/weekly rates and pickup location on a rental listing.

Looking to rent something, or list your own?`,
        navigateTo: "/rentals",
      };

    case "watchlist":
      return {
        text: `Your watchlist saves listings you're interested in — tap ♡ on any card, then view them all on **Watchlist**. Handy for tracking price drops or deciding later.

Want help finding something to save?`,
        navigateTo: "/watchlist",
      };

    case "purchases":
      return {
        text: `**Purchases** is where buyers track Stripe orders — payment status, delivery, and disputes (within 7 days of delivery). Arrange Purchase sales are coordinated in Messages, not card checkout.

Need help with a specific order?`,
        navigateTo: "/purchases",
      };

    case "messages":
      return {
        text: `**Messages** is Sky Drop's buyer–seller inbox — offers, Request Quote, Arrange Purchase, pickup, and payment details all stay here so there's a record if something goes wrong.

Buying or selling something right now?`,
        navigateTo: "/messages",
      };

    case "seller_profiles":
      return {
        text: `Every seller has a public profile (\`/seller/username\`) showing their listings, reviews, and verification. You can **Follow** sellers to keep track of what they list.

Looking for a seller, or setting up your own profile?`,
        navigateTo: "/profile",
      };

    case "safety":
      return {
        text: `Stay safe on Sky Drop by keeping chat and card payments on-platform — use **Buy Now** (Stripe) for card protection, or agree Arrange Purchase terms clearly in Messages. Never pay via gift cards, crypto, or off-platform links.

Want buyer tips, seller tips, or help reviewing a suspicious message?`,
        navigateTo: "/buyer-protection",
      };

    case "arrange_purchase":
      return {
        text: `**Arrange Purchase** means no card at checkout — the buyer taps **Purchase**, you agree price and payment (bank transfer, cash, pickup) in **Messages**. Sellers can add bank details in Profile → Payment settings.

Setting that up as a seller, or buying something listed that way?`,
      };

    case "stripe_checkout":
      return {
        text: `**Stripe Checkout** is Sky Drop's card payment — tap **Buy Now**, pay by card, and funds go to the seller's Stripe account. A $1 buyer protection fee is added; disputes can be opened from **Purchases** within 7 days of delivery.

Buying something now, or connecting Stripe to sell?`,
      };

    case "request_quote":
      return {
        text: `**Request Quote** is for custom services — the buyer describes their project in **Messages**, you send a formal quote (price + scope), they accept, then pay through Sky Drop.

Want the step-by-step flow, or help listing a Request Quote service?`,
        navigateTo: "/services",
      };

    default:
      return { text: "" };
  }
}

export function tryMarketplaceKnowledgeReply(
  message: string,
  _history?: SkyAiHistoryItem[]
): { text: string; navigateTo?: string } | null {
  const topic = detectMarketplaceQuestion(message);
  if (!topic) return null;
  const reply = getMarketplaceKnowledgeReply(topic);
  if (!reply.text.trim()) return null;
  return reply;
}
