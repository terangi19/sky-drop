import { describe, expect, it } from "vitest";
import { listingBuyHref } from "./buy-listing-route";
import { purchaseCheckoutAction } from "./purchase-button-labels";

describe("listingBuyHref", () => {
  it("always routes through listing page with buy=1", () => {
    expect(listingBuyHref("abc123")).toBe("/post/listing/abc123?buy=1");
  });
});

describe("purchase routing contract", () => {
  it("stripe listings must not use arrange action", () => {
    expect(purchaseCheckoutAction("stripe")).toBe("stripe");
  });
});
