import { describe, expect, it } from "vitest";
import { listingBuyHref } from "./buy-listing-route";
import { purchaseCheckoutAction } from "./purchase-button-labels";

describe("listingBuyHref", () => {
  it("always routes through listing page with buy=1", () => {
    expect(listingBuyHref("abc123")).toBe("/post/listing/abc123?buy=1");
  });
});

describe("purchase routing contract", () => {
  it("V1 messaging-first routes stripe paymentType to message when UI checkout is off", () => {
    // NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED unset/false → message (not arrange/stripe UI)
    expect(purchaseCheckoutAction("stripe")).toBe("message");
    expect(purchaseCheckoutAction("contact")).toBe("message");
  });
});
