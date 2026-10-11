import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createLatestWins } from "./latest-wins";
import { REPLY_DUPLICATE_WINDOW_MS, isDuplicateReply } from "./trade-reply-dedupe";
import { interpretTradeFeedResponse } from "./trade-feed-request-client";

const NOW = Date.UTC(2026, 9, 5, 0, 0, 0);
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("createLatestWins (stale poll must not overwrite a forced refresh)", () => {
  it("only the most recently started fetch is 'latest'", () => {
    const g = createLatestWins();
    const poll = g.begin();
    expect(poll()).toBe(true);
    const forced = g.begin(); // user created a post while the poll was in flight
    expect(poll()).toBe(false);
    expect(forced()).toBe(true);
  });

  it("race: slow poll started first, fast forced refresh second -> final state is the forced result", async () => {
    const g = createLatestWins();
    let state = "initial";
    const fetchInto = async (label: string, delayMs: number) => {
      const isLatest = g.begin();
      await new Promise((r) => setTimeout(r, delayMs));
      if (!isLatest()) return;
      state = label;
    };
    await Promise.all([fetchInto("stale-poll (no new post)", 30), fetchInto("forced (has new post)", 5)]);
    expect(state).toBe("forced (has new post)");
  });
});

describe("isDuplicateReply", () => {
  const me = "me@example.com";
  const replies = [{ by: me, text: "Sent offer.", at: at(60_000) }];

  it("same sender + same text inside the window is a duplicate (case/space-insensitive, sender email case-insensitive)", () => {
    expect(isDuplicateReply(replies, me, "Sent offer.", NOW)).toBe(true);
    expect(isDuplicateReply(replies, "ME@Example.com", "  sent   OFFER. ", NOW)).toBe(true);
  });
  it("different text is not a duplicate", () => {
    expect(isDuplicateReply(replies, me, "Still available?", NOW)).toBe(false);
  });
  it("different sender is not a duplicate", () => {
    expect(isDuplicateReply(replies, "other@example.com", "Sent offer.", NOW)).toBe(false);
  });
  it("older than the window is allowed again", () => {
    expect(isDuplicateReply([{ by: me, text: "Sent offer.", at: at(REPLY_DUPLICATE_WINDOW_MS + 1) }], me, "Sent offer.", NOW)).toBe(false);
    expect(isDuplicateReply([{ by: me, text: "Sent offer.", at: at(REPLY_DUPLICATE_WINDOW_MS - 1) }], me, "Sent offer.", NOW)).toBe(true);
  });
  it("an earlier identical reply still counts even if the sender said something else in between", () => {
    const mixed = [
      { by: me, text: "Sent offer.", at: at(120_000) },
      { by: me, text: "PM me", at: at(60_000) },
    ];
    expect(isDuplicateReply(mixed, me, "Sent offer.", NOW)).toBe(true);
  });
  it("tolerates junk entries / missing `at` / future timestamps / empty input", () => {
    expect(isDuplicateReply([null, 5, "x", {}, { by: me, text: "Sent offer." }, { by: me, text: "Sent offer.", at: "nope" }, { by: me, text: "Sent offer.", at: at(-60_000) }], me, "Sent offer.", NOW)).toBe(false);
    expect(isDuplicateReply([], me, "x", NOW)).toBe(false);
    expect(isDuplicateReply(replies, "", "Sent offer.", NOW)).toBe(false);
    expect(isDuplicateReply(replies, me, "   ", NOW)).toBe(false);
  });
});

describe("interpretTradeFeedResponse carries the duplicate flag", () => {
  it("only when the server said so; ordinary success shape is unchanged", () => {
    expect(interpretTradeFeedResponse("reply", 200, { success: true })).toEqual({ ok: true, id: null });
    expect(interpretTradeFeedResponse("reply", 200, { success: true, duplicate: true })).toEqual({ ok: true, id: null, duplicate: true });
    expect(interpretTradeFeedResponse("reply", 200, { success: true, duplicate: "yes" })).toEqual({ ok: true, id: null });
    expect(interpretTradeFeedResponse("reply", 500, { success: true, duplicate: true })).toMatchObject({ ok: false });
  });
});

describe("trade-feed/page.tsx source guard", () => {
  const src = fs.readFileSync(path.join(__dirname, "../trade-feed/page.tsx"), "utf8");
  const between = (a: string, b: string) => {
    const s = src.indexOf(a);
    expect(s, a).toBeGreaterThan(-1);
    const e = src.indexOf(b, s);
    expect(e, b).toBeGreaterThan(s);
    return src.slice(s, e);
  };

  it("posts fetch is hoisted: a forced refresh handle exists and stale results are dropped", () => {
    const effect = between('const q = query(collection(db, "tradePosts")', "// Fetch seller review stats");
    expect(effect).toContain("refreshPostsRef.current = fetchPosts");
    expect(effect).toContain("postsFetchGuard.current.begin()");
    expect(effect).toMatch(/if \(!mounted \|\| !isLatest\(\)\) return;\s*\n\s*setPosts\(/);
    expect(effect).toContain("startVisibilityPolledFetch(fetchPosts, BROWSE_POLL_MS)");
  });

  it("creating a post refreshes the list, but only after a confirmed success", () => {
    const body = between("async function submitPost()", "async function deleteTrade(");
    const failIdx = body.indexOf("if (!result.ok)");
    const refreshIdx = body.indexOf("void refreshPostsRef.current()");
    expect(failIdx).toBeGreaterThan(-1);
    expect(refreshIdx).toBeGreaterThan(body.indexOf("} else {", failIdx));
  });

  it("deleting a post removes it locally and refreshes, but only after a confirmed success", () => {
    const body = between("async function deleteTrade(", "async function updateTradeStatus(");
    const elseIdx = body.indexOf("else {", body.indexOf("if (!result.ok)"));
    expect(elseIdx).toBeGreaterThan(-1);
    const okBranch = body.slice(elseIdx);
    expect(okBranch).toContain("setPosts((prev) => prev.filter((p) => p.id !== id))");
    expect(okBranch).toContain("void refreshPostsRef.current()");
    expect(body.slice(0, elseIdx)).not.toContain("setPosts(");
  });

  it("addReply: a duplicate response returns BEFORE createNotification", () => {
    const body = between("async function addReply(", "async function sendOffer(");
    const dup = body.indexOf("if (result.duplicate)");
    expect(dup).toBeGreaterThan(body.indexOf("!result.ok"));
    expect(body.indexOf("return;", dup)).toBeGreaterThan(dup);
    expect(body.indexOf("return;", dup)).toBeLessThan(body.indexOf("createNotification("));
  });

  it("the page has exactly one createNotification call (no second notification path)", () => {
    expect((src.match(/createNotification\(/g) || []).length).toBe(1);
  });
});
