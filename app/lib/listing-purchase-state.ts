import {
  countsAsBuyerPurchase,
  isArrangeRequestPending,
} from "./arrange-purchase-status";
import {
  getBuyerPurchaseUiState,
  type ListingPurchaseLimitFields,
} from "./buyer-purchase-ui";

export type ListingOrderSlice = {
  id?: string;
  buyerId?: string;
  buyerEmail?: string;
  sellerId?: string;
  sellerEmail?: string;
  status?: string;
  paymentType?: string;
  total?: number;
  refundAmount?: number;
  refundedAt?: unknown;
};

export type ListingViewerRole = "guest" | "buyer" | "seller" | "public";

export type ListingPurchaseViewState = {
  role: ListingViewerRole;
  hasActiveOrder: boolean;
  primaryOrder: ListingOrderSlice | null;
  showOrderStatusSection: boolean;
  orderStatusLabel: string | null;
  showBuyerPurchasedBanner: boolean;
  showBuyerRefundedBanner: boolean;
  buyerBannerText: string | null;
  showSellerSoldUi: boolean;
  showSellerRefundedBanner: boolean;
  showPublicSoldUi: boolean;
  hidePaymentMethodSection: boolean;
  hideBuyerPurchaseCta: boolean;
  canPurchaseMore: boolean;
};

export function matchesBuyer(
  order: ListingOrderSlice,
  uid?: string | null,
  email?: string | null
): boolean {
  if (uid && order.buyerId && order.buyerId === uid) return true;
  if (
    email &&
    order.buyerEmail &&
    order.buyerEmail.toLowerCase() === email.toLowerCase()
  ) {
    return true;
  }
  return false;
}

export function matchesListingSeller(
  listing: { sellerId?: string; sellerEmail?: string; userId?: string },
  uid?: string | null,
  email?: string | null
): boolean {
  if (uid && listing.sellerId && listing.sellerId === uid) return true;
  if (uid && listing.userId && listing.userId === uid) return true;
  if (
    email &&
    listing.sellerEmail &&
    listing.sellerEmail.toLowerCase() === email.toLowerCase()
  ) {
    return true;
  }
  return false;
}

export function isCompletedListingOrder(order: ListingOrderSlice): boolean {
  return countsAsBuyerPurchase(
    String(order.status || ""),
    String(order.paymentType || "")
  );
}

export function formatOrderStatusLabel(status?: string): string {
  const s = String(status || "pending").toLowerCase();
  switch (s) {
    case "pending":
      return "Order confirmed — awaiting next step";
    case "seller_confirming":
      return "Seller is confirming the sale";
    case "awaiting_payment":
      return "Awaiting payment";
    case "shipped":
      return "Shipped";
    case "delivered":
    case "completed":
      return "Delivered";
    case "in_progress":
      return "In progress";
    case "rented":
      return "Rental active";
    case "returned":
      return "Rental returned";
    case "arrange_requested":
      return "Purchase request sent";
    case "payment_failed":
      return "Payment failed";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Fully refunded";
    default:
      return "Order in progress";
  }
}

function listingIsSold(listing: ListingPurchaseLimitFields | null | undefined): boolean {
  if (!listing) return false;
  return listing.status === "sold";
}

export function resolveListingViewerRole(
  listing: { sellerId?: string; sellerEmail?: string } | null | undefined,
  uid?: string | null,
  email?: string | null,
  listingOrders: ListingOrderSlice[] = []
): ListingViewerRole {
  if (!uid && !email) return "guest";
  if (listing && matchesListingSeller(listing, uid, email)) return "seller";
  if (listingOrders.some((o) => matchesBuyer(o, uid, email))) return "buyer";
  if (uid || email) return "public";
  return "guest";
}

function isRefundedOrder(order: ListingOrderSlice): boolean {
  return String(order.status || "").toLowerCase() === "refunded";
}

