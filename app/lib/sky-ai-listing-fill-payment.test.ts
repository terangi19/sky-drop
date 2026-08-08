import { describe, expect, it, afterEach } from "vitest";
import { normalizeSkyAiListingFill } from "./sky-ai-listing-fill";

describe("LISTING_FILL paymentType gating", () => {
  const prevServer = process.env.STRIPE_CHECKOUT_ENABLED;
  const prevPublic = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;

  afterEach(() => {
    if (prevServer === undefined) delete process.env.STRIPE_CHECKOUT_ENABLED;
    else process.env.STRIPE_CHECKOUT_ENABLED = prevServer;
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;
    else process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = prevPublic;
  });

  it("MODE A: forces contact even when model returns stripe", () => {
    delete process.env.STRIPE_CHECKOUT_ENABLED;
    delete process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;
    const fill = normalizeSkyAiListingFill({
      title: "Test Item",
      listingType: "physical",
      category: "Tech",
      price: "50",
      paymentType: "stripe",
    });
    expect(fill?.paymentType).toBe("contact");
  });

  it("MODE B: allows stripe when server checkout enabled", () => {
    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    const fill = normalizeSkyAiListingFill({
      title: "Test Item",
      listingType: "physical",
      category: "Tech",
      price: "50",
      paymentType: "stripe",
    });
    expect(fill?.paymentType).toBe("stripe");
  });
});
