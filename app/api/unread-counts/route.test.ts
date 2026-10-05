import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Billed-read behaviour of GET /api/unread-counts (polled every 30s per visible tab).
 * The `users/{uid}/blocked` list is only needed when there is unread inbox mail to
 * discount; an all-read inbox must not pay for it.
 */

type Row = Record<string, unknown>;
const state: {
  unreadMessages: Row[];
  notifications: Row[];
  blocked: Row[];
  queries: string[];
} = { unreadMessages: [], notifications: [], blocked: [], queries: [] };

function makeQuery(path: string, kind: "count" | "docs" = "docs") {
  const q = {
    path,
    where: () => q,
    limit: () => q,
    count: () => makeQuery(path, "count"),
    doc: (id: string) => ({
      collection: (sub: string) => makeQuery(`${path}/${id}/${sub}`),
    }),
    get: async () => {
      state.queries.push(`${kind}:${path}`);
      const rows =
        path === "messages"
          ? state.unreadMessages
          : path === "notifications"
            ? state.notifications
            : path.endsWith("/blocked")
              ? state.blocked
              : [];
      if (kind === "count") return { data: () => ({ count: rows.length }) };
      return { docs: rows.map((r) => ({ data: () => r })) };
    },
  };
  return q;
}

vi.mock("../../lib/firebase-admin", () => ({
  getAdminDb: () => ({ collection: (name: string) => makeQuery(name) }),
  isAdminInitialized: () => true,
  verifyIdToken: async () => ({ uid: "u1", email: "me@example.com" }),
}));
vi.mock("../../lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 59, limit: 60 }),
}));

import { GET } from "./route";

function call() {
  return GET(
    new NextRequest("http://localhost/api/unread-counts", {
      headers: { authorization: "Bearer t" },
    })
  );
}

const blockedReads = () => state.queries.filter((q) => q.endsWith("/blocked"));

describe("GET /api/unread-counts Firestore reads", () => {
  beforeEach(() => {
    state.unreadMessages = [];
    state.notifications = [];
    state.blocked = [];
    state.queries = [];
  });

  it("does not read the blocked list when the inbox has nothing unread", async () => {
    state.blocked = [{ blockedEmail: "spam@example.com" }];
    state.notifications = [{ type: "offer_accepted" }, { type: "message" }];
    const res = await call();
    expect(await res.json()).toMatchObject({ inboxUnread: 0, activityUnread: 1 });
    expect(blockedReads()).toEqual([]);
    expect(state.queries.sort()).toEqual(["count:messages", "docs:notifications"]);
  });

  it("reads the blocked list (once) when unread mail exists but returns the plain count if none blocked", async () => {
    state.unreadMessages = [{ sender: "a@example.com" }, { sender: "b@example.com" }];
    const res = await call();
    expect(await res.json()).toMatchObject({ inboxUnread: 2 });
    expect(blockedReads()).toEqual(["docs:users/u1/blocked"]);
    // no second inbox scan when nobody is blocked
    expect(state.queries.filter((q) => q === "docs:messages")).toEqual([]);
  });

  it("still discounts unread mail from blocked senders", async () => {
    state.unreadMessages = [
      { sender: "A@example.com " },
      { sender: "spam@example.com" },
      { sender: "spam@example.com" },
    ];
    state.blocked = [{ blockedEmail: "Spam@Example.com" }];
    const res = await call();
    expect(await res.json()).toMatchObject({ inboxUnread: 1 });
    expect(blockedReads()).toHaveLength(1);
    expect(state.queries.filter((q) => q === "docs:messages")).toHaveLength(1);
  });
});
