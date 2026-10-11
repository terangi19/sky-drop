import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AWHINA_CHAT_MESSAGES_KEY,
  AWHINA_CHAT_META_KEY,
  AWHINA_CHAT_OWNER_KEY,
  AWHINA_CONVERSATION_ID_KEY,
  AWHINA_SESSION_KEY,
  AWHINA_SHARED_OWNER_KEY,
} from "./sky-ai-draft-owner";

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

let session: ReturnType<typeof memStorage>;
let local: ReturnType<typeof memStorage>;
let handlers: Record<string, Array<() => void>>;

function stubBrowser(keepLocal = false, keepSession = false) {
  if (!keepSession) session = memStorage();
  if (!keepLocal) local = memStorage();
  handlers = {};
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", {
    addEventListener: (t: string, fn: () => void) => void (handlers[t] ||= []).push(fn),
    dispatchEvent: (e: Event) => void (handlers[e.type] || []).forEach((fn) => fn()),
  });
}

/**
 * Fresh copies of the owner module + conversation store, like a page load (the store hydrates from storage at
 * import time, before auth resolves). `bind` is the auth listener's bindListingDraftOwner of THAT module copy.
 */
async function boot() {
  vi.resetModules();
  const owner = await import("./sky-ai-draft-owner");
  const store = await import("./awhina-conversation-store");
  return { store, bind: owner.bindListingDraftOwner };
}

const MSGS = [
  { id: "u1", role: "user" as const, text: "my phone number is 021 000 111" },
  { id: "a1", role: "assistant" as const, text: "Thanks, noted." },
];

beforeEach(() => stubBrowser());
afterEach(() => vi.unstubAllGlobals());

