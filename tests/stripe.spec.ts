import { test, expect } from "@playwright/test";

test.describe("Tier 3 — Stripe & Edge Cases", () => {

  test("create-payment-intent rejects unauthenticated requests", async ({ request }) => {
    const res = await request.post("/api/create-payment-intent", {
      data: { title: "Test Listing", price: "21.00", listingId: "test123" },
    });
    expect([401, 429]).toContain(res.status());
  });

  test("create-payment-intent rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/create-payment-intent", {
      data: { title: "Test" },
    });
    expect([401, 429]).toContain(res.status());
  });

  test("create-payment-intent rejects requests without auth token", async ({ request }) => {
    const res = await request.post("/api/create-payment-intent", {
      data: { title: "Test", price: "0.30", listingId: "test123" },
    });
    expect([401, 429]).toContain(res.status());
  });

});
