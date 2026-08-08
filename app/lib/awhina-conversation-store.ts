/**
 * ONE canonical client conversation store for Āwhina.
 *
 * Global sheet + listing workspace subscribe to the same identity.
 * Changing surface (global ↔ listing_workspace) MUST NOT reset conversationId,
 * messages, task, pendingSlot, or draft linkage. Route change ≠ task change.
 */

"use client";

import { useSyncExternalStore } from "react";
import {
  clearPersistedAwhinaSession,
  persistAwhinaSession,
  readPersistedAwhinaSession,
  type PersistedAwhinaSession,
} from "./awhina-session-persist";
import { clearListingDraftFromSkyAi, readListingDraftFromSkyAi } from "./sky-ai-listing-context";
import type { SkyAiListingContext } from "./sky-ai-types";

export type AwhinaUiSurface = "global" | "listing_workspace";

export type AwhinaConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  _rawText?: string;
  images?: string[];
  navigating?: boolean;
  streaming?: boolean;
  progressLabel?: string;
};

export type AwhinaConversationStatus = "idle" | "busy" | "expanding";

export type AwhinaHandoffState = {
  pending: boolean;
  /** Auto-open workspace chat after nav */
  autoOpen: boolean;
  /** Hint the workspace should continue the listing dialogue */
  autoContinue: boolean;
  fromSurface?: AwhinaUiSurface;
  at: number;
};

export type AwhinaSessionEcho = {
  task?: PersistedAwhinaSession["task"];
  search?: PersistedAwhinaSession["search"];
  pendingSlot?: string | null;
};

export type AwhinaConversationState = {
  conversationId: string | null;
  messages: AwhinaConversationMessage[];
  awhinaSession: AwhinaSessionEcho | null;
  activeTask: string | null;
  pendingSlot: string | null;
  /** Pending composer attachments (data URLs) — shared so remount keeps photos */
  uploadedImages: { dataUrl: string; name: string }[];
  status: AwhinaConversationStatus;
  surface: AwhinaUiSurface;
  handoff: AwhinaHandoffState | null;
  listingFillOccurred: boolean;
  /** Last welcome seed used when messages were empty */
  welcomeSeed?: string;
  updatedAt: number;
};

const MESSAGES_KEY = "skyAiAwhinaMessagesV1";
const STATE_META_KEY = "skyAiAwhinaConversationMetaV1";
const TTL_MS = 30 * 60 * 1000;

type PersistedMessagesBlob = {
  conversationId: string | null;
  messages: AwhinaConversationMessage[];
  listingFillOccurred?: boolean;
  updatedAt: number;
};

type PersistedMetaBlob = {
  surface?: AwhinaUiSurface;
  handoff?: AwhinaHandoffState | null;
  updatedAt: number;
};

function emptyState(welcome?: string): AwhinaConversationState {
  return {
    conversationId: null,
    messages: welcome
      ? [{ id: "welcome", role: "assistant", text: welcome }]
      : [],
    awhinaSession: null,
    activeTask: null,
    pendingSlot: null,
    uploadedImages: [],
    status: "idle",
    surface: "global",
    handoff: null,
    listingFillOccurred: false,
    welcomeSeed: welcome,
    updatedAt: Date.now(),
  };
}

function readConversationIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("skyAiConversationId");
  } catch {
    return null;
  }
}

function writeConversationId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem("skyAiConversationId", id);
    else localStorage.removeItem("skyAiConversationId");
  } catch {
    /* ignore */
  }
}

function persistMessages(state: AwhinaConversationState) {
  if (typeof window === "undefined") return;
  try {
    const durable = state.messages
      .filter((m) => !m.streaming)
      .slice(-40)
      .map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        _rawText: m._rawText,
        images: m.images,
        navigating: m.navigating,
      }));
    const blob: PersistedMessagesBlob = {
      conversationId: state.conversationId,
      messages: durable,
      listingFillOccurred: state.listingFillOccurred,
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(blob));
  } catch {
    /* quota */
  }
}

