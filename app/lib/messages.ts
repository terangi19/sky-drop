import { sellerMessagesUrl, type SellerLinkFields } from "./public-display";

export function getMessagesUrl(
  seller: SellerLinkFields,
  listingId?: string
) {
  return sellerMessagesUrl(seller, listingId);
}
