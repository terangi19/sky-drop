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
