import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const page = read("app/messages/page.tsx");

/** The effect that owns the in-chat purchase listener. */
function purchaseEffect(): string {
  const start = page.indexOf("buildConversationPurchasesQuery(db, chatListingId");
  expect(start).toBeGreaterThan(0);
  const effectStart = page.lastIndexOf("useEffect(", start);
  const end = page.indexOf("}, [chatUser, chatListingId, user?.email]);", start);
  expect(end).toBeGreaterThan(start);
  return page.slice(effectStart, end + 45);
}

describe("messages page purchases listener", () => {
  it("uses the bounded, rules-compliant query builder (no bare listingId query)", () => {
    expect(page).toContain('from "../lib/conversation-purchase-query"');
    expect(page).not.toMatch(/collection\(db,\s*"purchases"\)\s*,\s*where\("listingId",\s*"==",\s*chatListingId\)\s*\)/);
    expect(read("app/lib/conversation-purchase-query.ts")).toMatch(/limit\(CONVERSATION_PURCHASES_LIMIT\)/);
    expect(read("app/lib/conversation-purchase-query.ts")).toMatch(/CONVERSATION_PURCHASES_LIMIT\s*=\s*20/);
  });

  it("keeps a single purchases listener and the page's 5 onSnapshot calls", () => {
    expect(purchaseEffect().match(/onSnapshot\(/g)).toHaveLength(1);
    expect(page.match(/onSnapshot\(/g)).toHaveLength(5);
  });

  it("unsubscribes on cleanup and re-subscribes on chat/listing/auth-email change", () => {
    const eff = purchaseEffect();
    expect(eff).toMatch(/const unsub = onSnapshot\(/);
    expect(eff).toMatch(/return \(\) => unsub\(\);/);
    expect(eff).toMatch(/\[chatUser, chatListingId, user\?\.email\]/);
  });

  it("does not subscribe without a chat user, signed-in email and listing id", () => {
    const eff = purchaseEffect();
    const guard = eff.indexOf("if (!chatUser || !user?.email || !chatListingId)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(eff.indexOf("onSnapshot("));
  });

  it("resets purchase state on listener error", () => {
    const eff = purchaseEffect();
    expect(eff).toMatch(/\(\) => \{\s*setHasPurchaseInChat\(false\);\s*setPurchaseData\(null\);\s*\}/);
  });

  it("still narrows to the conversation pair client-side", () => {
    expect(purchaseEffect()).toMatch(/pickConversationPurchase\(snap\.docs, user\.email!, chatUser\)/);
  });
});
