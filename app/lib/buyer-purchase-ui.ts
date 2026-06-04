import {
  listingStockCount,
  listingTracksStock,
  type ListingAvailabilityFields,
} from "./listing-availability";
import {
  countsAsBuyerPurchase,
  isArrangeRequestPending,
} from "./arrange-purchase-status";

export type BuyerPurchaseRecord = {
  status?: string;
  paymentType?: string;
};

/** Count purchases where stock was committed (not open arrange requests). */
export function countBuyerPurchasedQuantity(
  purchases: BuyerPurchaseRecord[]
): number {
  return purchases.filter((p) =>
    countsAsBuyerPurchase(
      String(p.status || ""),
      String(p.paymentType || "")
    )
  ).length;
}

export function countBuyerArrangeRequests(
  purchases: BuyerPurchaseRecord[]
): number {
  return purchases.filter((p) =>
    isArrangeRequestPending(String(p.status || ""))
  ).length;
}

export type BuyerPurchaseUiState = {
  buyerPurchasedQuantity: number;
  arrangeRequestCount: number;
  remainingStock: number | null;
  canPurchaseMore: boolean;
  showPurchasedBanner: boolean;
  bannerText: string | null;
};

export type ListingPurchaseLimitFields = ListingAvailabilityFields & {
  /** When true, each buyer may only complete one purchase (even if stock > 1). */
  onePerBuyer?: boolean;
};

export function getBuyerPurchaseUiState(
  listing: ListingPurchaseLimitFields | null | undefined,
  buyerPurchasedQuantity: number,
  arrangeRequestCount = 0
): BuyerPurchaseUiState {
  const remainingStock = listing ? listingStockCount(listing) : null;
  const tracksStock = listing ? listingTracksStock(listing) : false;
  const onePerBuyer = Boolean(listing?.onePerBuyer);

  const base = {
    buyerPurchasedQuantity,
    arrangeRequestCount,
    remainingStock,
    canPurchaseMore: false,
    showPurchasedBanner: false,
    bannerText: null as string | null,
  };

  if (!listing) return base;

  if (!tracksStock) {
    const soldOut = listing.status === "sold";
    const purchased = buyerPurchasedQuantity > 0 || soldOut;
    const hasRequest = arrangeRequestCount > 0 && !purchased;
    return {
      ...base,
      remainingStock: null,
      canPurchaseMore: !soldOut && buyerPurchasedQuantity === 0 && arrangeRequestCount === 0,
      showPurchasedBanner: purchased || hasRequest,
      bannerText: purchased
        ? "You purchased this item"
        : hasRequest
          ? "You've requested to purchase this item"
          : null,
    };
  }

  const stock = remainingStock ?? 0;
  const totalAvailable = stock + buyerPurchasedQuantity;

  if (stock <= 0) {
    const hasRequest = arrangeRequestCount > 0 && buyerPurchasedQuantity === 0;
    return {
      ...base,
      remainingStock: 0,
      canPurchaseMore: false,
      showPurchasedBanner: buyerPurchasedQuantity > 0 || hasRequest,
      bannerText:
        buyerPurchasedQuantity > 0
          ? totalAvailable <= 1
            ? "You purchased this item"
            : `You've purchased ${buyerPurchasedQuantity} of ${totalAvailable} available`
          : hasRequest
            ? "You've requested to purchase this item"
            : null,
    };
  }

  const hitOnePerBuyer =
    onePerBuyer && (buyerPurchasedQuantity >= 1 || arrangeRequestCount >= 1);
  const hitSingleUnit = totalAvailable <= 1 && buyerPurchasedQuantity >= 1;
  const hasRequest = arrangeRequestCount > 0 && buyerPurchasedQuantity === 0;

  const canPurchaseMore =
    !hitOnePerBuyer && !hitSingleUnit && arrangeRequestCount === 0;

  let bannerText: string | null = null;
  if (buyerPurchasedQuantity > 0) {
    if (totalAvailable <= 1) {
      bannerText = "You purchased this item";
    } else {
      bannerText = `You've purchased ${buyerPurchasedQuantity} of ${totalAvailable} available`;
    }
  } else if (hasRequest) {
    bannerText = "You've requested to purchase this item";
  }

  return {
    buyerPurchasedQuantity,
    arrangeRequestCount,
    remainingStock: stock,
    canPurchaseMore,
    showPurchasedBanner: buyerPurchasedQuantity > 0 || hasRequest,
    bannerText,
  };
}
