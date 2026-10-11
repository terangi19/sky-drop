import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  add: vi.fn(async () => ({ id: "post-1" })),
  profile: undefined as Record<string, unknown> | undefined,
  live: false,
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }));
vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: h.verifyIdToken,
  isAdminInitialized: () => true,
  getAdminDb: () => ({
    collection: (name: string) => {
      if (name === "profiles") {
        return { doc: () => ({ get: async () => ({ exists: !!h.profile, data: () => h.profile }) }) };
      }
      const q = { where: () => q, limit: () => q, get: async () => ({ empty: !h.live }), add: h.add };
      return q;
    },
  }),
}));
vi.mock("../../lib/enforce-protection", () => ({
  enforceProtection: async () => ({ allowed: true, blocked: false }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/create-trade-post", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  h.add.mockClear();
  h.profile = undefined;
  h.live = false;
  h.verifyIdToken.mockResolvedValue({ uid: "seller-1", email: "seller@example.com" });
});

describe("create-trade-post badge ownership", () => {
  it("403 listing The Five without owning it; nothing written", async () => {
    h.profile = { badges: ["epic"] };
    const res = await POST(req({ title: "The Five", badgeForSale: "legendary", price: "999" }));
    expect(res.status).toBe(403);
    expect(h.add).not.toHaveBeenCalled();
  });
  it("403 when profile missing or badges not an array", async () => {
    expect((await POST(req({ title: "x", badgeForSale: "epic" }))).status).toBe(403);
    h.profile = { badges: "epic", profileBadge: "epic" };
    expect((await POST(req({ title: "x", badgeForSale: "epic" }))).status).toBe(403);
    expect(h.add).not.toHaveBeenCalled();
  });
  it("owner of the badge can list it", async () => {
    h.profile = { badges: ["epic", "legendary"] };
    const res = await POST(req({ title: "The Five", badgeForSale: "legendary", price: "999" }));
    expect(res.status).toBeLessThan(300);
    expect(h.add).toHaveBeenCalledTimes(1);
  });
  it("non-badge posts unaffected", async () => {
    const res = await POST(req({ title: "Bike", type: "WTS" }));
    expect(res.status).toBeLessThan(300);
    expect(h.add).toHaveBeenCalledTimes(1);
  });
});
