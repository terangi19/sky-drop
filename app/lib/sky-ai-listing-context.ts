import { hasActiveListingDraft } from "./sky-ai-draft-merge";
import { scrubLegacyFormPollution } from "./listing-draft-confirmed";
import type { SkyAiListingContext } from "./sky-ai-types";

const STORAGE_KEY = "skyAiListingDraft";

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
  } catch {
    /* ignore */
  }
}
