/**
 * Persist Āwhina session echo (task + pendingSlot) across surfaces.
 * Same conversationId must keep pending listing slots when navigating
 * global sheet → /post/ai (or remounting the chat panel).
 */

import type { ClientTaskScopeContext } from "./awhina-task-scope";
import type { ClientSearchContext } from "./awhina-search-memory";

export type PersistedAwhinaSession = {
  conversationId?: string | null;
  task?: ClientTaskScopeContext;
  search?: ClientSearchContext;
  /** Typed active listing slot mirrored from canonical sessionState */
  pendingSlot?: string | null;
  updatedAt: number;
};

const STORAGE_KEY = "skyAiAwhinaSessionV1";
const TTL_MS = 30 * 60 * 1000;

export function persistAwhinaSession(session: PersistedAwhinaSession): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedAwhinaSession = {
      ...session,
      updatedAt: session.updatedAt || Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readPersistedAwhinaSession(
  conversationId?: string | null
): PersistedAwhinaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAwhinaSession;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - (parsed.updatedAt || 0) > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // Same conversation only — do not leak slots across chats
    if (
      conversationId &&
      parsed.conversationId &&
      parsed.conversationId !== conversationId
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPersistedAwhinaSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
