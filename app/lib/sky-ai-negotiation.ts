/**
 * Negotiation coach — rule-based guidance without inventing market data.
 */

import type { SkyAiListingContext } from "./sky-ai-types";

export function tryNegotiationReply(
  message: string,
  listingContext: SkyAiListingContext | null
): { text: string } | null {
  const q = message.trim().toLowerCase();
  if (
    !/\b(counter( |-)offer|should i offer|how much should i offer|negotiat|lower (the )?price|walk away|accept (this )?offer|they offered|buyer offered|seller offered|fair offer)\b/.test(
      q
    )
  ) {
    return null;
  }

  const listedPrice = listingContext?.price
    ? `The listing shows **$${Number(String(listingContext.price).replace(/[^0-9.]/g, "")).toLocaleString()}** NZD. `
    : "";

  if (/\bwalk away\b/.test(q)) {
    return {
      text: `${listedPrice}Walk away if the seller won't stay on Sky Drop, rushes off-platform payment, or the deal feels wrong.

For Stripe listings, you're protected when you pay through **Buy Now**. For **Arrange Purchase**, only agree payment after terms are clear in Messages.`,
    };
  }

  if (/\b(counter|lower|offer)\b/.test(q)) {
    return {
      text: `${listedPrice}On Sky Drop, send offers in **Messages** so there's a record.

**Practical approach:**
1. Start with a fair reason — condition, pickup timing, or comparable listings you've seen
2. Counter once or twice — avoid lowballing so sellers stay engaged
3. Accept when price + pickup/delivery works for you

Want help pricing this item against similar Sky Drop listings? Ask "what's a fair price for [item]".`,
    };
  }

  return {
    text: `${listedPrice}Keep negotiation in **Messages** on Sky Drop — accept, counter, or decline offers there.

If you're buying, only pay through **Buy Now** (Stripe) or agreed **Arrange Purchase** terms in chat. Never pay before you've agreed pickup or delivery.`,
  };
}
