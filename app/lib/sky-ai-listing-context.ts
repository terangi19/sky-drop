import { hasActiveListingDraft } from "./sky-ai-draft-merge";
import { scrubLegacyFormPollution } from "./listing-draft-confirmed";
import type { SkyAiListingContext } from "./sky-ai-types";
import {
  SKY_AI_LISTING_DRAFT_KEY,
  SKY_AI_LISTING_DRAFT_OWNER_KEY,
  SKY_AI_LISTING_DRAFT_RESET_EVENT,
  currentDraftOwnerStamp,
  removeStoredListingDraft,
} from "./sky-ai-draft-owner";

const STORAGE_KEY = SKY_AI_LISTING_DRAFT_KEY;
export { SKY_AI_LISTING_DRAFT_RESET_EVENT };

function createDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `draft_${crypto.randomUUID()}`;
  }
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Create an identity before any async listing work starts. */
export function createListingDraftId(): string {
  return createDraftId();
}

export function syncListingDraftToSkyAi(draft: SkyAiListingContext) {
  if (typeof window === "undefined") return;
  try {
    const hasData = hasActiveListingDraft(draft);
    if (!hasData) {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SKY_AI_LISTING_DRAFT_OWNER_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    const owner = currentDraftOwnerStamp();
    if (owner) sessionStorage.setItem(SKY_AI_LISTING_DRAFT_OWNER_KEY, owner);
  } catch {
    /* ignore */
  }
}

export function readListingDraftFromSkyAi(): SkyAiListingContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SkyAiListingContext;
    return scrubLegacyFormPollution(parsed);
  } catch {
    return null;
  }
}

/**
 * Clear prior Sky AI draft (explicit NEW sell / replaceDraft).
 * `silent` skips the reset event (used right before navigating away after a publish).
 */
export function clearListingDraftFromSkyAi(opts?: { silent?: boolean }) {
  removeStoredListingDraft(opts);
}
