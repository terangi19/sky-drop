import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildThreadSearch, resolveThreadUserParam, threadUrlUserId } from "./messages-thread-url";

const ME = "me@x.test";
const ALICE = "alice@x.test";
const BOB = "bob@x.test";
const UID_A = "aliceUid0000000000000000001";
const UID_B = "bobUid00000000000000000000002";
const ids = new Map([
  [ALICE, { uid: UID_A }],
  [BOB, { uid: UID_B }],
]);
const deps = (over: Partial<Parameters<typeof resolveThreadUserParam>[1]> = {}) => ({
  myEmail: ME,
  inboxParticipants: [ME, ALICE, ME, BOB],
  resolveIdentity: vi.fn(async (id: string) => (id === "alice" || id === UID_A ? { uid: UID_A } : null)),
  resolveIdentities: vi.fn(async (emails: string[]) => new Map(emails.map((e) => [e, ids.get(e) ?? null]))),
  ...over,
});

describe("buildThreadSearch / threadUrlUserId", () => {
  it("writes ?user=<uid>&listing=<id>, drops legacy thread params, keeps unrelated ones", () => {
    expect(buildThreadSearch("?user=alice@x.test&listing=L1&title=Bike&price=5&utm=x", { userId: UID_A, listingId: "L2" }))
      .toBe(`?utm=x&user=${UID_A}&listing=L2`);
    expect(buildThreadSearch("", { userId: UID_A, listingId: null })).toBe(`?user=${UID_A}`);
    expect(buildThreadSearch("?conversation=c1", { userId: null, listingId: "L1" })).toBe("");
  });

  it("never puts an email in the URL", () => {
    expect(buildThreadSearch("", { userId: ALICE, listingId: "L1" })).toBe("");
    expect(threadUrlUserId(ALICE, () => ({ uid: ALICE }))).toBeNull();
    expect(threadUrlUserId(ALICE, () => null)).toBeNull();
    expect(threadUrlUserId(ALICE, () => ({ uid: UID_A }))).toBe(UID_A);
    expect(threadUrlUserId("", () => ({ uid: UID_A }))).toBeNull();
  });
});

describe("resolveThreadUserParam (?user= -> counterparty email)", () => {
  it("username -> uid via public identity -> matching inbox participant", async () => {
    const d = deps();
    expect(await resolveThreadUserParam("alice", d)).toBe(ALICE);
    expect(d.resolveIdentities).toHaveBeenCalledWith([ALICE, BOB]); // me excluded, deduped
  });

  it("uid (the shareable form this pack writes) resolves the same way", async () => {
    expect(await resolveThreadUserParam(UID_A, deps())).toBe(ALICE);
    // uid the identity API doesn't know (e.g. cache miss) is still matched against the inbox
    expect(await resolveThreadUserParam(UID_B, deps())).toBe(BOB);
  });

  it("legacy email links still work; my own email is rejected", async () => {
    expect(await resolveThreadUserParam(BOB, deps())).toBe(BOB);
    expect(await resolveThreadUserParam(ME, deps())).toBeNull();
  });

  it("new thread from a listing: falls back to the listing seller (uid must match when both known)", async () => {
    const seller = { email: "seller@x.test", uid: "sellerUid000000000000000003" };
    const d = deps({
      inboxParticipants: [],
      resolveIdentity: async () => ({ uid: seller.uid }),
      listingSeller: async () => seller,
    });
    expect(await resolveThreadUserParam("sellername", d)).toBe("seller@x.test");
    const mismatch = deps({
      inboxParticipants: [],
      resolveIdentity: async () => ({ uid: UID_A }),
      listingSeller: async () => seller,
    });
    expect(await resolveThreadUserParam("alice", mismatch)).toBeNull();
    const mine = deps({ inboxParticipants: [], resolveIdentity: async () => null, listingSeller: async () => ({ email: ME }) });
    expect(await resolveThreadUserParam("whoever", mine)).toBeNull();
  });

  it("unresolvable -> null (old code opened a thread keyed by the raw username)", async () => {
    expect(await resolveThreadUserParam("nobody", deps())).toBeNull();
    expect(await resolveThreadUserParam("nobody", deps({ resolveIdentity: async () => { throw new Error("net"); } }))).toBeNull();
    expect(await resolveThreadUserParam("", deps())).toBeNull();
  });
});

describe("messages page wiring", () => {
  const page = readFileSync(join(process.cwd(), "app/messages/page.tsx"), "utf8");

  it("selection updates the URL with replaceState (no history spam) and only with a uid", () => {
    expect(page).toContain("window.history.replaceState(window.history.state");
    expect(page).not.toMatch(/history\.pushState|router\.push\(`\/messages/);
    expect(page).toMatch(/threadUrlUserId\(chatUser, peekPublicIdentity\)/);
    expect(page).toMatch(/\}, \[chatUser, chatListingId, usernames, user\?\.email\]\);/);
  });

  it("?user= uses the public identity resolver, never the raw param as chatUser", () => {
    expect(page).toContain("resolveThreadUserParam(param, {");
    expect(page).not.toContain(".catch(() => setChatUser(param))");
    expect(page).not.toMatch(/setChatUser\(param\);\s*\}\)/);
  });

  it("back/forward re-applies the URL; manual picks beat a still-resolving deep link", () => {
    expect(page).toMatch(/addEventListener\("popstate", onPop\)/);
    expect(page).toMatch(/\}, \[isMobile, user\?\.email, inboxReady, urlNonce\]\);/);
    expect(page).toMatch(/deepLinkSeqRef\.current\+\+;[^\n]*\n\s*setChatUser\(convo\.participant\)/);
  });
});
