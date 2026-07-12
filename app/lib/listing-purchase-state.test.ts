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

  it("public viewer sees sold state only", () => {
    const state = getListingPurchaseViewState({
      listing: { status: "sold" },
      userUid: "other-uid",
      userEmail: "other@test.com",
      listingSellerId: "seller-uid",
      listingSellerEmail: "seller@test.com",
      buyerPurchasedQuantity: 0,
      arrangeRequestCount: 0,
      listingOrders: [],
    });

    expect(resolveListingViewerRole(
      { sellerId: "seller-uid" },
      "other-uid",
      "other@test.com",
      []
    )).toBe("public");
    expect(state.showPublicSoldUi).toBe(true);
    expect(state.showBuyerPurchasedBanner).toBe(false);
  });
});
