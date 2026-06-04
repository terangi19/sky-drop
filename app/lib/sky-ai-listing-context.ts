import type { SkyAiListingContext } from "./sky-ai-types";

const STORAGE_KEY = "skyAiListingDraft";

export function syncListingDraftToSkyAi(draft: SkyAiListingContext) {
  if (typeof window === "undefined") return;
  try {
    const hasData = !!(draft.title || draft.description || draft.price);
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
    return JSON.parse(raw) as SkyAiListingContext;
  } catch {
    return null;
  }
}
