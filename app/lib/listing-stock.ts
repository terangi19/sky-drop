import { FieldValue } from "firebase-admin/firestore";

/** True when listing.stockQuantity is set on the document. */
export function listingTracksStock(listing: Record<string, unknown>): boolean {
  const stock = listing.stockQuantity;
  return stock != null && stock !== "";
}

export function listingStockCount(listing: Record<string, unknown>): number | null {
  if (!listingTracksStock(listing)) return null;
  const qty = Number(listing.stockQuantity);
  return Number.isFinite(qty) ? qty : 0;
}

/** Can a buyer complete a purchase right now? */
export function isListingAvailableForPurchase(listing: Record<string, unknown>): boolean {
  const stock = listingStockCount(listing);
  if (stock !== null) return stock > 0;
  return listing.status !== "sold";
}

export function assertListingAvailableForPurchase(listing: Record<string, unknown>): void {
  const stock = listingStockCount(listing);
  if (stock !== null) {
    if (stock <= 0) throw new Error("This item is out of stock");
    return;
  }
  if (listing.status === "sold") throw new Error("This listing has already been sold");
}

export type ListingSaleUpdateOptions = {
  isRental?: boolean;
  soldTo?: string;
  useServerTimestamp?: boolean;
};

/**
 * After one unit is sold: decrement stock, or mark listing sold when stock hits 0 / no stock field.
 */
export function buildListingUpdateAfterSale(
  listing: Record<string, unknown>,
  options: ListingSaleUpdateOptions = {}
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const stock = listingStockCount(listing);

  if (stock !== null) {
    const remaining = stock - 1;
    update.stockQuantity = remaining;
    if (remaining > 0) {
      // Keep listing live while units remain (fix mistaken sold status from older flows)
      update.status = "live";
      update.soldTo = FieldValue.delete();
      update.soldAt = FieldValue.delete();
    } else if (!options.isRental) {
      update.status = "sold";
      if (options.soldTo) update.soldTo = options.soldTo;
      update.soldAt = options.useServerTimestamp
        ? FieldValue.serverTimestamp()
        : new Date();
    }
    return update;
  }

  if (!options.isRental) {
    update.status = "sold";
    if (options.soldTo) update.soldTo = options.soldTo;
    update.soldAt = options.useServerTimestamp
      ? FieldValue.serverTimestamp()
      : new Date();
  }
  return update;
}
