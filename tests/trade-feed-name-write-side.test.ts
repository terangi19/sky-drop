import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isEmailDerivedName } from "../app/lib/safe-display-name";

const EMAIL = "john.smith@example.com";
const UID = "user-1";

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  profile: { username: "johnsmith", displayName: "" } as Record<string, unknown> | null,
  post: {
    sellerEmail: "seller@example.com",
    title: "Card",
    replies: [] as unknown[],
  } as Record<string, unknown> | null,
  listing: { sellerEmail: "seller@example.com" } as Record<string, unknown> | null,
  added: [] as { col: string; data: Record<string, unknown> }[],
  updates: [] as { col: string; id: string; data: Record<string, unknown> }[],
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) },
}));

vi.mock("../app/lib/firebase-admin", () => ({
  verifyIdToken: (...args: unknown[]) => h.verifyIdToken(...args),
  isAdminInitialized: () => true,
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (name === "profiles") return { exists: h.profile != null, data: () => h.profile || {} };
          if (name === "tradePosts") return { exists: h.post != null, data: () => ({ ...(h.post || {}) }) };
          if (name === "listings") return { exists: h.listing != null, data: () => h.listing || {} };
          return { exists: false, data: () => ({}) };
        },
        update: async (data: Record<string, unknown>) => {
          h.updates.push({ col: name, id, data });
        },
      }),
      add: async (data: Record<string, unknown>) => {
        h.added.push({ col: name, data });
        return { id: "new-id" };
      },
      where: () => ({
        where: () => ({
          where: () => ({
            limit: () => ({ get: async () => ({ empty: true, docs: [] }) }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("../app/lib/enforce-protection", () => ({
  enforceProtection: async () => ({ allowed: true, blocked: false }),
}));

vi.mock("../app/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 1, limit: 20 }),
}));

import { POST as createShout } from "../app/api/create-trade-shout/route";
import { POST as manageTradePost } from "../app/api/manage-trade-post/route";
import { POST as createTradePost } from "../app/api/create-trade-post/route";
import { POST as listingQuestion } from "../app/api/listing-question/route";

function call(handler: (req: NextRequest) => Promise<Response>, path: string, body: unknown) {
  return handler(
    new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: {
        authorization: "Bearer tok",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );
}

function assertNameFields(data: Record<string, unknown>, email: string) {
  for (const [key, value] of Object.entries(data)) {
    if (key === "by" || key === "sellerEmail" || key === "askerEmail" || key === "listingSellerEmail") continue;
    if (key === "sender" || key === "receiver" || key === "participants") continue;
    if (typeof value === "string" && /name|username/i.test(key)) {
      expect(value.includes("@"), key).toBe(false);
      expect(isEmailDerivedName(value, email), key).toBe(false);
    }
  }
}

describe("trade feed and Q&A name writes", () => {
  beforeEach(() => {
    h.profile = { username: "johnsmith", displayName: "" };
    h.post = { sellerEmail: "seller@example.com", title: "Card", replies: [] };
    h.listing = { sellerEmail: "seller@example.com" };
    h.added.length = 0;
    h.updates.length = 0;
    h.verifyIdToken.mockReset();
    h.verifyIdToken.mockResolvedValue({ uid: UID, email: EMAIL });
  });

  it("stores by as the email and a neutral byName, ignoring any client name", async () => {
    const res = await call(createShout, "/api/create-trade-shout", {
      text: "hello",
      byName: "john.smith",
      sellerUsername: EMAIL,
    });
    expect(res.status).toBe(200);
    const saved = h.added.find((row) => row.col === "tradeShouts")?.data;
    expect(saved?.by).toBe(EMAIL);
    expect(saved?.byId).toBe(UID);
    expect(saved?.byName).toBe("Sky Drop member");
    assertNameFields(saved || {}, EMAIL);
  });

  it("uses a safe profile display name for shout byName", async () => {
    h.profile = { username: "johnsmith", displayName: "Aroha" };
    const res = await call(createShout, "/api/create-trade-shout", { text: "kia ora" });
    expect(res.status).toBe(200);
    expect(h.added[0].data.byName).toBe("Aroha");
    expect(h.added[0].data.by).toBe(EMAIL);
  });

  it("reply docs keep by as the email and add byId plus a neutral byName", async () => {
    const res = await call(manageTradePost, "/api/manage-trade-post", {
      action: "reply",
      postId: "post-1",
      text: "interested",
      byName: "john.smith",
    });
    expect(res.status).toBe(200);
    const update = h.updates.find((row) => row.col === "tradePosts");
    const replies = update?.data.replies as Array<Record<string, unknown>>;
    expect(replies).toHaveLength(1);
    expect(replies[0].by).toBe(EMAIL);
    expect(replies[0].byId).toBe(UID);
    expect(replies[0].byName).toBe("Sky Drop member");
    expect(replies[0].text).toBe("interested");
    assertNameFields(replies[0], EMAIL);
  });

  it("ignores a client sellerUsername that is the email or its local part", async () => {
    const res = await call(createTradePost, "/api/create-trade-post", {
      title: "Badge",
      sellerUsername: EMAIL,
      description: "for sale",
    });
    expect(res.status).toBe(200);
    const saved = h.added.find((row) => row.col === "tradePosts")?.data;
    expect(saved?.sellerEmail).toBe(EMAIL);
    expect(saved?.sellerId).toBe(UID);
    expect(saved?.sellerUsername).toBe("");
    expect(saved?.sellerName).toBe("Sky Drop member");
    assertNameFields(saved || {}, EMAIL);
  });

  it("stores a user-chosen profile username on a new trade post", async () => {
    h.profile = { username: "KiwiTrader", displayName: "" };
    const res = await call(createTradePost, "/api/create-trade-post", {
      title: "Card",
      sellerUsername: "john.smith",
    });
    expect(res.status).toBe(200);
    const saved = h.added.find((row) => row.col === "tradePosts")?.data;
    expect(saved?.sellerUsername).toBe("KiwiTrader");
    expect(saved?.sellerName).toBe("KiwiTrader");
  });

  it("ignores an email-derived askerName and does not store the email prefix", async () => {
    const res = await call(listingQuestion, "/api/listing-question", {
      action: "ask",
      listingId: "listing-1",
      question: "Is this still available?",
      askerName: "john.smith",
    });
    expect(res.status).toBe(200);
    const saved = h.added.find((row) => row.col === "listingQuestions")?.data;
    expect(saved?.askerEmail).toBe(EMAIL);
    expect(saved?.askerName).toBe("Sky Drop member");
    assertNameFields(saved || {}, EMAIL);
  });

  it("keeps a client askerName that is not email-derived", async () => {
    const res = await call(listingQuestion, "/api/listing-question", {
      action: "ask",
      listingId: "listing-1",
      question: "Shipping?",
      askerName: "Aroha",
    });
    expect(res.status).toBe(200);
    expect(h.added[0].data.askerName).toBe("Aroha");
  });
});