function persistMeta(state: AwhinaConversationState) {
  if (typeof window === "undefined") return;
  try {
    const blob: PersistedMetaBlob = {
      surface: state.surface,
      handoff: state.handoff,
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(STATE_META_KEY, JSON.stringify(blob));
  } catch {
    /* ignore */
  }
}

function hydrateFromStorage(): AwhinaConversationState {
  const base = emptyState();
  if (typeof window === "undefined") return base;

  const conversationId = readConversationIdFromStorage();
  base.conversationId = conversationId;

  const session = readPersistedAwhinaSession(conversationId);
  if (session) {
    base.awhinaSession = {
      task: session.task,
      search: session.search,
      pendingSlot: session.pendingSlot ?? null,
    };
    base.activeTask = (session.task?.task as string | undefined) || null;
    base.pendingSlot = session.pendingSlot ?? null;
  }

  try {
    const raw = sessionStorage.getItem(MESSAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedMessagesBlob;
      if (
        parsed &&
        typeof parsed === "object" &&
        Date.now() - (parsed.updatedAt || 0) <= TTL_MS
      ) {
        const sameThread =
          !conversationId ||
          !parsed.conversationId ||
          parsed.conversationId === conversationId;
        if (sameThread && Array.isArray(parsed.messages) && parsed.messages.length) {
          base.messages = parsed.messages.filter(
            (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string"
          );
          base.listingFillOccurred = !!parsed.listingFillOccurred;
          if (parsed.conversationId && !base.conversationId) {
            base.conversationId = parsed.conversationId;
          }
        }
      } else if (parsed) {
        sessionStorage.removeItem(MESSAGES_KEY);
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const metaRaw = sessionStorage.getItem(STATE_META_KEY);
    if (metaRaw) {
      const meta = JSON.parse(metaRaw) as PersistedMetaBlob;
      if (meta && Date.now() - (meta.updatedAt || 0) <= TTL_MS) {
        if (meta.surface) base.surface = meta.surface;
        if (meta.handoff) base.handoff = meta.handoff;
      }
    }
  } catch {
    /* ignore */
  }

  base.updatedAt = Date.now();
  return base;
}

let state: AwhinaConversationState =
  typeof window !== "undefined" ? hydrateFromStorage() : emptyState();

const listeners = new Set<() => void>();

function emit() {
  state = { ...state, updatedAt: Date.now() };
  for (const l of listeners) l();
}

function commit(next: AwhinaConversationState, opts?: { persistMsgs?: boolean }) {
  state = { ...next, updatedAt: Date.now() };
  if (opts?.persistMsgs !== false) persistMessages(state);
  persistMeta(state);
  writeConversationId(state.conversationId);
  if (state.awhinaSession) {
    persistAwhinaSession({
      conversationId: state.conversationId,
      task: state.awhinaSession.task,
      search: state.awhinaSession.search,
      pendingSlot: state.pendingSlot ?? state.awhinaSession.pendingSlot ?? null,
      updatedAt: Date.now(),
    });
  }
  for (const l of listeners) l();
}

export function getAwhinaConversationState(): AwhinaConversationState {
  return state;
}

export function subscribeAwhinaConversation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAwhinaConversation(): AwhinaConversationState {
  return useSyncExternalStore(
    subscribeAwhinaConversation,
    getAwhinaConversationState,
    () => emptyState()
  );
}

/** Resolve UI surface from pathname without changing conversation identity. */
export function surfaceFromPathname(pathname: string): AwhinaUiSurface {
  return pathname.startsWith("/post/ai") ? "listing_workspace" : "global";
}

export function setAwhinaSurface(surface: AwhinaUiSurface) {
  if (state.surface === surface) return;
  commit({ ...state, surface }, { persistMsgs: false });
}

export function setConversationId(id: string | null) {
  if (state.conversationId === id) return;
  commit({ ...state, conversationId: id });
}

export function setMessages(
  messages:
    | AwhinaConversationMessage[]
    | ((prev: AwhinaConversationMessage[]) => AwhinaConversationMessage[])
) {
  const next =
    typeof messages === "function" ? messages(state.messages) : messages;
  commit({ ...state, messages: next });
}

export function patchMessage(
  id: string,
  patch: Partial<AwhinaConversationMessage>
) {
  commit({
    ...state,
    messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  });
}

export function appendMessage(msg: AwhinaConversationMessage) {
  commit({ ...state, messages: [...state.messages, msg] });
}

export function setBusyStatus(busy: boolean) {
  const status: AwhinaConversationStatus = busy
    ? "busy"
    : state.handoff?.pending
      ? "expanding"
      : "idle";
  if (state.status === status) return;
  commit({ ...state, status }, { persistMsgs: false });
}

export function setAwhinaSessionEcho(session: AwhinaSessionEcho | null) {
  commit({
    ...state,
    awhinaSession: session,
    activeTask: (session?.task?.task as string | undefined) || state.activeTask,
    pendingSlot: session?.pendingSlot ?? state.pendingSlot,
  });
}

export function setListingFillOccurred(v: boolean) {
  if (state.listingFillOccurred === v) return;
  commit({ ...state, listingFillOccurred: v });
}

export function setUploadedImages(
  images:
    | { dataUrl: string; name: string }[]
    | ((
        prev: { dataUrl: string; name: string }[]
      ) => { dataUrl: string; name: string }[])
) {
  const next = typeof images === "function" ? images(state.uploadedImages) : images;
  commit({ ...state, uploadedImages: next }, { persistMsgs: false });
}

/**
 * Seed welcome only when there is no real conversation yet.
 * Never clobber an in-flight handoff transcript.
 */
export function ensureWelcomeMessage(welcomeText: string) {
  const hasReal = state.messages.some((m) => m.id !== "welcome");
  if (hasReal) return;
  if (
    state.messages.length === 1 &&
    state.messages[0]?.id === "welcome" &&
    state.messages[0].text === welcomeText
  ) {
    return;
  }
  if (state.messages.length === 0 || state.messages[0]?.id === "welcome") {
    commit({
      ...state,
      messages: [{ id: "welcome", role: "assistant", text: welcomeText }],
      welcomeSeed: welcomeText,
    });
  }
}

/** Begin homepage → /post/ai expand. Does not clear conversation identity. */
export function beginListingWorkspaceHandoff(opts?: {
  autoContinue?: boolean;
}) {
  commit({
    ...state,
    surface: "listing_workspace",
    status: "expanding",
    handoff: {
      pending: true,
      autoOpen: true,
      autoContinue: opts?.autoContinue !== false,
      fromSurface: state.surface === "listing_workspace" ? "global" : state.surface,
      at: Date.now(),
    },
    messages: state.messages.map((m, i, arr) =>
      i === arr.length - 1 && m.role === "assistant"
        ? { ...m, navigating: true, streaming: false }
        : m
    ),
  });
}

/** Consume handoff flags after workspace mounts (auto-open chat). */
export function consumeListingWorkspaceHandoff(): AwhinaHandoffState | null {
  const h = state.handoff;
  if (!h?.pending) return null;
  commit(
    {
      ...state,
      handoff: null,
      status: state.status === "expanding" ? "idle" : state.status,
      messages: state.messages.map((m) =>
        m.navigating ? { ...m, navigating: false } : m
      ),
    },
    { persistMsgs: true }
  );
  return h;
}

export function peekListingWorkspaceHandoff(): AwhinaHandoffState | null {
  return state.handoff?.pending ? state.handoff : null;
}

/**
 * Fresh listing task — clears draft + messages for a new sell.
 * Does NOT run on mere route changes (home ↔ /post/ai).
 */
export function startFreshListingTask(welcomeText?: string) {
  clearListingDraftFromSkyAi();
  clearPersistedAwhinaSession();
  writeConversationId(null);
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(MESSAGES_KEY);
      sessionStorage.removeItem(STATE_META_KEY);
    } catch {
      /* ignore */
    }
  }
  commit({
    ...emptyState(welcomeText),
    surface: state.surface,
    conversationId: null,
  });
}

/** Clear only chat transcript (New chat) — keeps draft unless caller clears it. */
export function resetConversationMessages(welcomeText: string) {
  writeConversationId(null);
  clearPersistedAwhinaSession();
  commit({
    ...state,
    conversationId: null,
    messages: [{ id: "welcome", role: "assistant", text: welcomeText }],
    awhinaSession: null,
    activeTask: null,
    pendingSlot: null,
    uploadedImages: [],
    listingFillOccurred: false,
    handoff: null,
    status: "idle",
    welcomeSeed: welcomeText,
  });
}

/** Read linked listing draft (sessionStorage) without owning form fields. */
export function readLinkedListingDraft(): SkyAiListingContext | null {
  return readListingDraftFromSkyAi();
}

/** Test helper */
export function __resetAwhinaConversationStoreForTests() {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(MESSAGES_KEY);
      sessionStorage.removeItem(STATE_META_KEY);
    } catch {
      /* ignore */
    }
  }
  state = emptyState();
  emit();
}

export function __replaceAwhinaConversationStoreForTests(
  next: Partial<AwhinaConversationState>
) {
  state = { ...emptyState(), ...next, updatedAt: Date.now() };
  emit();
}
