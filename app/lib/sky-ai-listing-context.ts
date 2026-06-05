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

export function readSkyAiSessionDraft<T = Record<string, unknown>>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("skyAiSessionDraft");
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

export function saveSkyAiSessionDraft(draft: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem("skyAiSessionDraft", JSON.stringify(draft)); } catch {}
}

export function readSkyAiSessionState(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("skyAiSessionState");
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  } catch { return null; }
}

export function saveSkyAiSessionState(state: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem("skyAiSessionState", JSON.stringify(state)); } catch {}
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
