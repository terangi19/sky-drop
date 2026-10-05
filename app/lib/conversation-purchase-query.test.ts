import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, rec } = vi.hoisted(() => {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const rec = (fn: string) => (...args: unknown[]) => {
    const node = { fn, args };
    calls.push(node);
    return node;
  };
  return { calls, rec };
});

vi.mock("firebase/firestore", () => ({
  collection: rec("collection"),
  where: rec("where"),
  and: rec("and"),
  or: rec("or"),
  limit: rec("limit"),
  query: rec("query"),
}));

import {
  CONVERSATION_PURCHASES_LIMIT,
  buildConversationPurchasesQuery,
} from "./conversation-purchase-query";

type Node = { fn: string; args: unknown[] };
const wheres = (n: Node) => (n.args as Node[]).map((w) => w.args as [string, string, string]);

describe("buildConversationPurchasesQuery", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("bounds the listener at 20 docs", () => {
    expect(CONVERSATION_PURCHASES_LIMIT).toBe(20);
    const q = buildConversationPurchasesQuery({} as never, "L1", "me@x.com", "them@x.com") as unknown as Node;
    expect(q.fn).toBe("query");
    const lim = (q.args as Node[]).find((a) => a.fn === "limit");
    expect(lim?.args).toEqual([20]);
  });

  it("targets the purchases collection and has no orderBy (no composite index)", () => {
    const q = buildConversationPurchasesQuery({} as never, "L1", "me@x.com", "them@x.com") as unknown as Node;
    const coll = (q.args as Node[]).find((a) => a.fn === "collection");
    expect(coll?.args[1]).toBe("purchases");
    expect(calls.some((c) => c.fn === "orderBy")).toBe(false);
  });

  it("pins the signed-in user to buyerEmail OR sellerEmail in every branch (rules-compliant)", () => {
    const q = buildConversationPurchasesQuery({} as never, "L1", "me@x.com", "them@x.com") as unknown as Node;
    const orNode = (q.args as Node[]).find((a) => a.fn === "or")!;
    const branches = orNode.args as Node[];
    expect(branches).toHaveLength(2);
    expect(branches.every((b) => b.fn === "and")).toBe(true);

    const asBuyer = wheres(branches[0]);
    const asSeller = wheres(branches[1]);
    expect(asBuyer).toEqual([
      ["listingId", "==", "L1"],
      ["buyerEmail", "==", "me@x.com"],
      ["sellerEmail", "==", "them@x.com"],
    ]);
    expect(asSeller).toEqual([
      ["listingId", "==", "L1"],
      ["sellerEmail", "==", "me@x.com"],
      ["buyerEmail", "==", "them@x.com"],
    ]);
  });

  it("never produces a bare listingId-only branch", () => {
    buildConversationPurchasesQuery({} as never, "L1", "me@x.com", "them@x.com");
    const whereCalls = calls.filter((c) => c.fn === "where");
    expect(whereCalls).toHaveLength(6);
    const listingOnly = whereCalls.filter((c) => c.args[0] === "listingId");
    expect(listingOnly).toHaveLength(2);
  });
});
