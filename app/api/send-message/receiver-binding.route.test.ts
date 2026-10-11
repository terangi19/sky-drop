/**
 * PROMPT-11: /api/send-message
 *  - username/uid receivers resolve only when the email is already visible to the sender
 *    (conversation participant, listing seller, or a user with public listings); otherwise 404
 *    and nothing is written, so the sender can't read a stranger's email off their own message doc.
 *  - inside an existing conversation the receiver must be the other participant and the listing
 *    must match the thread.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, Map<string, Record<string, unknown>>>(),
  authUsers: new Map<string, { uid: string; email: string }>(),
  added: [] as Array<{ col: string; data: Record<string, unknown> }>,
  updated: [] as string[],
}));

const col = (n: string) => {
  if (!h.store.has(n)) h.store.set(n, new Map());
  return h.store.get(n)!;
};
function query(name: string, filters: Array<[string, unknown]>, lim = Infinity): Record<string, unknown> {
  return {
    where: (f: string, _o: string, v: unknown) => query(name, [...filters, [f, v]], lim),
    limit: (n: number) => query(name, filters, n),
    get: async () => {
      const docs = [...col(name).entries()]
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .slice(0, lim)
        .map(([id, d]) => ({ id, exists: true, data: () => d }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}
vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: async () => ({ uid: "u-sender", email: "sender@example.com", email_verified: true }),
  isAdminInitialized: () => true,
  getAdminAuth: () => ({
    getUser: async (uid: string) => {
      const u = h.authUsers.get(uid);
      if (!u) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
      return u;
    },
  }),
  getAdminDb: () => ({
    collection: (name: string) => ({
      ...query(name, []),
      doc: (id: string) => ({
        get: async () => ({ id, exists: col(name).has(id), data: () => col(name).get(id) }),
        update: async () => void h.updated.push(`${name}/${id}`),
      }),
      add: async (data: Record<string, unknown>) => {
        h.added.push({ col: name, data });
        const id = `${name}-${h.added.length}`;
        col(name).set(id, data);
        return { id };
      },
    }),
  }),
}));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }));
vi.mock("../../lib/abuse-decision-engine", () => ({
  decide: async () => ({ verdict: "allow", captchaRequired: false }),
  applyDecisionDelay: async () => {},
  persistRiskFlag: async () => {},
  recordTurnstileAttempt: () => {},
}));
vi.mock("../../lib/turnstile", () => ({ verifyTurnstileToken: async () => true, isTurnstileConfigured: () => false }));
vi.mock("../../lib/account-graph", () => ({ registerAction: () => {} }));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("../../lib/conversation-hide.server", () => ({ clearHiddenConversationForUser: vi.fn(async () => {}) }));

import { NextRequest } from "next/server";
import { clearHiddenConversationForUser } from "../../lib/conversation-hide.server";
import { POST } from "./route";

const send = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/send-message", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ text: "hello", ...body }),
    })
  );

const messages = () => h.added.filter((a) => a.col === "messages").map((a) => a.data);

beforeEach(() => {
  h.store.clear();
  h.authUsers.clear();
  h.added = [];
  h.updated = [];
  vi.mocked(clearHiddenConversationForUser).mockClear();
  // victim: buyer with no listings
  col("usernames").set("victimname", { uid: "u-victim" });
  col("profiles").set("u-victim", { email: "victim@example.com" });
  h.authUsers.set("u-victim", { uid: "u-victim", email: "victim@example.com" });
  // seller with a public listing
  col("usernames").set("sellername", { uid: "u-seller" });
  col("profiles").set("u-seller", { email: "seller@example.com" });
  h.authUsers.set("u-seller", { uid: "u-seller", email: "seller@example.com" });
  col("listings").set("L1", { sellerId: "u-seller", sellerEmail: "seller@example.com", sellerUsername: "sellername" });
  col("conversations").set("C1", {
    participants: ["sender@example.com", "seller@example.com"],
    listingId: "L1",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("username / uid oracle", () => {
  it("404 for a username with no listings and no shared context; nothing written", async () => {
    const res = await send({ receiver: "victimname" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    expect(h.added).toEqual([]);
  });
  it("404 for a raw uid of a non-seller (uids are public on reviews/followers)", async () => {
    const res = await send({ receiver: "u-victim" });
    expect(res.status).toBe(404);
    expect(h.added).toEqual([]);
  });
  it("same 404 for an unknown username (no existence signal); never stores a fake participant", async () => {
    const res = await send({ receiver: "nobody-here" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    expect(h.added).toEqual([]);
  });
  it("seller username (public listing) still resolves: /seller/[username] Message keeps working", async () => {
    const res = await send({ receiver: "sellername" });
    expect(res.status).toBe(200);
    expect(messages()[0]).toMatchObject({ receiver: "seller@example.com" });
  });
  it("listing context resolves the listing's seller by username", async () => {
    col("listings").delete("L1");
    col("listings").set("L2", { sellerId: "u-x", sellerEmail: "x@example.com", sellerUsername: "xuser" });
    const res = await send({ receiver: "xuser", listingId: "L2" });
    expect(res.status).toBe(200);
    expect(messages()[0]).toMatchObject({ receiver: "x@example.com", listingId: "L2" });
  });
  it("listing context does not resolve a different user", async () => {
    const res = await send({ receiver: "victimname", listingId: "L1" });
    expect(res.status).toBe(404);
  });
  it("conversation context resolves a participant by username", async () => {
    col("conversations").set("C2", { participants: ["sender@example.com", "victim@example.com"] });
    const res = await send({ receiver: "victimname", conversationId: "C2" });
    expect(res.status).toBe(200);
    expect(messages()[0]).toMatchObject({ receiver: "victim@example.com", conversationId: "C2" });
  });
  it("email receivers are unchanged (no lookup needed)", async () => {
    const res = await send({ receiver: "someone@example.com" });
    expect(res.status).toBe(200);
  });
});

describe("conversation binding", () => {
  it("receiver outside the conversation → 403, nothing written", async () => {
    const res = await send({ receiver: "victim@example.com", conversationId: "C1" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Receiver is not in this conversation" });
    expect(h.added).toEqual([]);
    expect(h.updated).toEqual([]);
  });
  it("sender outside the conversation → 403", async () => {
    col("conversations").set("C3", { participants: ["a@example.com", "seller@example.com"] });
    const res = await send({ receiver: "seller@example.com", conversationId: "C3" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not a participant in this conversation" });
  });
  it("listing mismatch with the thread → 400 (offer can't be re-pointed at another listing)", async () => {
    const res = await send({
      receiver: "seller@example.com",
      conversationId: "C1",
      listingId: "L-other",
      type: "offer",
      offerAmount: 5,
    });
    expect(res.status).toBe(400);
    expect(h.added).toEqual([]);
  });
  it("happy path: other participant, same listing, case-insensitive", async () => {
    const res = await send({ receiver: "Seller@Example.com", conversationId: "C1", listingId: "L1" });
    expect(res.status).toBe(200);
    expect(messages()[0]).toMatchObject({ conversationId: "C1", sender: "sender@example.com" });
    expect(h.updated).toEqual(["conversations/C1"]);
  });
  it("unknown conversation → 404", async () => {
    expect((await send({ receiver: "seller@example.com", conversationId: "nope" })).status).toBe(404);
  });
  it("hidden-conversation cleanup targets the resolved email, not the raw username", async () => {
    await send({ receiver: "sellername" });
    expect(vi.mocked(clearHiddenConversationForUser).mock.calls[0][1]).toBe("seller@example.com");
  });
  it("cannot message yourself (also via username)", async () => {
    col("usernames").set("me", { uid: "u-sender" });
    col("profiles").set("u-sender", { email: "sender@example.com" });
    col("listings").set("L9", { sellerId: "u-sender", sellerEmail: "sender@example.com" });
    expect((await send({ receiver: "me" })).status).toBe(400);
  });
});
