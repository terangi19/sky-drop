import { describe, expect, it } from "vitest";
import {
  buildCheckoutSuccessUrl,
  isReservationHeldByOtherBuyer,
  sanitizeCheckoutCollectionName,
} from "./payment-checkout";

describe("payment checkout safety helpers", () => {
  it("whitelists supported checkout collections", () => {
    expect(sanitizeCheckoutCollectionName("listings")).toBe("listings");
    expect(sanitizeCheckoutCollectionName("tradePosts")).toBe("tradePosts");
    expect(sanitizeCheckoutCollectionName("profiles")).toBe("listings");
    expect(sanitizeCheckoutCollectionName(undefined)).toBe("listings");
  });

  it("detects active reservation held by another buyer", () => {
    expect(
      isReservationHeldByOtherBuyer(
        {
          reservedBy: "buyer-2",
          reservedAt: { toMillis: () => Date.now() - 5_000 },
        },
        "buyer-1",
        15 * 60 * 1000
      )
    ).toBe(true);
  });

  it("ignores expired or same-buyer reservations", () => {
    expect(
      isReservationHeldByOtherBuyer(
        {
          reservedBy: "buyer-1",
          reservedAt: { toMillis: () => Date.now() - 5_000 },
        },
        "buyer-1",
        15 * 60 * 1000
      )
    ).toBe(false);

    expect(
      isReservationHeldByOtherBuyer(
        {
          reservedBy: "buyer-2",
          reservedAt: { toMillis: () => Date.now() - 16 * 60 * 1000 },
        },
        "buyer-1",
        15 * 60 * 1000
      )
    ).toBe(false);
  });

  it("builds redirect urls without email query params", () => {
    const url = buildCheckoutSuccessUrl("https://skydrop.co.nz", {
      listingId: "listing-123",
      purchaseId: "purchase-123",
      title: "BMW Spoiler",
      price: "249.00",
      type: "digital",
      digitalStoragePath: "files/test.pdf",
      digitalFileName: "test.pdf",
    });

    expect(url).toContain("listingId=listing-123");
    expect(url).toContain("purchaseId=purchase-123");
    expect(url).toContain("title=BMW+Spoiler");
    expect(url).toContain("price=249.00");
    expect(url).not.toContain("buyerEmail");
    expect(url).not.toContain("sellerEmail");
    expect(url).not.toContain("collectionName");
  });
});
