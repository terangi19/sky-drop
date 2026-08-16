import { hasActiveListingDraft } from "./sky-ai-draft-merge";
import { scrubLegacyFormPollution } from "./listing-draft-confirmed";
import type { SkyAiListingContext } from "./sky-ai-types";

const STORAGE_KEY = "skyAiListingDraft";
export const SKY_AI_LISTING_DRAFT_RESET_EVENT = "sky-ai-listing-draft-reset";

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
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
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

/** Clear prior Sky AI draft (explicit NEW sell / replaceDraft). */
export function clearListingDraftFromSkyAi() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(SKY_AI_LISTING_DRAFT_RESET_EVENT));
  } catch {
    /* ignore */
  }
}
