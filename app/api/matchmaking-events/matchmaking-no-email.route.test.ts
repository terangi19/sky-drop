import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** PROMPT-15: the matchmaking feed never returns the other party's email, and is capped per uid. */
const h = vi.hoisted(() => ({
  verify: vi.fn(),
  allowed: true,
  rlKeys: [] as string[],
  matches: [] as Array<{ id: string; data: Record<string, unknown> }>,
}));

vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken: (t: string) => h.verify(t) }) }));
vi.mock("../../lib/firebase-admin", () => ({ getAdminApp: () => ({}) }));
vi.mock("../../lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string) => {
    h.rlKeys.push(key);
    return { allowed: h.allowed, remaining: 0, limit: 20 };
  }),
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      where: (field: string, _op: string, value: string) => ({
        limit: () => ({
          get: async () => ({
            docs: h.matches
              .filter((m) => name === "matches" && m.data[field] === value)
              .map((m) => ({ id: m.id, data: () => m.data })),
          }),
        }),
      }),
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ title: "Bike", images: ["i.jpg"] }) }) }),
    }),
  }),
}));

import { GET } from "./route";

const ME = "me@example.com";
const OTHER_A = "seller-a@example.com";
const OTHER_B = "wanted-b@example.com";

function req(auth = true) {
  return new NextRequest("http://localhost/api/matchmaking-events", {
    headers: auth ? { authorization: "Bearer tok" } : {},
  });
}

describe("GET /api/matchmaking-events", () => {
  beforeEach(() => {
    h.allowed = true;
    h.rlKeys = [];
    h.verify.mockReset();
    h.verify.mockResolvedValue({ uid: "me-uid", email: ME });
    h.matches = [
      { id: "m1", data: { sourceListingId: "w1", sourceListingSellerEmail: ME, matchedSellerEmail: OTHER_A, matchedListingId: "l1", sourceType: "wanted", keyword: "bike" } },
      { id: "m2", data: { sourceListingId: "l9", sourceListingSellerEmail: OTHER_B, matchedSellerEmail: ME, matchedListingId: "my-l", sourceType: "listing", keyword: "bike" } },
    ];
  });

  it("returns both directions with listing ids but no other-party email", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.map((e: { id: string }) => e.id).sort()).toEqual(["m1", "m2"]);
    const text = JSON.stringify(body);
    expect(text).not.toContain(OTHER_A);
    expect(text).not.toContain(OTHER_B);
    expect(text).not.toContain("@");
    for (const e of body.events) expect(e).not.toHaveProperty("matchedWithEmail");
  });

  it("rate limits per uid (429)", async () => {
    h.allowed = false;
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(h.rlKeys).toEqual(["matchmaking-events:me-uid"]);
  });

  it("no bearer token: 401 before any rate-limit or Firestore work", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
    expect(h.rlKeys).toEqual([]);
  });
});
