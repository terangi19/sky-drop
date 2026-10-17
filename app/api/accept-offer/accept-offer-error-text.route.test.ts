import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** PROMPT-16: accept-offer returns only known user-facing errors, never internal Firestore/Stripe text. */
const h = vi.hoisted(() => ({ accept: vi.fn() }));
vi.mock("../../lib/stripe-checkout-flags", () => ({
  isStripeCheckoutEnabledServer: () => true,
  listingCheckoutUnavailableBody: () => ({ error: "off" }),
}));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true, remaining: 1, limit: 8 }) }));
vi.mock("../../lib/require-verified", () => ({ requireVerifiedEmail: () => ({ ok: true }) }));
vi.mock("../../lib/require-kyc", () => ({ requireKycApproved: async () => ({ ok: true }) }));
vi.mock("../../lib/purchase-service", () => ({ acceptOfferWithAdmin: (i: unknown) => h.accept(i) }));
vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: async () => ({ uid: "seller", email: "seller@example.com", email_verified: true }),
  isAdminInitialized: () => true,
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ type: "offer", sender: "buyer@example.com", offerAmount: 50 }) }),
      }),
    }),
  }),
}));

import { POST } from "./route";

function req() {
  return new NextRequest("http://localhost/api/accept-offer", {
    method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: JSON.stringify({ listingId: "l1", buyerEmail: "buyer@example.com", offerMessageId: "m1" }),
  });
}

describe("POST /api/accept-offer error text", () => {
  beforeEach(() => {
    h.accept.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("internal Firestore REST error becomes a generic 500", async () => {
    h.accept.mockRejectedValue(new Error('Firestore PATCH error: 403 {"error":{"status":"PERMISSION_DENIED","message":"projects/sky-drop-de459"}}'));
    const res = await POST(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to accept offer" });
  });

  it("known user-facing error keeps its text with a 4xx status", async () => {
    h.accept.mockRejectedValue(new Error("Offer is already accepted"));
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Offer is already accepted" });
  });

  it("not-the-seller is a 403", async () => {
    h.accept.mockRejectedValue(new Error("You are not the seller of this listing"));
    const res = await POST(req());
    expect(res.status).toBe(403);
  });
});
