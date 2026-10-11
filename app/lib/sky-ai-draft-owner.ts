/**
 * Per-account ownership of the Sky AI / Āwhina listing draft.
 *
 * The draft lives in sessionStorage ("skyAiListingDraft"), which is scoped to the TAB, not to the
 * signed-in account, so a draft left by account A (or by a deleted QA session) re-opened on
 * /post/ai -> "Edit details" for account B in the same tab. This module stamps the draft with the
 * owning uid and drops it when the signed-in account changes or signs out.
 *
 * Deliberately tiny and dependency-free (type-free besides one tiny module) so the app-wide
 * AuthProvider can import it without pulling the Āwhina draft code into every page.
 */
import { clearPersistedAwhinaSession } from "./awhina-session-persist";

export const SKY_AI_LISTING_DRAFT_KEY = "skyAiListingDraft";
export const SKY_AI_LISTING_DRAFT_OWNER_KEY = "skyAiListingDraftOwner";
export const SKY_AI_LISTING_DRAFT_RESET_EVENT = "sky-ai-listing-draft-reset";
/** Owner stamp for a draft written while nobody is signed in (adopted by the next sign-in). */
export const GUEST_DRAFT_OWNER = "__guest__";

/**
 * Āwhina chat transcript (same per-tab problem as the draft). Keys are owned by awhina-conversation-store.ts;
 * they live here so AuthContext can scope them without importing the whole store.
 */
export const AWHINA_CHAT_MESSAGES_KEY = "skyAiAwhinaMessagesV1";
export const AWHINA_CHAT_META_KEY = "skyAiAwhinaConversationMetaV1";
/** sessionStorage: uid (or GUEST_DRAFT_OWNER) that wrote the two chat blobs above. */
export const AWHINA_CHAT_OWNER_KEY = "skyAiAwhinaChatOwnerV1";
/** localStorage keys shared by all tabs: server conversation id + persisted task/slot echo. */
export const AWHINA_CONVERSATION_ID_KEY = "skyAiConversationId";
export const AWHINA_SESSION_KEY = "skyAiAwhinaSessionV1";
/** localStorage: uid that last bound this browser profile (guards the two shared keys above). */
export const AWHINA_SHARED_OWNER_KEY = "skyAiAwhinaSharedOwnerV1";
/** Fired when the signed-in account changes / signs out so the in-memory chat store drops its transcript. */
export const AWHINA_CHAT_RESET_EVENT = "sky-ai-awhina-chat-reset";

/** undefined = auth not resolved yet; null = signed out; string = signed-in uid. */
let boundUid: string | null | undefined;

/** Owner value to stamp on a draft being written now (undefined until auth has resolved). */
export function currentDraftOwnerStamp(): string | undefined {
  if (boundUid === undefined) return undefined;
  return boundUid ?? GUEST_DRAFT_OWNER;
}

/**
 * Remove the stored draft + its owner stamp. `silent` skips the reset event (used right before
 * navigating away after a successful publish, so the form is not wiped in front of the user).
 */
export function removeStoredListingDraft(opts?: { silent?: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SKY_AI_LISTING_DRAFT_KEY);
    sessionStorage.removeItem(SKY_AI_LISTING_DRAFT_OWNER_KEY);
    if (!opts?.silent) window.dispatchEvent(new CustomEvent(SKY_AI_LISTING_DRAFT_RESET_EVENT));
  } catch {
    /* ignore */
  }
}

/** Owner stamp of the persisted chat transcript (null = none / unattributed pre-fix data). */
export function readAwhinaChatOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(AWHINA_CHAT_OWNER_KEY);
  } catch {
    return null;
  }
}

/** Stamp the persisted chat transcript with the current owner (no-op until auth has resolved). */
export function stampAwhinaChatOwner(): void {
  if (typeof window === "undefined") return;
  const owner = currentDraftOwnerStamp();
  if (!owner) return;
  try {
    sessionStorage.setItem(AWHINA_CHAT_OWNER_KEY, owner);
  } catch {
    /* ignore */
  }
}

