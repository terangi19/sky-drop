import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** PROMPT-15: radar-matches is capped per uid before it reads 100 listings. */
const h = vi.hoisted(() => ({ allowed: true, reads: 0 }));
vi.mock("../../lib/firebase-admin", () => ({
  isAdminInitialized: () => true,
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: "u1", email: "u1@example.com" }) }),
  getAdminDb: () => ({
    collection: () => {
      h.reads++;
      return { doc: () => ({ get: async () => ({ data: () => ({}) }) }) };
    },
  }),
}));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: h.allowed, remaining: 0, limit: 20 })) }));

import { GET } from "./route";

describe("GET /api/radar-matches rate limit", () => {
  beforeEach(() => {
    h.allowed = true;
    h.reads = 0;
  });
  it("429 and no Firestore reads when the per-uid limit is hit", async () => {
    h.allowed = false;
    const res = await GET(new NextRequest("http://localhost/api/radar-matches", { headers: { authorization: "Bearer t" } }));
    expect(res.status).toBe(429);
    expect(h.reads).toBe(0);
  });
  it("allowed: proceeds to read the profile", async () => {
    const res = await GET(new NextRequest("http://localhost/api/radar-matches", { headers: { authorization: "Bearer t" } }));
    expect(res.status).toBe(200);
    expect(h.reads).toBeGreaterThan(0);
  });
});
