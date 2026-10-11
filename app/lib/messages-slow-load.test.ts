import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "app/messages/page.tsx"), "utf8");

/** Body of the useEffect that contains `marker`. */
function effectContaining(marker: string): string {
  const at = page.indexOf(marker);
  expect(at, marker).toBeGreaterThan(0);
  const start = page.lastIndexOf("useEffect(", at);
  const end = page.indexOf("\n  }, [", at);
  return page.slice(start, page.indexOf("\n", end + 4));
}

describe("MESSAGES-SLOW-LOAD", () => {
  it("inbox listener re-enters loading on subscribe and flags first snapshot / error", () => {
    const eff = effectContaining('where("participants", "array-contains", user.email)');
    const sub = eff.indexOf("onSnapshot(msgQuery");
    expect(eff.indexOf("setLoading(true);")).toBeGreaterThan(-1);
    expect(eff.indexOf("setLoading(true);")).toBeLessThan(sub);
    expect(eff.indexOf("setInboxReady(false);")).toBeLessThan(sub);
    expect(eff.slice(sub)).toMatch(/setInboxReady\(true\);\s*recordInboxTiming\(/);
    expect(eff).toMatch(/setLoadError\(true\);\s*setInboxReady\(true\);/);
    // the old code set loading=false while signed-out and never reset it -> empty-state flash
    expect(eff).not.toMatch(/if \(!user\?\.email\) \{\s*setMessages\(\[\]\);\s*setLoading\(false\);/);
  });

  it("thread list shows a skeleton (not the empty state) until the first snapshot", () => {
    expect(page).toMatch(/\{loading \|\| !inboxReady \? \(\s*<InboxSkeleton \/>/);
    const skeleton = page.indexOf("<InboxSkeleton />");
    const empty = page.indexOf("Message a seller from a listing to start arranging a purchase.");
    expect(skeleton).toBeGreaterThan(0);
    expect(skeleton).toBeLessThan(empty);
    expect(page).toMatch(/!chatUser && \(loading \|\| !inboxReady\) \?/);
    expect(page).toMatch(/filteredMessages\.length === 0 && \(loading \|\| !inboxReady\) \?/);
  });

  it("chat-pane-only work waits for inboxReady (typing + purchases listeners, listing getDoc)", () => {
    const typing = effectContaining('doc(db, "typing"');
    expect(typing).toContain("if (!inboxReady) return;");
    expect(typing).toMatch(/\}, \[chatUser, user, chatListingId, inboxReady\]\)/);
    expect(typing.indexOf("if (!inboxReady) return;")).toBeLessThan(typing.indexOf("onSnapshot("));

    const purchases = effectContaining("buildConversationPurchasesQuery(db, chatListingId");
    expect(purchases.indexOf("if (!inboxReady) return;")).toBeLessThan(purchases.indexOf("onSnapshot("));

    const listing = effectContaining('getDoc(doc(db, "listings", chatListingId))');
    expect(listing.indexOf("if (!inboxReady) return;")).toBeLessThan(listing.indexOf("getDoc("));
    expect(listing).toMatch(/\}, \[chatListingId, inboxReady\]\)/);
  });

  it("no extra reads: still exactly 5 onSnapshot listeners, inbox query shape/limit unchanged", () => {
    expect(page.match(/onSnapshot\(/g)).toHaveLength(5);
    expect(page).toMatch(/where\("participants", "array-contains", user\.email\),\s*orderBy\("createdAt", "desc"\),\s*limit\(100\)/);
    expect(page).toMatch(/query\(collection\(db, "users", user\.uid, "blocked"\), limit\(100\)\)/);
    expect(page).toMatch(/query\(collection\(db, "profiles", user\.uid, "inboxHidden"\), limit\(100\)\)/);
  });

  it("exposes time-to-threads for Perf without any Firestore reads", () => {
    const start = page.indexOf("function recordInboxTiming");
    const fn = page.slice(start, page.indexOf("\n}\n", start));
    expect(fn.length).toBeGreaterThan(100);
    expect(fn).toContain("__skyMsgTiming");
    expect(fn).not.toMatch(/getDoc|getDocs|onSnapshot|fetch\(/);
  });
});