describe("Āwhina chat transcript is scoped per account", () => {
  it("stamps the persisted transcript with the signed-in uid", async () => {
    const { store, bind } = await boot();
    bind("uid-A");
    store.setConversationId("conv-A");
    store.setMessages(MSGS);
    expect(session.getItem(AWHINA_CHAT_MESSAGES_KEY)).toContain("021 000 111");
    expect(session.getItem(AWHINA_CHAT_OWNER_KEY)).toBe("uid-A");
    expect(local.getItem(AWHINA_CONVERSATION_ID_KEY)).toBe("conv-A");
  });

  it("account switch in the same tab clears storage AND the in-memory transcript", async () => {
    const { store, bind } = await boot();
    bind("uid-A");
    store.setConversationId("conv-A");
    store.setMessages(MSGS);
    expect(store.getAwhinaConversationState().messages).toHaveLength(2);

    bind("uid-B");
    expect(session.getItem(AWHINA_CHAT_MESSAGES_KEY)).toBeNull();
    expect(session.getItem(AWHINA_CHAT_META_KEY)).toBeNull();
    expect(local.getItem(AWHINA_CONVERSATION_ID_KEY)).toBeNull();
    expect(session.getItem(AWHINA_CHAT_OWNER_KEY)).toBe("uid-B");
    const st = store.getAwhinaConversationState();
    expect(st.messages).toHaveLength(0);
    expect(st.conversationId).toBeNull();
  });

  it("sign-out clears the transcript, conversation id and session echo", async () => {
    const { store, bind } = await boot();
    bind("uid-A");
    store.setConversationId("conv-A");
    store.setMessages(MSGS);
    local.setItem(AWHINA_SESSION_KEY, "{}");

    bind(null);
    expect(session.getItem(AWHINA_CHAT_MESSAGES_KEY)).toBeNull();
    expect(session.getItem(AWHINA_CHAT_OWNER_KEY)).toBeNull();
    expect(local.getItem(AWHINA_CONVERSATION_ID_KEY)).toBeNull();
    expect(local.getItem(AWHINA_SESSION_KEY)).toBeNull();
    expect(store.getAwhinaConversationState().messages).toHaveLength(0);
  });

  it("keeps the welcome seed when the in-memory transcript is dropped", async () => {
    const { store, bind } = await boot();
    bind("uid-A");
    store.ensureWelcomeMessage("Kia ora");
    store.setMessages((prev) => [...prev, ...MSGS]);
    bind("uid-B");
    expect(store.getAwhinaConversationState().messages.map((m) => m.id)).toEqual(["welcome"]);
  });

  it("same account reload keeps the transcript and does not reset the live store", async () => {
    const first = await boot();
    first.bind("uid-A");
    first.store.setMessages(MSGS);
    // reload: module state lost, sessionStorage kept
    stubBrowser(true, true);
    const { store, bind } = await boot();
    expect(store.getAwhinaConversationState().messages).toHaveLength(2);
    bind("uid-A");
    expect(store.getAwhinaConversationState().messages).toHaveLength(2);
    // a repeated auth callback for the same uid must not wipe a live chat either
    bind("uid-A");
    expect(store.getAwhinaConversationState().messages).toHaveLength(2);
  });

  it("another account's leftover transcript is cleared on a signed-out load and at sign-in", async () => {
    const first = await boot();
    first.bind("uid-A");
    first.store.setMessages(MSGS);
    stubBrowser(true, true); // reload as a signed-out visitor
    const { bind } = await boot();
    bind(null);
    expect(session.getItem(AWHINA_CHAT_MESSAGES_KEY)).toBeNull();
    expect(local.getItem(AWHINA_SHARED_OWNER_KEY)).toBeNull();
  });

  it("guest transcript is NOT adopted by the account that signs in next", async () => {
    const { store, bind } = await boot();
    bind(null);
    store.setConversationId("conv-guest");
    store.setMessages(MSGS);
    expect(session.getItem(AWHINA_CHAT_OWNER_KEY)).toBe("__guest__");
    // guest survives reloads while signed out
    stubBrowser(true, true);
    const again = await boot();
    again.bind(null);
    expect(session.getItem(AWHINA_CHAT_MESSAGES_KEY)).toContain("021 000 111");

    again.bind("uid-B");
    expect(session.getItem(AWHINA_CHAT_MESSAGES_KEY)).toBeNull();
    expect(local.getItem(AWHINA_CONVERSATION_ID_KEY)).toBeNull();
    expect(session.getItem(AWHINA_CHAT_OWNER_KEY)).toBe("uid-B");
  });

  it("unattributed (pre-fix) transcript is not hydrated and is dropped at sign-in", async () => {
    session.setItem(
      AWHINA_CHAT_MESSAGES_KEY,
      JSON.stringify({ conversationId: null, messages: MSGS, updatedAt: Date.now() })
    );
    const { store, bind } = await boot();
    expect(store.getAwhinaConversationState().messages).toHaveLength(0);
    bind("uid-A");
    expect(session.getItem(AWHINA_CHAT_MESSAGES_KEY)).toBeNull();
  });

  it("a second tab of the same account keeps the shared conversation id; another account does not", async () => {
    const tab1 = await boot();
    tab1.bind("uid-A");
    local.setItem(AWHINA_CONVERSATION_ID_KEY, "conv-A");
    // second tab: empty sessionStorage, same localStorage
    stubBrowser(true, false);
    const tab2 = await boot();
    tab2.bind("uid-A");
    expect(local.getItem(AWHINA_CONVERSATION_ID_KEY)).toBe("conv-A");
    // browser restart + a different account signs in: localStorage survived, sessionStorage did not
    stubBrowser(true, false);
    const tab3 = await boot();
    tab3.bind("uid-B");
    expect(local.getItem(AWHINA_CONVERSATION_ID_KEY)).toBeNull();
  });
});

describe("Āwhina chat per-user wiring guards", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("the conversation store takes its storage keys and owner stamp from the owner module", () => {
    const src = read("app/lib/awhina-conversation-store.ts");
    expect(src).toContain('from "./sky-ai-draft-owner"');
    expect(src).toContain("stampAwhinaChatOwner()");
    expect(src).toContain("AWHINA_CHAT_RESET_EVENT");
    expect(src).not.toContain('"skyAiConversationId"');
  });

  it("AuthContext still binds the owner on every auth change and on the sign-out broadcast", () => {
    const src = read("app/contexts/AuthContext.tsx");
    expect(src).toContain("bindListingDraftOwner(currentUser?.uid ?? null)");
    expect(src).toContain("bindListingDraftOwner(null)");
  });
});
