import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUEST_DRAFT_OWNER,
  SKY_AI_LISTING_DRAFT_KEY,
  SKY_AI_LISTING_DRAFT_OWNER_KEY,
  SKY_AI_LISTING_DRAFT_RESET_EVENT,
  __resetListingDraftOwnerForTests,
  bindListingDraftOwner,
} from "./sky-ai-draft-owner";
import {
  clearListingDraftFromSkyAi,
  readListingDraftFromSkyAi,
  syncListingDraftToSkyAi,
} from "./sky-ai-listing-context";

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

const PERSIST_KEY = "skyAiAwhinaSessionV1";
const events: string[] = [];
let session: ReturnType<typeof memStorage>;
let local: ReturnType<typeof memStorage>;

beforeEach(() => {
  events.length = 0;
  session = memStorage();
  local = memStorage();
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", { dispatchEvent: (e: Event) => events.push(e.type) });
  __resetListingDraftOwnerForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const DRAFT = { title: "ZZ QA OFFER TEST", price: "50", category: "Other", listingType: "physical" } as never;

describe("sky-ai listing draft is scoped per account", () => {
  it("stamps the draft with the signed-in uid when it is written", () => {
    bindListingDraftOwner("uid-A");
    syncListingDraftToSkyAi(DRAFT);
    expect(session.getItem(SKY_AI_LISTING_DRAFT_KEY)).toContain("ZZ QA OFFER TEST");
    expect(session.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY)).toBe("uid-A");
    expect(readListingDraftFromSkyAi()?.title).toBe("ZZ QA OFFER TEST");
  });

  it("same account keeps its draft across reloads (bind with the same uid is a no-op)", () => {
    bindListingDraftOwner("uid-A");
    syncListingDraftToSkyAi(DRAFT);
    events.length = 0;
    __resetListingDraftOwnerForTests(); // simulates a reload: module state lost, sessionStorage kept
    bindListingDraftOwner("uid-A");
    expect(readListingDraftFromSkyAi()?.title).toBe("ZZ QA OFFER TEST");
    expect(events).toEqual([]);
  });

  it("account switch: B never sees A's draft; reset event fires so an open form clears", () => {
    bindListingDraftOwner("uid-A");
    syncListingDraftToSkyAi(DRAFT);
    local.setItem(PERSIST_KEY, "{}");
    bindListingDraftOwner("uid-B");
    expect(readListingDraftFromSkyAi()).toBeNull();
    expect(session.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY)).toBe("uid-B");
    expect(local.getItem(PERSIST_KEY)).toBeNull();
    expect(events).toContain(SKY_AI_LISTING_DRAFT_RESET_EVENT);
  });

  it("sign-out clears the draft", () => {
    bindListingDraftOwner("uid-A");
    syncListingDraftToSkyAi(DRAFT);
    bindListingDraftOwner(null);
    expect(readListingDraftFromSkyAi()).toBeNull();
    expect(session.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY)).toBeNull();
    expect(events).toContain(SKY_AI_LISTING_DRAFT_RESET_EVENT);
  });

  it("signed-out page load with a previous account's leftover draft clears it", () => {
    session.setItem(SKY_AI_LISTING_DRAFT_KEY, JSON.stringify(DRAFT));
    session.setItem(SKY_AI_LISTING_DRAFT_OWNER_KEY, "uid-A");
    bindListingDraftOwner(null);
    expect(readListingDraftFromSkyAi()).toBeNull();
  });

  it("unattributed pre-fix draft (no owner stamp) is dropped for a signed-in user", () => {
    session.setItem(SKY_AI_LISTING_DRAFT_KEY, JSON.stringify(DRAFT));
    bindListingDraftOwner("uid-B");
    expect(readListingDraftFromSkyAi()).toBeNull();
    expect(session.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY)).toBe("uid-B");
  });

  it("a draft started as a guest survives a signed-out reload and is adopted by the next sign-in", () => {
    bindListingDraftOwner(null);
    syncListingDraftToSkyAi(DRAFT);
    expect(session.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY)).toBe(GUEST_DRAFT_OWNER);
    __resetListingDraftOwnerForTests();
    bindListingDraftOwner(null); // reload while still a guest
    expect(readListingDraftFromSkyAi()?.title).toBe("ZZ QA OFFER TEST");
    bindListingDraftOwner("uid-A"); // signs up / logs in
    expect(readListingDraftFromSkyAi()?.title).toBe("ZZ QA OFFER TEST");
    expect(session.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY)).toBe("uid-A");
  });

  it("a signed-in user with no draft just gets stamped (nothing to clear, no event)", () => {
    bindListingDraftOwner("uid-A");
    expect(session.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY)).toBe("uid-A");
    expect(events).toEqual([]);
  });

  it("clearListingDraftFromSkyAi removes draft + owner; silent mode (post-publish) skips the reset event", () => {
    bindListingDraftOwner("uid-A");
    syncListingDraftToSkyAi(DRAFT);
    clearListingDraftFromSkyAi({ silent: true });
    expect(session.getItem(SKY_AI_LISTING_DRAFT_KEY)).toBeNull();
    expect(session.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY)).toBeNull();
    expect(events).toEqual([]);
    syncListingDraftToSkyAi(DRAFT);
    clearListingDraftFromSkyAi();
    expect(events).toEqual([SKY_AI_LISTING_DRAFT_RESET_EVENT]);
  });
});
