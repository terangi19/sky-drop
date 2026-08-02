import { sellerMessagesUrl, type SellerLinkFields } from "./public-display";
import { isStripeCheckoutVisibleClient } from "./stripe-checkout-flags";

/** Deep-link into Messages with listing context preserved for V1 Message Seller. */
export function listingMessageSellerHref(
  item: SellerLinkFields & {
    id?: string;
    title?: string;
    price?: string | number;
    images?: string[];
    imageUrl?: string;
    image?: string;
  },
  source?: string
): string {
  const listingId = item.id || null;
  const image =
    item.images?.[0] || item.imageUrl || item.image || "";
  return sellerMessagesUrl(item, listingId, {
    title: item.title || "",
    price: item.price != null ? String(item.price) : "",
    image,
    source: source || "listing",
  });
}

/** Card / home Buy handlers: message when checkout UI off, else ?buy=1 listing deep link. */
export function listingPrimaryActionHref(
  item: SellerLinkFields & { id: string; title?: string; price?: string | number; images?: string[]; imageUrl?: string }
): string {
  if (!isStripeCheckoutVisibleClient()) {
    return listingMessageSellerHref(item, "card");
  }
  return `/post/listing/${item.id}?buy=1`;
}
