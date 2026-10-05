import fs from "fs";
import path from "path";
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  TRADE_SHOUT_LIMIT,
  TRADE_SHOUT_TTL_MS,
  expiredOwnShoutIds,
  orderShoutsOldestFirst,
  shoutCreatedMs,
} from "./trade-shouts";

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const ts = (msAgo: number) => Timestamp.fromMillis(NOW - msAgo);

describe("shoutCreatedMs", () => {
  it("reads a real Firestore Timestamp (what serverTimestamp() is stored as)", () => {
    expect(shoutCreatedMs(Timestamp.fromMillis(1_700_000_000_123))).toBe(1_700_000_000_123);
  });
  it("reads timestamp-likes and Dates", () => {
    expect(shoutCreatedMs({ seconds: 1_700_000_000, nanoseconds: 123_000_000 })).toBe(1_700_000_000_123);
    expect(shoutCreatedMs(new Date(5000))).toBe(5000);
  });
  it.each([undefined, null, 0, 123, "2026-01-01", {}, { seconds: "x" }, { toMillis: () => NaN }])("0 for %j", (v) => {
    expect(shoutCreatedMs(v)).toBe(0);
  });
  it("documents the old bug: a Timestamp is not a number, so `createdAt < (Date.now()/1000 - 3600)` can never match by type", () => {
    const createdAt = ts(2 * 3600_000);
    expect(typeof createdAt).toBe("object");
    expect(typeof (NOW / 1000 - 3600)).toBe("number");
    // the fixed comparison is on milliseconds and does see it as expired
    expect(NOW - shoutCreatedMs(createdAt) > TRADE_SHOUT_TTL_MS).toBe(true);
  });
});

describe("expiredOwnShoutIds", () => {
  const me = "me@example.com";
  const shouts = [
    { id: "old-mine", by: me, createdAt: ts(61 * 60_000) },
    { id: "fresh-mine", by: me, createdAt: ts(59 * 60_000) },
    { id: "old-theirs", by: "them@example.com", createdAt: ts(5 * 3600_000) },
    { id: "pending-mine", by: me, createdAt: null },
    { id: "no-ts-mine", by: me },
    { id: "old-mine-2", by: me, createdAt: ts(3 * 3600_000) },
  ];

  it("returns only the author's own expired shouts (rules: delete only where by == auth email)", () => {
    expect(expiredOwnShoutIds(shouts, me, NOW)).toEqual(["old-mine", "old-mine-2"]);
  });
  it("exactly at the TTL is not yet expired", () => {
    expect(expiredOwnShoutIds([{ id: "x", by: me, createdAt: ts(TRADE_SHOUT_TTL_MS) }], me, NOW)).toEqual([]);
    expect(expiredOwnShoutIds([{ id: "x", by: me, createdAt: ts(TRADE_SHOUT_TTL_MS + 1) }], me, NOW)).toEqual(["x"]);
  });
  it("signed out or empty email: nothing", () => {
    expect(expiredOwnShoutIds(shouts, null, NOW)).toEqual([]);
    expect(expiredOwnShoutIds(shouts, "", NOW)).toEqual([]);
    expect(expiredOwnShoutIds(shouts, undefined, NOW)).toEqual([]);
  });
  it("email must match exactly (the rule compares strings), so other casing is not offered for delete", () => {
    expect(expiredOwnShoutIds(shouts, "ME@example.com", NOW)).toEqual([]);
  });
  it("never returns someone else's shout, however old", () => {
    expect(expiredOwnShoutIds(shouts, me, NOW)).not.toContain("old-theirs");
  });
});

describe("orderShoutsOldestFirst", () => {
  it("turns the newest-first query result into chat order without mutating the input", () => {
    const input = [
      { id: "c", createdAt: ts(1000) },
      { id: "b", createdAt: ts(2000) },
      { id: "a", createdAt: ts(3000) },
    ];
    const snapshot = [...input];
    expect(orderShoutsOldestFirst(input).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(input).toEqual(snapshot);
  });
  it("sub-second ordering works (old code only compared whole seconds)", () => {
    const a = { id: "a", createdAt: Timestamp.fromMillis(1_700_000_000_100) };
    const b = { id: "b", createdAt: Timestamp.fromMillis(1_700_000_000_900) };
    expect(orderShoutsOldestFirst([b, a]).map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("trade-feed page + index wiring (source guard)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../trade-feed/page.tsx"), "utf8");
  const indexes = JSON.parse(fs.readFileSync(path.join(__dirname, "../../firestore.indexes.json"), "utf8")) as {
    indexes: Array<{ collectionGroup: string; queryScope: string; fields: Array<{ fieldPath: string; order: string }> }>;
  };

  it("the shout query is newest-first with a cap (not limit(50) by doc id)", () => {
    expect(TRADE_SHOUT_LIMIT).toBe(30);
    expect(src).toMatch(
      /query\(collection\(db, "tradeShouts"\), where\("world", "==", worldFilter\), orderBy\("createdAt", "desc"\), limit\(TRADE_SHOUT_LIMIT\)\)/
    );
    expect(src).not.toMatch(/tradeShouts"\), where\("world", "==", worldFilter\), limit\(50\)/);
  });

  it("the equality + orderBy query has its composite index (world ASC, createdAt DESC) declared", () => {
    const hit = indexes.indexes.filter((i) => i.collectionGroup === "tradeShouts");
    expect(hit).toHaveLength(1);
    expect(hit[0].queryScope).toBe("COLLECTION");
    expect(hit[0].fields).toEqual([
      { fieldPath: "world", order: "ASCENDING" },
      { fieldPath: "createdAt", order: "DESCENDING" },
    ]);
  });

  it("auto-clear no longer compares createdAt with a number or queries other people's shouts", () => {
    expect(src).not.toMatch(/Date\.now\(\)\s*\/\s*1000\s*-\s*3600/);
    expect(src).not.toMatch(/where\("createdAt",\s*"<"/);
    expect(src).toContain("expiredOwnShoutIds(shoutsRef.current, user.email, Date.now())");
  });

  it("the shout ticker tracks ids, not list length (a full capped window never grows)", () => {
    expect(src).not.toContain("knownShoutCount");
    expect(src).toContain("knownShoutIds");
  });
});