export function getListingPurchaseViewState(opts: {
  listing: ListingPurchaseLimitFields | null | undefined;
  userUid?: string | null;
  userEmail?: string | null;
  listingSellerId?: string | null;
  listingSellerEmail?: string | null;
  buyerPurchasedQuantity: number;
  arrangeRequestCount: number;
  listingOrders: ListingOrderSlice[];
}): ListingPurchaseViewState {
  const {
    listing,
    userUid,
    userEmail,
    listingSellerId,
    listingSellerEmail,
    buyerPurchasedQuantity,
    arrangeRequestCount,
    listingOrders,
  } = opts;

  const sellerListing = {
    sellerId: listingSellerId || undefined,
    sellerEmail: listingSellerEmail || undefined,
  };

  const role = resolveListingViewerRole(
    sellerListing,
    userUid,
    userEmail,
    listingOrders
  );

  const completedOrders = listingOrders.filter(isCompletedListingOrder);
  const refundedOrders = listingOrders.filter(isRefundedOrder);
  const soldListing = listingIsSold(listing);
  const hasActiveOrder = completedOrders.length > 0 || soldListing;
  const hasRefundedOrder = refundedOrders.length > 0;

  const buyerRefundedOrder =
    listingOrders.find(
      (o) => matchesBuyer(o, userUid, userEmail) && isRefundedOrder(o)
    ) ?? null;

  const buyerOrder =
    buyerRefundedOrder ??
    listingOrders.find(
      (o) =>
        matchesBuyer(o, userUid, userEmail) &&
        (isCompletedListingOrder(o) || isArrangeRequestPending(String(o.status || "")))
    ) ??
    null;

  const primaryOrder =
    role === "seller"
      ? completedOrders[0] ?? refundedOrders[0] ?? listingOrders[0] ?? null
      : buyerOrder;

  const buyerUi = getBuyerPurchaseUiState(
    listing,
    buyerPurchasedQuantity,
    arrangeRequestCount
  );

  const hideBuyerPurchaseCta =
    role === "seller" ||
    role === "public" ||
    role === "guest" ||
    hasActiveOrder ||
    hasRefundedOrder ||
    (buyerPurchasedQuantity === 0 &&
      arrangeRequestCount === 0 &&
      !buyerUi.canPurchaseMore);

  const showBuyerRefundedBanner =
    role === "buyer" && !!buyerRefundedOrder;
  const showSellerRefundedBanner =
    role === "seller" && refundedOrders.length > 0;

  const showBuyerPurchasedBanner =
    role === "buyer" &&
    !showBuyerRefundedBanner &&
    buyerUi.showPurchasedBanner &&
    !!buyerUi.bannerText;

  const showSellerSoldUi = role === "seller" && hasActiveOrder && !showSellerRefundedBanner;
  const showPublicSoldUi =
    (role === "public" || role === "guest") && hasActiveOrder;

  const showOrderStatusSection =
    showBuyerPurchasedBanner ||
    showBuyerRefundedBanner ||
    showSellerRefundedBanner ||
    showSellerSoldUi ||
    showPublicSoldUi;

  const orderStatusLabel = primaryOrder && isRefundedOrder(primaryOrder)
    ? "This order has been fully refunded"
    : primaryOrder
    ? formatOrderStatusLabel(primaryOrder.status)
    : soldListing
      ? "This listing is no longer available"
      : null;

  return {
    role,
    hasActiveOrder: hasActiveOrder || hasRefundedOrder,
    primaryOrder,
    showOrderStatusSection,
    orderStatusLabel,
    showBuyerPurchasedBanner,
    showBuyerRefundedBanner,
    buyerBannerText: showBuyerPurchasedBanner ? buyerUi.bannerText : null,
    showSellerSoldUi,
    showSellerRefundedBanner,
    showPublicSoldUi,
    hidePaymentMethodSection: hasActiveOrder || hasRefundedOrder,
    hideBuyerPurchaseCta,
    canPurchaseMore:
      role === "buyer" &&
      buyerUi.canPurchaseMore &&
      !hasActiveOrder &&
      !showBuyerRefundedBanner,
  };
}