/**
 * Decide whether `dataKeys` in `store` belong to someone else and, if so, delete them.
 * Signed in: keep only data stamped with the same uid. A guest-stamped or unattributed (pre-fix) transcript is
 * NOT adopted: it is cleared (a signed-out visitor's chat must never show up inside an account).
 * Signed out: clear on leaving an account or when the leftover is stamped with a uid; a guest transcript survives.
 * Returns true when anything was removed.
 */
function reconcileChatStorage(
  store: Storage,
  ownerKey: string,
  dataKeys: string[],
  uid: string | null,
  previous: string | null | undefined
): boolean {
  const owner = store.getItem(ownerKey);
  const hasData = dataKeys.some((k) => store.getItem(k) !== null);
  let clear: boolean;
  if (uid === null) {
    clear = typeof previous === "string" || (!!owner && owner !== GUEST_DRAFT_OWNER);
  } else {
    clear = owner !== uid && hasData;
  }
  if (clear) for (const k of dataKeys) store.removeItem(k);
  if (uid === null) {
    if (clear) store.removeItem(ownerKey);
  } else if (owner !== uid) {
    store.setItem(ownerKey, uid);
  }
  return clear && hasData;
}

/** Scope the Āwhina chat transcript + conversation id + task echo to the signed-in account. */
function bindAwhinaChatOwner(uid: string | null, previous: string | null | undefined): void {
  let cleared = false;
  try {
    cleared =
      reconcileChatStorage(
        sessionStorage,
        AWHINA_CHAT_OWNER_KEY,
        [AWHINA_CHAT_MESSAGES_KEY, AWHINA_CHAT_META_KEY],
        uid,
        previous
      ) || cleared;
  } catch {
    /* ignore */
  }
  try {
    cleared =
      reconcileChatStorage(
        localStorage,
        AWHINA_SHARED_OWNER_KEY,
        [AWHINA_CONVERSATION_ID_KEY, AWHINA_SESSION_KEY],
        uid,
        previous
      ) || cleared;
  } catch {
    /* ignore */
  }
  // The store hydrated at module load, possibly before auth resolved: tell it to drop what it holds.
  if (cleared || (typeof previous === "string" && previous !== uid)) {
    try {
      window.dispatchEvent(new CustomEvent(AWHINA_CHAT_RESET_EVENT));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Call from the app-wide auth listener with the signed-in `uid`, or `null` when signed out.
 * Never call it with a value while auth is still resolving.
 *
 * - sign-out (or a signed-out load where the stored draft is a previous account's): clear it.
 * - signed in as someone other than the draft's owner, or an unattributed pre-fix draft: clear it.
 * - a draft started as a guest is adopted by the account that signs in next (sign-up -> sell).
 * The reset event also wipes a /post/ai form that already hydrated from a stale draft.
 */
export function bindListingDraftOwner(uid: string | null): void {
  const previous = boundUid;
  boundUid = uid;
  if (typeof window === "undefined") return;
  bindAwhinaChatOwner(uid, previous);
  try {
    const hasDraft = sessionStorage.getItem(SKY_AI_LISTING_DRAFT_KEY) !== null;
    const owner = sessionStorage.getItem(SKY_AI_LISTING_DRAFT_OWNER_KEY);
    if (uid === null) {
      const leavingAccount = typeof previous === "string";
      const staleAccountDraft = !!owner && owner !== GUEST_DRAFT_OWNER;
      if (leavingAccount || staleAccountDraft) {
        clearPersistedAwhinaSession();
        if (hasDraft || owner) removeStoredListingDraft();
      }
      return;
    }
    if (owner === uid) return;
    if (hasDraft && owner !== GUEST_DRAFT_OWNER) {
      clearPersistedAwhinaSession();
      removeStoredListingDraft();
    }
    sessionStorage.setItem(SKY_AI_LISTING_DRAFT_OWNER_KEY, uid);
  } catch {
    /* ignore */
  }
}

/** Test hook. */
export function __resetListingDraftOwnerForTests(): void {
  boundUid = undefined;
}
