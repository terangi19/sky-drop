/**
 * PROMPT-8 route tests: /api/submit-review rejects non-integer / out-of-range ratings and over-cap
 * text with 400 before any Firestore read or write. Kept separate from route.test.ts (#106).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getAdminDb: vi.fn(() => {
    throw new Error("db must not be touched for invalid input");
  }),
  rateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }));
vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: h.verifyIdToken,
  getAdminDb: h.getAdminDb,
  isAdminInitialized: () => true,
}));
vi.mock("../../lib/checkout-server", () => ({ requireAdminForCheckout: () => undefined }));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: h.rateLimit }));
vi.mock("../../lib/review-aggregates", () => ({ incrementProfileReviewAggregates: vi.fn() }));
vi.mock("../../lib/profile-display-admin", () => ({
  adminGetProfileByEmail: vi.fn(),
  adminGetPublicHandle: vi.fn(),
}));

import { NextRequest } from "next/server";
import { REVIEW_COMMENT_MAX } from "../../lib/order-reviews";
import { POST } from "./route";

const req = (body: unknown, raw = false) =>
  new NextRequest("http://localhost/api/submit-review", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  h.getAdminDb.mockClear();
  h.verifyIdToken.mockResolvedValue({ uid: "buyer-1", email: "buyer@example.com", email_verified: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submit-review input validation", () => {
  it.each([0, 6, -1, 4.5, 2.25, "4.5", "five", true, null, [5], 1e9])("400 for rating %j, no db", async (rating) => {
    const res = await POST(req({ purchaseId: "p1", rating, reviewText: "ok" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/whole number from 1 to 5/);
    expect(h.getAdminDb).not.toHaveBeenCalled();
  });

  it("400 when rating missing", async () => {
    const res = await POST(req({ purchaseId: "p1" }));
    expect(res.status).toBe(400);
    expect(h.getAdminDb).not.toHaveBeenCalled();
  });

  it("400 for over-cap or non-string comment, no db", async () => {
    for (const reviewText of ["a".repeat(REVIEW_COMMENT_MAX + 1), "x".repeat(1_000_000), { a: 1 }]) {
      const res = await POST(req({ purchaseId: "p1", rating: 5, reviewText }));
      expect(res.status).toBe(400);
    }
    expect(h.getAdminDb).not.toHaveBeenCalled();
  });

  it("400 Missing purchaseId; malformed JSON is a 400, not a 500", async () => {
    expect((await POST(req({ rating: 5 }))).status).toBe(400);
    const res = await POST(req("{not json", true));
    expect(res.status).toBe(400);
    expect(h.getAdminDb).not.toHaveBeenCalled();
  });

  it("valid integer rating + capped text passes validation (reaches the db)", async () => {
    for (const rating of [1, 5, "3"]) {
      const res = await POST(req({ purchaseId: "p1", rating, reviewText: "a".repeat(REVIEW_COMMENT_MAX) }));
      // The mocked db throws, so the route answers its generic 500: validation did not reject.
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to submit review" });
    }
    expect(h.getAdminDb).toHaveBeenCalledTimes(3);
  });

  it("401 without a token (unchanged)", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/submit-review", { method: "POST", body: "{}" })
    );
    expect(res.status).toBe(401);
  });
});
