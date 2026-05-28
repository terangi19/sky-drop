import { test, expect } from "@playwright/test";

test.describe("Tier 3 — Stripe & Edge Cases", () => {

  test("create-payment-intent API returns clientSecret", async ({ request }) => {
    const res = await request.post("/api/create-payment-intent", {
      data: { title: "Test Listing", price: "21.00", listingId: "test123" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBeTruthy();
    expect(body.clientSecret).toContain("pi_");
  });

  test("create-payment-intent rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/create-payment-intent", {
      data: { title: "Test" },
    });
    expect(res.status()).toBe(400);
  });

  test("create-payment-intent rejects amount below $0.50", async ({ request }) => {
    const res = await request.post("/api/create-payment-intent", {
      data: { title: "Test", price: "0.30", listingId: "test123" },
    });
    expect(res.status()).toBe(400);
  });

});
