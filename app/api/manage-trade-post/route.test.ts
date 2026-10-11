import { beforeEach, describe, expect, it, vi } from "vitest";

type Reply = { text: string; by: string; at: string };
const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  store: { exists: true, data: null as null | Record<string, unknown> },
  messages: [] as Array<Record<string, unknown>>,
  queue: Promise.resolve() as Promise<unknown>,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) },
}));
vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: h.verifyIdToken,
  isAdminInitialized: () => true,
  getAdminDb: () => ({
    collection: (name: string) => ({
      add: async (data: Record<string, unknown>) => {
        if (name === "messages") h.messages.push(data);
        return { id: "m1" };
      },
      doc: () => ({
        get: async () => ({ exists: h.store.exists, data: () => h.store.data }),
        update: async (patch: Record<string, unknown>) => {
          h.store.data = { ...(h.store.data || {}), ...patch };
        },
        delete: async () => undefined,
      }),
    }),
    // Serialised like a real Firestore transaction on one document.
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const run = h.queue.then(() => {
        const writes: Array<Record<string, unknown>> = [];
        const tx = {
          get: async () => ({ exists: h.store.exists, data: () => h.store.data }),
          update: (_ref: unknown, patch: Record<string, unknown>) => writes.push(patch),
        };
        return fn(tx).then((r) => {
          for (const w of writes) h.store.data = { ...(h.store.data || {}), ...w };
          return r;
        });
      });
      h.queue = run.catch(() => undefined);
      return run;
    },
  }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/manage-trade-post", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer tok" },
      body: JSON.stringify(body),
    })
  );
const reply = (text: string) => call({ action: "reply", postId: "p1", text });
const replies = () => (h.store.data?.replies as Reply[]) || [];

beforeEach(() => {
  vi.clearAllMocks();
  h.messages = [];
  h.queue = Promise.resolve();
  h.store = { exists: true, data: { sellerEmail: "seller@example.com", title: "Rare card", replies: [] } };
  h.verifyIdToken.mockResolvedValue({ uid: "buyer", email: "buyer@example.com" });
});

describe("POST /api/manage-trade-post reply: repeat quick-reply clicks", () => {
  it("first reply is stored with exactly one inbox message", async () => {
    const res = await reply("Sent offer.");
    expect(await res.json()).toEqual({ success: true });
    expect(replies()).toHaveLength(1);
    expect(h.messages).toHaveLength(1);
  });

  it("the same chip clicked again is a no-op: 200 {success, duplicate}, no 2nd reply, no 2nd message", async () => {
    await reply("Sent offer.");
    const res = await reply("Sent offer.");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, duplicate: true });
    expect(replies()).toHaveLength(1);
    expect(h.messages).toHaveLength(1);
  });

  it("two concurrent identical replies store only one", async () => {
    const [a, b] = await Promise.all([reply("Sent offer."), reply("Sent offer.")]);
    const bodies = [await a.json(), await b.json()];
    expect(bodies.filter((x) => x.duplicate).length).toBe(1);
    expect(replies()).toHaveLength(1);
    expect(h.messages).toHaveLength(1);
  });

  it("a different text, or a different sender, is stored normally", async () => {
    await reply("Sent offer.");
    await reply("Still available?");
    h.verifyIdToken.mockResolvedValue({ uid: "other", email: "other@example.com" });
    await reply("Sent offer.");
    expect(replies().map((r) => `${r.by}:${r.text}`)).toEqual([
      "buyer@example.com:Sent offer.",
      "buyer@example.com:Still available?",
      "other@example.com:Sent offer.",
    ]);
    expect(h.messages).toHaveLength(3);
  });

  it("an identical reply older than the window is stored again", async () => {
    h.store.data = {
      ...h.store.data,
      replies: [{ text: "Sent offer.", by: "buyer@example.com", at: new Date(Date.now() - 11 * 60_000).toISOString() }],
    };
    expect(await (await reply("Sent offer.")).json()).toEqual({ success: true });
    expect(replies()).toHaveLength(2);
  });

  it("404 for a missing post, 400 for empty text; nothing written", async () => {
    h.store.exists = false;
    expect((await reply("hi")).status).toBe(404);
    expect((await reply("   ")).status).toBe(400);
    expect(h.messages).toHaveLength(0);
  });

  it("401 without a valid token", async () => {
    h.verifyIdToken.mockRejectedValueOnce(new Error("bad"));
    expect((await reply("hi")).status).toBe(401);
  });
});
