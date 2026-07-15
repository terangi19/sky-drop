import { describe, expect, it } from "vitest";
import {
  getListingPurchaseViewState,
  matchesBuyer,
  matchesListingSeller,
  resolveListingViewerRole,
} from "./listing-purchase-state";

describe("listing-purchase-state", () => {
  it("identifies seller by uid", () => {
    expect(
      matchesListingSeller({ sellerId: "s1" }, "s1", "seller@test.com")
    ).toBe(true);
  });

  it("identifies buyer by buyerId", () => {
    expect(
      matchesBuyer({ buyerId: "b1", buyerEmail: "b@test.com" }, "b1", null)
    ).toBe(true);
  });

  it("seller viewing sold listing never gets buyer banner", () => {
    const state = getListingPurchaseViewState({
      listing: { status: "sold" },
      userUid: "seller-uid",
      userEmail: "seller@test.com",
      listingSellerId: "seller-uid",
      listingSellerEmail: "seller@test.com",
      buyerPurchasedQuantity: 0,
      arrangeRequestCount: 0,
      listingOrders: [
        {
          buyerId: "buyer-uid",
          buyerEmail: "buyer@test.com",
          status: "pending",
          paymentType: "stripe",
        },
      ],
    });

    expect(state.role).toBe("seller");
    expect(state.showBuyerPurchasedBanner).toBe(false);
    expect(state.showSellerSoldUi).toBe(true);
    expect(state.hidePaymentMethodSection).toBe(true);
  });

  it("buyer sees purchased banner", () => {
    const state = getListingPurchaseViewState({
      listing: { status: "sold" },
      userUid: "buyer-uid",
      userEmail: "buyer@test.com",
      listingSellerId: "seller-uid",
      listingSellerEmail: "seller@test.com",
      buyerPurchasedQuantity: 1,
      arrangeRequestCount: 0,
      listingOrders: [
        {
          buyerId: "buyer-uid",
          buyerEmail: "buyer@test.com",
          status: "pending",
          paymentType: "stripe",
        },
      ],
    });

    expect(state.role).toBe("buyer");
    expect(state.showBuyerPurchasedBanner).toBe(true);
    expect(state.buyerBannerText).toBe("You purchased this item");
    expect(state.hidePaymentMethodSection).toBe(true);
  });

  it("buyer sees refunded banner after full Stripe refund", () => {
    const state = getListingPurchaseViewState({
      listing: { status: "sold" },
      userUid: "buyer-uid",
      userEmail: "buyer@test.com",
      listingSellerId: "seller-uid",
      listingSellerEmail: "seller@test.com",
      buyerPurchasedQuantity: 0,
      arrangeRequestCount: 0,
      listingOrders: [
        {
          buyerId: "buyer-uid",
          buyerEmail: "buyer@test.com",
          status: "refunded",
          paymentType: "stripe",
        },
      ],
    });

    expect(state.role).toBe("buyer");
    expect(state.showBuyerRefundedBanner).toBe(true);
    expect(state.showBuyerPurchasedBanner).toBe(false);
    expect(state.buyerBannerText).toBeNull();
    expect(state.orderStatusLabel).toBe("This order has been fully refunded");
  });

  it("first-time signed-in viewer is buyer and can purchase", () => {
    const state = getListingPurchaseViewState({
      listing: { status: "active" },
      userUid: "new-buyer-uid",
      userEmail: "newbuyer@test.com",
      listingSellerId: "seller-uid",
      listingSellerEmail: "seller@test.com",
      buyerPurchasedQuantity: 0,
      arrangeRequestCount: 0,
      listingOrders: [],
    });

    expect(state.role).toBe("buyer");
    expect(state.hideBuyerPurchaseCta).toBe(false);
    expect(state.canPurchaseMore).toBe(true);
    expect(state.hasActiveOrder).toBe(false);
  });

  it("signed-in stranger viewing sold listing sees public sold ui not purchase cta", () => {
    const state = getListingPurchaseViewState({
      listing: { status: "sold" },
      userUid: "stranger-uid",
      userEmail: "stranger@test.com",
      listingSellerId: "seller-uid",
      listingSellerEmail: "seller@test.com",
      buyerPurchasedQuantity: 0,
      arrangeRequestCount: 0,
      listingOrders: [
        {
          buyerId: "other-uid",
          buyerEmail: "other@test.com",
          status: "delivered",
          paymentType: "stripe",
        },
      ],
    });

    expect(state.role).toBe("buyer");
    expect(state.showPublicSoldUi).toBe(true);
    expect(state.hideBuyerPurchaseCta).toBe(true);
    expect(state.canPurchaseMore).toBe(false);
  });
});
