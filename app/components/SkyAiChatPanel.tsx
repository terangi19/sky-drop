"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import {
  AWHINA_ASK_LABEL,
  AWHINA_NAME,
  AWHINA_REQUEST_FAILED,
  AWHINA_THINKING,
} from "../lib/awhina-brand";
import { skyAiRuleFallbackText } from "../lib/openai-health";
import { detectSkyAiIntent } from "../lib/sky-ai-intent";
import {
  dispatchListingFill,
  SKY_AI_LISTING_FILL_EVENT,
  stripSkyAiMachineTags,
  type SkyAiListingFill,
} from "../lib/sky-ai-listing-fill";
import {
  SKY_AI_LISTING_FILL_SUCCESS,
  SKY_AI_QUICK_PROMPTS,
  SKY_AI_WELCOME,
  isSkyAiGeneralQuestion,
  isSkyAiWelcomeBleed,
} from "../lib/sky-ai-prompts";
import { dispatchSkyAiComposerActive, dispatchWorkspaceHandoff, SKY_AI_OPEN_EVENT, type SkyAiOpenDetail } from "../lib/sky-ai-events";
import {
  persistAwhinaSession,
  readPersistedAwhinaSession,
} from "../lib/awhina-session-persist";
import {
  appendMessage,
  beginListingWorkspaceHandoff,
  ensureWelcomeMessage,
  getAwhinaConversationState,
  patchMessage,
  resetConversationMessages,
  setAwhinaSessionEcho,
  setAwhinaSurface,
  setBusyStatus,
  setConversationId as setStoreConversationId,
  setListingFillOccurred as setStoreListingFillOccurred,
  setMessages as setStoreMessages,
  setUploadedImages as setStoreUploadedImages,
  surfaceFromPathname,
  useAwhinaConversation,
  type AwhinaConversationMessage,
} from "../lib/awhina-conversation-store";
import {
  decideSellWorkspaceHandoff,
  preferBriefHandoffReply,
} from "../lib/awhina-sell-handoff";
import { AWHINA_CHAT_BACKDROP_Z, AWHINA_CHAT_SHEET_Z } from "../lib/floating-ui-layout";
import { mergeListingFillWithDraft } from "../lib/sky-ai-draft-merge";
import { readListingDraftFromSkyAi, clearListingDraftFromSkyAi } from "../lib/sky-ai-listing-context";
import {
  dispatchListingImages,
  prepareSkyAiImages,
  SKY_AI_MAX_IMAGES_PER_MESSAGE,
} from "../lib/sky-ai-images";
import { getFreshIdToken } from "../lib/api-auth";
import { getClientCsrfToken } from "../lib/csrf-client";
import { resolveVoiceCommand } from "../lib/awhina-voice-command";
import { showToast } from "./Toast";
import { useVoiceInput } from "../hooks/useVoiceInput";
import type { SkyAiConversationSummary } from "../lib/sky-ai-types";
import {
  AWHINA_PROGRESS_LABELS,
  type AwhinaProgressState,
} from "../lib/awhina-product-ux";

export type SkyAiChatPanelMode = "sheet" | "inline";

type ChatMessage = AwhinaConversationMessage;

type PendingAttachment = { dataUrl: string; name: string };

type QuickPrompt = { label: string; query: string };

export type SkyAiChatPanelProps = {
  mode: SkyAiChatPanelMode;
  /** Inline: controlled visibility from parent */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Send this message once when the panel opens (e.g. quick prompt chip) */
  autoQuery?: string;
  onAutoQueryConsumed?: () => void;
  onFill?: (fill: SkyAiListingFill) => void;
  /** Sheet mode: show built-in bottom-right FAB (default true). */
  floatingFab?: boolean;
  quickPrompts?: QuickPrompt[];
  /** First assistant message (defaults to global welcome) */
  welcomeText?: string;
  /** When global Voice Mode is on, chat mic is disabled to avoid dual-mic conflicts. */
  globalVoiceActive?: boolean;
  className?: string;
  /**
   * /post/ai listing workspace: hide duplicate branded header, stretch chat,
   * composer pinned bottom, skip internal listing-preview card (page owns draft UI).
   */
  workspaceChrome?: boolean;
};

function handleListingFill(fill: SkyAiListingFill | undefined, _navigateTo?: string) {
  if (!fill) return _navigateTo;
  const replaceDraft = fill.replaceDraft === true;
  if (replaceDraft) clearListingDraftFromSkyAi();
  const merged = replaceDraft
    ? { ...fill }
    : mergeListingFillWithDraft(readListingDraftFromSkyAi(), fill);
  const hasContent =
    !!merged.title ||
    !!merged.description ||
    !!merged.price ||
    !!merged.rentalPriceWeekly ||
    !!merged.rentalPriceMonthly ||
    !!merged.vehicleMake ||
    !!merged.vehicleModel ||
    !!(merged.extras && merged.extras.length > 0);
  if (!hasContent) return _navigateTo;
  dispatchListingFill(merged);
  return "/post/ai";
}

function expandToListingWorkspace(navigateTo: string | undefined): string | undefined {
  if (navigateTo !== "/post/ai") return navigateTo;
  beginListingWorkspaceHandoff({ autoContinue: true });
  return "/post/ai";
}

/** Older replies included a ChatGPT-off preamble — hide it in the UI. */
function stripLegacyChatGptWarning(text: string): string {
  return text
    .replace(/\*\*ChatGPT mode is off\*\*[\s\S]*?---\n\n/g, "")
    .replace(/\*\*(Āwhina|Awhina) limited:\*\*[^\n]*\n\n/gi, "")
    .trim();
}

function renderText(text: string) {
  const parts = stripLegacyChatGptWarning(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-always-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function welcomeMessages(text: string): ChatMessage[] {
  return [{ id: "welcome", role: "assistant", text }];
}

export default function SkyAiChatPanel({
  mode,
  open: openControlled,
  onOpenChange,
  autoQuery,
  onAutoQueryConsumed,
  onFill,
  quickPrompts = SKY_AI_QUICK_PROMPTS,
  welcomeText = SKY_AI_WELCOME,
  globalVoiceActive = false,
  className = "",
  floatingFab = true,
  workspaceChrome = false,
}: SkyAiChatPanelProps) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const isSheet = mode === "sheet";
  const isWorkspace = workspaceChrome || className.includes("awhina-listing-workspace-chat");
  const isControlledSheet = isSheet && openControlled !== undefined;
  const [openInternal, setOpenInternal] = useState(false);
  const open = isSheet
    ? isControlledSheet
      ? (openControlled ?? false)
      : openInternal
    : (openControlled ?? false);
  const setOpen = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const prev = isSheet
        ? isControlledSheet
          ? (openControlled ?? false)
          : openInternal
        : (openControlled ?? false);
      const next = typeof v === "function" ? v(prev) : v;
      if (isSheet && !isControlledSheet) setOpenInternal(next);
      else onOpenChange?.(next);
    },
    [isSheet, isControlledSheet, openInternal, openControlled, onOpenChange]
  );

  const [user, setUser] = useState<User | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<SkyAiConversationSummary[]>([]);
  const conversation = useAwhinaConversation();
  const messages = conversation.messages;
  const conversationId = conversation.conversationId;
  const setConversationId = setStoreConversationId;
  const setMessages = setStoreMessages;
  /** Stable anon session — isolates guest search/task memory across browsers */
  const [anonSessionId] = useState<string>(() => {
    if (typeof window === "undefined") return `anon_ssr_${Math.random().toString(36).slice(2)}`;
    try {
      let id = localStorage.getItem("skyAiAnonSessionId");
      if (!id) {
        id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `anon_${crypto.randomUUID()}`
            : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem("skyAiAnonSessionId", id);
      }
      return id;
    } catch {
      return `anon_${Date.now()}`;
    }
  });
  const awhinaSessionRef = useRef<{
    task?: {
      task?: string;
      pendingItem?: string;
      compareCandidates?: string[];
      pendingClarification?: {
        kind?: string;
        status?: string;
        pendingSlot?: string;
        knownEntities?: Record<string, string>;
        missingListingSlots?: string[];
        missingSlots?: string[];
        priorMessage?: string;
        askedAt?: number;
        [key: string]: unknown;
      };
      entityLockKey?: string;
      entityLocked?: boolean;
      updatedAt?: number;
    };
    search?: { filters?: Record<string, unknown>; updatedAt?: number };
    pendingSlot?: string | null;
  } | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listingPreviewFill, setListingPreviewFill] = useState<SkyAiListingFill | null>(null);
  const fileInputRefInternal = useRef<HTMLInputElement>(null);
  const [publishing, setPublishing] = useState(false);
  const pendingImages = conversation.uploadedImages;
  const setPendingImages = setStoreUploadedImages;
  const [imageBusy, setImageBusy] = useState(false);
  const [openAiReady, setOpenAiReady] = useState(true);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const listingFillOccurred = conversation.listingFillOccurred;
  const listingFillOccurredRef = useRef(conversation.listingFillOccurred);
  const setListingFillOccurred = useCallback((v: boolean) => {
    listingFillOccurredRef.current = v;
    setStoreListingFillOccurred(v);
  }, []);

  // Keep surface in sync with route — never resets conversation identity
  useEffect(() => {
    setAwhinaSurface(surfaceFromPathname(pathname));
  }, [pathname]);

  // Seed welcome only when store has no real transcript yet
  useEffect(() => {
    ensureWelcomeMessage(welcomeText);
  }, [welcomeText, mode]);

  // Mirror session echo into ref for API requests
  useEffect(() => {
    if (conversation.awhinaSession) {
      awhinaSessionRef.current = conversation.awhinaSession as typeof awhinaSessionRef.current;
    }
  }, [conversation.awhinaSession]);

  useEffect(() => {
    listingFillOccurredRef.current = listingFillOccurred;
  }, [listingFillOccurred]);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sky-ai/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.openaiReady === "boolean") {
          setOpenAiReady(data.openaiReady);
        }
      })
      .catch(() => {
        /* keep default subtitle */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Hydrate pendingSlot / task scope when remounting (global sheet → /post/ai)
  useEffect(() => {
    if (awhinaSessionRef.current?.task?.pendingClarification) return;
    const stored = readPersistedAwhinaSession(conversationId);
    if (!stored?.task) return;
    const echo = {
      task: stored.task as NonNullable<typeof awhinaSessionRef.current>["task"],
      search: stored.search as NonNullable<typeof awhinaSessionRef.current>["search"],
      pendingSlot: stored.pendingSlot ?? null,
    };
    awhinaSessionRef.current = echo;
    setAwhinaSessionEcho(echo as never);
  }, [conversationId]);

  useEffect(() => {
    return () => {
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
    };
  }, []);

  const loadConversations = useCallback(async () => {
    const token = await getFreshIdToken();
    if (!token) return;
    try {
      const res = await fetch("/api/sky-ai/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (user && open) loadConversations();
  }, [user, open, loadConversations]);

  const runNavigate = useCallback(
    (path: string) => {
      if (isSheet && (path.startsWith("/search") || path === "/vehicles" || path === "/")) {
        setOpen(false);
      }
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      navigateTimerRef.current = setTimeout(() => {
        router.push(path);
        const hash = path.includes("#") ? path.split("#")[1] : "";
        if (hash) {
          setTimeout(() => {
            document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 400);
        }
      }, 100);
    },
    [router, isSheet, setOpen]
  );

  const updateAssistant = useCallback((id: string, patch: Partial<ChatMessage>) => {
    const cur = getAwhinaConversationState().messages.find((m) => m.id === id);
    let nextPatch = { ...patch };
    if (patch.text && listingFillOccurredRef.current && isSkyAiWelcomeBleed(patch.text)) {
      nextPatch = { ...nextPatch, text: SKY_AI_LISTING_FILL_SUCCESS };
    }
    if (cur) patchMessage(id, nextPatch);
  }, []);

  const addAssistantMessage = useCallback((msg: ChatMessage) => {
    if (msg.text && listingFillOccurredRef.current && isSkyAiWelcomeBleed(msg.text)) {
      appendMessage({ ...msg, text: SKY_AI_LISTING_FILL_SUCCESS });
      return;
    }
    appendMessage(msg);
  }, []);

  const startNewChat = useCallback(() => {
    resetConversationMessages(welcomeText);
    if (pathname.startsWith("/post/ai")) {
      // New chat on sell page = fresh listing task
      clearListingDraftFromSkyAi();
    }
    setShowHistory(false);
    setListingPreviewFill(null);
  }, [welcomeText, pathname]);

  const openConversation = useCallback(async (id: string) => {
    const token = await getFreshIdToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sky-ai/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const loaded: ChatMessage[] = (data.messages || []).map(
        (m: { id: string; role: string; content: string }) => {
          const isAssistant = m.role !== "user";
          const hasListingFill = isAssistant && /\[\[LISTING_FILL\]\]/.test(m.content);
          return {
            id: m.id,
            role: isAssistant ? "assistant" : "user",
            text: hasListingFill ? stripSkyAiMachineTags(m.content) : m.content,
            ...(hasListingFill ? { _rawText: m.content } : {}),
          };
        }
      );
      const hadListingFill = loaded.some(
        (msg) => msg.role === "assistant" && /\[\[LISTING_FILL\]\]/.test((msg as ChatMessage & { _rawText?: string })._rawText || msg.text)
      );
      setListingFillOccurred(hadListingFill);
      const filtered = loaded.map((msg) => {
        if (hadListingFill && msg.role === "assistant" && isSkyAiWelcomeBleed(msg.text)) {
          return { ...msg, text: SKY_AI_LISTING_FILL_SUCCESS };
        }
        return msg;
      });
      setConversationId(id);
      setMessages(filtered.length ? filtered : welcomeMessages(welcomeText));
      setShowHistory(false);
    } catch {
      /* ignore */
    }
    setBusy(false);
  }, []);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!files.length) return;

    const room = SKY_AI_MAX_IMAGES_PER_MESSAGE - pendingImages.length;
    if (room <= 0) return;

    setImageBusy(true);
    const prepared = await prepareSkyAiImages(files.slice(0, room));
    setImageBusy(false);

    if ("error" in prepared) {
      window.alert(prepared.error);
      return;
    }

    setPendingImages((prev) => [
      ...prev,
      ...prepared.dataUrls.map((dataUrl, i) => ({
        dataUrl,
        name: prepared.names[i] || `photo-${i + 1}.jpg`,
      })),
    ]);
  };

  const respond = useCallback(
    async (query: string, attachmentOverride?: PendingAttachment[]) => {
      const trimmed = query.trim();
      const attachments = attachmentOverride ?? pendingImages;
      const imageUrls = attachments.map((a) => a.dataUrl);
      const imageNames = attachments.map((a) => a.name);

      if ((!trimmed && imageUrls.length === 0) || busy) return;

      const switchedIntent =
        isSkyAiGeneralQuestion(trimmed) ||
        detectSkyAiIntent(trimmed) === "find_buy" ||
        detectSkyAiIntent(trimmed) === "price_value" ||
        detectSkyAiIntent(trimmed) === "visibility_issue" ||
        detectSkyAiIntent(trimmed) === "buy_trouble";
      if (switchedIntent) setListingFillOccurred(false);

      if (imageUrls.length && pathname.startsWith("/post/ai")) {
        dispatchListingImages(imageUrls, imageNames);
      }

      setPendingImages([]);

      const displayText =
        trimmed ||
        (imageUrls.length > 1
          ? `📷 ${imageUrls.length} photos`
          : "📷 Photo");

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: displayText,
        images: imageUrls.length ? imageUrls : undefined,
      };
      setMessages((prev) => [...prev.filter((m) => m.id !== "welcome"), userMsg]);
      setBusy(true);
      setBusyStatus(true);

      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome" && !m.streaming)
        .slice(-20)
        .map((m) => {
          // Use _rawText if available to preserve LISTING_FILL tags for state-awareness detection
          const textToUse = (m as any)._rawText || m.text;
          return {
            role: m.role,
            content: m.images?.length ? `${textToUse} [sent ${m.images.length} photo(s)]` : textToUse,
          };
        });

      const assistantId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", text: "", streaming: true };
      addAssistantMessage(assistantMsg);

      let navigateTo: string | undefined;
      let newConversationId = conversationId;
      let finalMessage = trimmed ||
        "I uploaded product photo(s). Analyze them and fill my Quick Post listing with LISTING_FILL.";

      const isSellPage = pathname.startsWith("/post/ai");

      if (isSellPage) {
        const hasListingFields = /(?:^|\n)(title|price|description|location|condition|category|make|model|year|odometer|colour|color|transmission|fuel|mileage|km|kms)\s*:/i.test(finalMessage);
        const hasListingType = /(?:rental|vehicle|service|digital|item|physical)\s+listing|for\s+(sale|rent)|wanted|auction/i.test(finalMessage);
        const hasMultipleFields = (finalMessage.match(/(?:^|\n)\s*\w+\s*:/g) || []).length >= 2;
        const hasVehicle = /\b(toyota|honda|mazda|ford|holden|nissan|subaru|mitsubishi|hyundai|kia|bmw|mercedes|audi|volkswagen|vw|hilux|corolla|camry|rav4|cx-5|axela|swift|ranger|commodore)\b/i.test(finalMessage);
        const hasPrice = /\$[\d,]+/.test(finalMessage);
        const hasSellingIntent = /\b(i('m| am| want to)?\s*(sell|selling|list|listing|post|create|advertise)|for sale|selling my|want to sell)\b/i.test(finalMessage);
        const hasItem = /\b(ps5|playstation|xbox|iphone|samsung|laptop|macbook|tv|couch|sofa|fridge|bike|guitar|camera|lawn|mow|clean|handyman|tutor|design|website|template|ebook|apartment|flat|room)\b/i.test(finalMessage);
        const hasOdometer = /\b\d{2,3}[\s,]?\d{3}\s*km\b/i.test(finalMessage);
        const yearAtStart = /^\d{4}\s+[A-Za-z]/.test(finalMessage);

        if (hasListingFields || hasListingType || hasMultipleFields || hasVehicle || (hasPrice && (hasSellingIntent || hasItem)) || hasOdometer || yearAtStart || hasSellingIntent) {
          finalMessage = `[LISTING CREATION REQUEST]\nThe user is on the Sell page. Parse everything below as listing data and respond ONLY with LISTING_FILL JSON. Generate a complete listing (title, description, all relevant fields). Do not give general chat advice.\n\n${finalMessage}`;
        }
      }

      try {
        const token = await getFreshIdToken();
        const listingContext =
          pathname.startsWith("/post/ai") || !switchedIntent
            ? readListingDraftFromSkyAi()
            : null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        const res = await fetch("/api/sky-ai", {
          signal: controller.signal,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: finalMessage,
            pathname,
            history: user ? undefined : history,
            conversationId: user ? conversationId || undefined : undefined,
            anonSessionId: user ? undefined : anonSessionId,
            awhinaSession: awhinaSessionRef.current || undefined,
            listingContext,
            images: imageUrls.length ? imageUrls : undefined,
            stream: true,
          }),
        });
        clearTimeout(timeout);

        let responseHandled = false;

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            reply?: string;
            navigateTo?: string;
            listingFill?: SkyAiListingFill;
            error?: string;
          };
          if (typeof data.reply === "string" && data.reply.trim()) {
            navigateTo = data.navigateTo;
            const navFromFill = handleListingFill(data.listingFill, navigateTo);
            if (navFromFill) navigateTo = navFromFill;
            updateAssistant(assistantId, {
              text: data.reply,
              streaming: false,
              navigating: !!navigateTo,
            });
            responseHandled = true;
          } else {
            throw new Error(
              typeof data.error === "string" ? data.error : AWHINA_REQUEST_FAILED
            );
          }
        }

        const contentType = res.headers.get("content-type") || "";
        if (!responseHandled && contentType.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let accumulated = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const evt = JSON.parse(line.slice(6)) as {
                  type: string;
                  text?: string;
                  reply?: string;
                  navigateTo?: string;
                  state?: AwhinaProgressState;
                  listingFill?: SkyAiListingFill;
                  conversationId?: string;
                  awhinaSession?: {
                    task?: {
                      task?: string;
                      pendingItem?: string;
                      compareCandidates?: string[];
                      pendingClarification?: {
                        kind?: string;
                        status?: string;
                        pendingSlot?: string;
                        knownEntities?: Record<string, string>;
                        missingListingSlots?: string[];
                        [key: string]: unknown;
                      };
                      entityLockKey?: string;
                      entityLocked?: boolean;
                      updatedAt?: number;
                    };
                    search?: { filters?: Record<string, unknown>; updatedAt?: number };
                    pendingSlot?: string | null;
                  };
                  source?: string;
                  error?: string;
                };
                if (evt.type === "progress" && evt.state) {
                  const label =
                    AWHINA_PROGRESS_LABELS[evt.state] || "Working…";
                  updateAssistant(assistantId, {
                    progressLabel: label,
                    streaming: true,
                    navigating: false,
                  });
                }
                if (evt.type === "delta" && evt.text) {
                  accumulated += evt.text;
                  const stripped = stripSkyAiMachineTags(accumulated);
                  // Filter welcome message during streaming if listing fill just occurred
                  const filtered =
                    listingFillOccurredRef.current && isSkyAiWelcomeBleed(stripped)
                      ? SKY_AI_LISTING_FILL_SUCCESS
                      : stripped;
                  updateAssistant(assistantId, {
                    text: filtered,
                    _rawText: accumulated, // Preserve raw text with LISTING_FILL tags
                    progressLabel: undefined,
                  });
                }
                if (evt.type === "done") {
                  navigateTo = evt.navigateTo;
                  responseHandled = true;
                  if (evt.awhinaSession) {
                    awhinaSessionRef.current = evt.awhinaSession;
                    setAwhinaSessionEcho(evt.awhinaSession as never);
                    persistAwhinaSession({
                      conversationId: evt.conversationId || conversationId,
                      task: evt.awhinaSession.task as never,
                      search: evt.awhinaSession.search as never,
                      pendingSlot:
                        (evt.awhinaSession as { pendingSlot?: string | null }).pendingSlot ??
                        evt.awhinaSession.task?.pendingClarification?.pendingSlot ??
                        null,
                      updatedAt: Date.now(),
                    });
                  }
                  if (isSellPage && navigateTo === "/post/ai") navigateTo = undefined;
                  if (evt.listingFill) {
                    setListingFillOccurred(true);
                    if (isSellPage) {
                      setListingPreviewFill(evt.listingFill);
                      const replaceDraft = evt.listingFill.replaceDraft === true;
                      if (replaceDraft) clearListingDraftFromSkyAi();
                      const merged = replaceDraft
                        ? { ...evt.listingFill }
                        : mergeListingFillWithDraft(readListingDraftFromSkyAi(), evt.listingFill);
                      onFill?.(merged);
                      navigateTo = undefined;
                      const aiReply = evt.reply || stripSkyAiMachineTags(accumulated);
                      const cleanReply = aiReply && aiReply.length > 10
                        ? aiReply
                        : SKY_AI_LISTING_FILL_SUCCESS;
                      updateAssistant(assistantId, {
                        text: cleanReply,
                        _rawText: accumulated, // Preserve raw text with LISTING_FILL tags
                        streaming: false,
                        navigating: false,
                        progressLabel: undefined,
                      });
                    } else {
                      const navFromFill = handleListingFill(evt.listingFill, navigateTo);
                      if (navFromFill) navigateTo = navFromFill;
                      const handoff = decideSellWorkspaceHandoff({
                        message: trimmed,
                        pathname,
                        listingFill: evt.listingFill,
                        navigateTo,
                        hasImages: imageUrls.length > 0,
                      });
                      const aiReply = evt.reply || stripSkyAiMachineTags(accumulated);
                      let cleanReply =
                        aiReply && aiReply.length > 10 && !isSkyAiWelcomeBleed(aiReply)
                          ? aiReply
                          : SKY_AI_LISTING_FILL_SUCCESS;
                      if (handoff.shouldExpand) {
                        cleanReply =
                          preferBriefHandoffReply(cleanReply, handoff) || cleanReply;
                        navigateTo = expandToListingWorkspace("/post/ai");
                      }
                      updateAssistant(assistantId, {
                        text: cleanReply,
                        _rawText: accumulated, // Preserve raw text with LISTING_FILL tags
                        streaming: false,
                        navigating: !!navigateTo,
                        progressLabel: undefined,
                      });
                    }
                  } else {
                    const navFromFill = handleListingFill(evt.listingFill, navigateTo);
                    if (navFromFill) navigateTo = navFromFill;
                    const handoff = !isSellPage
                      ? decideSellWorkspaceHandoff({
                          message: trimmed,
                          pathname,
                          listingFill: null,
                          navigateTo,
                          hasImages: imageUrls.length > 0,
                        })
                      : { shouldExpand: false as const, reason: "already_workspace" as const };
                    let replyText = stripSkyAiMachineTags(evt.reply || accumulated);
                    if (handoff.shouldExpand) {
                      replyText = preferBriefHandoffReply(replyText, handoff) || replyText;
                      navigateTo = expandToListingWorkspace("/post/ai");
                    }
                    updateAssistant(assistantId, {
                      text: replyText,
                      streaming: false,
                      navigating: !!navigateTo,
                    });
                  }
                  if (evt.conversationId) newConversationId = evt.conversationId;
                }
                if (evt.type === "error") throw new Error(evt.error || "Stream failed");
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) continue;
                throw parseErr;
              }
            }
          }
        } else if (!responseHandled) {
          const data = await res.json();
          navigateTo = data.navigateTo;
          if (isSellPage && navigateTo === "/post/ai") navigateTo = undefined;
          if (data.listingFill) {
            setListingFillOccurred(true);
            if (isSellPage) {
              setListingPreviewFill(data.listingFill);
              const replaceDraft = data.listingFill.replaceDraft === true;
              if (replaceDraft) clearListingDraftFromSkyAi();
              const merged = replaceDraft
                ? { ...data.listingFill }
                : mergeListingFillWithDraft(readListingDraftFromSkyAi(), data.listingFill);
              onFill?.(merged);
              navigateTo = undefined;
              const aiReply = data.reply || "";
              const cleanReply = aiReply && aiReply.length > 10
                ? aiReply
                : SKY_AI_LISTING_FILL_SUCCESS;
              updateAssistant(assistantId, {
                text: cleanReply,
                streaming: false,
                navigating: false,
              });
            } else {
              const navFromFill = handleListingFill(data.listingFill, navigateTo);
              if (navFromFill) navigateTo = navFromFill;
              const handoff = decideSellWorkspaceHandoff({
                message: trimmed,
                pathname,
                listingFill: data.listingFill,
                navigateTo,
                hasImages: imageUrls.length > 0,
              });
              const aiReply = data.reply || "";
              let cleanReply =
                aiReply && aiReply.length > 10 && !isSkyAiWelcomeBleed(aiReply)
                  ? aiReply
                  : SKY_AI_LISTING_FILL_SUCCESS;
              if (handoff.shouldExpand) {
                cleanReply = preferBriefHandoffReply(cleanReply, handoff) || cleanReply;
                navigateTo = expandToListingWorkspace("/post/ai");
              }
              updateAssistant(assistantId, {
                text: cleanReply,
                streaming: false,
                navigating: !!navigateTo,
              });
            }
          } else {
            const navFromFill = handleListingFill(data.listingFill, navigateTo);
            if (navFromFill) navigateTo = navFromFill;
            const handoff = !isSellPage
              ? decideSellWorkspaceHandoff({
                  message: trimmed,
                  pathname,
                  listingFill: null,
                  navigateTo,
                  hasImages: imageUrls.length > 0,
                })
              : { shouldExpand: false as const, reason: "already_workspace" as const };
            let replyText = data.reply || "";
            if (handoff.shouldExpand) {
              replyText = preferBriefHandoffReply(replyText, handoff) || replyText;
              navigateTo = expandToListingWorkspace("/post/ai");
            }
            updateAssistant(assistantId, {
              text: replyText,
              streaming: false,
              navigating: !!navigateTo,
            });
          }
          if (data.conversationId) newConversationId = data.conversationId;
          if (data.awhinaSession) {
            awhinaSessionRef.current = data.awhinaSession;
            setAwhinaSessionEcho(data.awhinaSession as never);
            persistAwhinaSession({
              conversationId: data.conversationId || conversationId,
              task: data.awhinaSession.task,
              search: data.awhinaSession.search,
              pendingSlot:
                data.awhinaSession.pendingSlot ??
                data.awhinaSession.task?.pendingClarification?.pendingSlot ??
                null,
              updatedAt: Date.now(),
            });
          }
        }
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        const isFetchFail = err instanceof Error && (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("Failed"));
        const rule = skyAiRuleFallbackText(trimmed, pathname);
        navigateTo = isSellPage && rule.navigateTo === "/post/ai" ? undefined : rule.navigateTo;
        let text: string;
        if (isAbort) {
          text = "Request timed out — please try again. If this keeps happening, try a shorter message.";
        } else if (isFetchFail) {
          text = "Couldn't connect to Āwhina — check your internet connection and try again.";
        } else if (
          err instanceof Error &&
          /too many requests/i.test(err.message)
        ) {
          text =
            "Āwhina is getting a lot of requests right now — wait 30 seconds and try again. Your listing text is still here, and you can fill the form manually below.";
        } else {
          text = rule.text;
          if (err instanceof Error && err.message && err.message !== AWHINA_REQUEST_FAILED) {
            text += `\n\n_${err.message}_`;
          }
        }
        updateAssistant(assistantId, {
          text,
          streaming: false,
          navigating: !!navigateTo,
        });
      }

      if (newConversationId) setConversationId(newConversationId);
      if (user) loadConversations();

      if (navigateTo) {
        if (navigateTo === "/post/ai") {
          beginListingWorkspaceHandoff({ autoContinue: true });
          dispatchWorkspaceHandoff({ autoOpen: true, autoContinue: true });
        }
        runNavigate(navigateTo);
      }
      setBusy(false);
      setBusyStatus(false);
    },
    [
      busy,
      messages,
      pathname,
      conversationId,
      user,
      runNavigate,
      updateAssistant,
      loadConversations,
      pendingImages,
    ]
  );

  const handleVoiceFinal = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setVoiceHint(null);
      setVoiceStatus(null);
      setInput("");

      const cmd = resolveVoiceCommand(trimmed, pathname);
      if (cmd) {
        if (cmd.type === "page" && cmd.run) {
          showToast(cmd.status || "Opening…", "info");
          const result = cmd.run();
          if (result.ok && result.path && !result.path.startsWith("#")) {
            router.push(result.path);
          } else if (!result.ok) {
            setVoiceHint("Couldn't do that on this page — try another command.");
          }
          return;
        }
        if (
          (cmd.type === "navigate" || cmd.type === "search" || cmd.type === "listing") &&
          cmd.path
        ) {
          showToast(cmd.status || "Opening…", "info");
          router.push(cmd.path);
          return;
        }
      }

      respond(trimmed);
    },
    [pathname, respond, router]
  );

  const { supported: voiceSupported, listening, toggleListening, stopListening } = useVoiceInput({
    disabled: busy || imageBusy || globalVoiceActive,
    keepAlive: true,
    onInterimTranscript: (text) => {
      setVoiceHint(null);
      setVoiceStatus(null);
      setInput(text);
    },
    onFinalTranscript: handleVoiceFinal,
    onError: (message) => {
      setVoiceStatus(null);
      setVoiceHint(message);
    },
    onStatus: (message) => {
      setVoiceHint(null);
      setVoiceStatus(message || null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    stopListening();
    const q = input;
    setInput("");
    respond(q);
  }

  useEffect(() => {
    if (!open || busy) stopListening();
  }, [open, busy, stopListening]);

  const canSend = (input.trim() || pendingImages.length > 0) && !busy && !imageBusy;

  useEffect(() => {
    const onOpen = (e: Event) => {
      const query = (e as CustomEvent<SkyAiOpenDetail>).detail?.query?.trim();
      // Sheet OR inline workspace — always open/focus the existing panel.
      setOpen(true);
      requestAnimationFrame(() => {
        chatInputRef.current?.focus();
        chatInputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      if (query) respond(query);
    };
    window.addEventListener(SKY_AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SKY_AI_OPEN_EVENT, onOpen);
  }, [respond, setOpen]);

  useEffect(() => {
    const onFill = (e: Event) => {
      const fill = (e as CustomEvent<SkyAiListingFill>).detail;
      if (fill && pathname.startsWith("/post/ai")) {
        setListingPreviewFill(fill);
      }
    };
    window.addEventListener(SKY_AI_LISTING_FILL_EVENT, onFill);
    return () => window.removeEventListener(SKY_AI_LISTING_FILL_EVENT, onFill);
  }, [pathname]);

  useEffect(() => {
    if (!autoQuery?.trim() || !open) return;
    respond(autoQuery.trim());
    onAutoQueryConsumed?.();
  }, [autoQuery, open, respond, onAutoQueryConsumed]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => chatInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const composerVisible = isSheet ? open : !!open;
    dispatchSkyAiComposerActive(composerVisible);
    return () => {
      if (composerVisible) dispatchSkyAiComposerActive(false);
    };
  }, [isSheet, open]);

  const showThinking =
    busy && messages.length > 0 && messages[messages.length - 1]?.streaming && !messages[messages.length - 1]?.text;

  if (!isSheet && !open) return null;

  const headerActions = (
    <div className="flex items-center gap-1">
      {user && (
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="rounded-lg px-2 py-1.5 text-[10px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          title="Chat history"
        >
          History
        </button>
      )}
      <button
        type="button"
        onClick={startNewChat}
        className="rounded-lg px-2 py-1.5 text-[10px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
      >
        New
      </button>
      {!isWorkspace && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-always-white"
          aria-label={`Close ${AWHINA_NAME}`}
        >
          ✕
        </button>
      )}
    </div>
  );

  /** Workspace: quiet single identity — page owns the Āwhina label above. */
  const header = isWorkspace ? null : (
    <div
      className={`flex items-center justify-between border-b border-white/[0.08] bg-zinc-950/80 px-4 py-3 ${
        isSheet ? "" : "rounded-t-xl"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sm text-sky-300 ring-1 ring-sky-500/30">
          ✦
        </span>
        <div>
          <p className="text-sm font-bold text-always-white">{isSheet ? AWHINA_ASK_LABEL : AWHINA_NAME}</p>
          <p className="text-[10px] text-zinc-500">
            {openAiReady === false ? "Built-in guides · navigation" : "Listings · prices · safety"}
          </p>
        </div>
      </div>
      {headerActions}
    </div>
  );

  const body = (
    <div className={isSheet || isWorkspace ? "flex min-h-0 flex-1 flex-col" : undefined}>
      {showHistory && user && (
        <div className="max-h-36 overflow-y-auto border-b border-white/[0.06] awhina-chat-history-bg px-2 py-2 scrollbar-thin">
          {conversations.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-zinc-500">No saved chats yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                className={`mb-1 w-full rounded-lg px-2 py-2 text-left text-[11px] transition ${
                  conversationId === c.id
                    ? "bg-sky-500/15 text-sky-300"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-always-white"
                }`}
              >
                <span className="line-clamp-1 font-medium">{c.title}</span>
              </button>
            ))
          )}
        </div>
      )}

      {!user && !isWorkspace && (
        <p className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] text-zinc-400">
          <Link href="/login" className="font-semibold text-sky-400 underline hover:text-sky-300">
            Sign in
          </Link>{" "}
          to save conversations across devices.
        </p>
      )}

      <div
        ref={listRef}
        className={`overflow-y-auto scrollbar-thin ${
          isSheet
            ? "flex-1 px-3 py-3 space-y-3"
            : isWorkspace
              ? "min-h-0 flex-1 space-y-4 px-4 py-5"
              : className.includes("awhina-listing-workspace-chat")
                ? "min-h-[280px] max-h-[min(560px,62vh)] px-3 py-3 space-y-3"
                : "min-h-[200px] max-h-[min(360px,45vh)] px-3 py-3 space-y-3"
        }`}
      >
        {messages.map((m) => {
          if (m.streaming && !m.text && !m.progressLabel) return null;
          return (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-line ${
                  m.role === "user"
                    ? isWorkspace
                      ? "rounded-2xl bg-white/[0.08] text-white"
                      : "rounded-2xl bg-white/[0.1] text-white ring-1 ring-white/[0.08]"
                    : isWorkspace
                      ? "rounded-2xl text-zinc-50"
                      : "rounded-2xl border border-white/[0.06] bg-white/[0.03] text-zinc-50"
                }`}
              >
                {m.images && m.images.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {m.images.map((src, idx) => (
                      <img
                        key={idx}
                        src={src}
                        alt=""
                        className="h-16 w-16 rounded-lg object-cover ring-1 ring-white/10"
                      />
                    ))}
                  </div>
                )}
                {m.text && renderText(m.text)}
                {m.streaming && !m.text && m.progressLabel && (
                  <p className="text-[11px] text-sky-300/80">{m.progressLabel}</p>
                )}
                {m.streaming && m.text && (
                  <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-sky-400/80" />
                )}
                {m.navigating && !m.streaming && (
                  <p className="mt-1.5 text-[10px] font-medium text-sky-400/90 animate-pulse">
                    Opening…
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {showThinking && (
          <div className="flex justify-start">
            <div className={`px-3 py-2 text-[12px] ${isWorkspace ? "text-zinc-400" : "rounded-2xl border border-white/[0.06] bg-white/[0.03] text-zinc-400"}`}>
              {AWHINA_THINKING}
            </div>
          </div>
        )}

      </div>

      {!isWorkspace && listingPreviewFill && (
        <div className="mx-3 mb-3 overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950/60 awhina-chat-listing-preview animate-fade-in-panel">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/15 text-[10px] text-sky-300">✓</span>
              <span className="text-[11px] font-semibold text-white">Listing ready — form filled</span>
            </div>
            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-400">
              {listingPreviewFill.listingType === "rental" && listingPreviewFill.rentalSubType
                ? `rental · ${listingPreviewFill.rentalSubType}`
                : listingPreviewFill.listingType || "physical"}
            </span>
          </div>

          {/* Preview */}
          <div className="px-4 py-3 space-y-1.5">
            <p className="text-sm font-bold text-always-white leading-snug">{listingPreviewFill.title || "Untitled Listing"}</p>
            <div className="flex flex-wrap items-center gap-2">
              {listingPreviewFill.price && (
                <span className="text-base font-bold text-white">${listingPreviewFill.price}</span>
              )}
              {listingPreviewFill.rentalPriceWeekly && listingPreviewFill.rentalSubType === "property" && (
                <span className="text-base font-bold text-white">${listingPreviewFill.rentalPriceWeekly}/wk</span>
              )}
              {listingPreviewFill.rentalPriceWeekly && !listingPreviewFill.price && listingPreviewFill.rentalSubType !== "property" && (
                <span className="text-base font-bold text-white">${listingPreviewFill.rentalPriceWeekly}/wk</span>
              )}
              {listingPreviewFill.category && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] text-zinc-400">{listingPreviewFill.category}</span>
              )}
              {listingPreviewFill.location && (
                <span className="text-[10px] text-zinc-500">📍 {listingPreviewFill.location}</span>
              )}
            </div>
            {listingPreviewFill.vehicleMake && (
              <p className="text-[11px] text-zinc-400">
                {listingPreviewFill.vehicleYear} {listingPreviewFill.vehicleMake} {listingPreviewFill.vehicleModel}
                {listingPreviewFill.vehicleOdometer ? ` · ${Number(listingPreviewFill.vehicleOdometer).toLocaleString()}km` : ""}
                {listingPreviewFill.vehicleColour ? ` · ${listingPreviewFill.vehicleColour}` : ""}
              </p>
            )}
            <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">{listingPreviewFill.description}</p>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] px-4 py-3">
            <button
              type="button"
              onClick={() => fileInputRefInternal.current?.click()}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-2 py-2.5 text-center transition hover:border-sky-500/35 hover:bg-white/[0.06] active:scale-[0.97]"
            >
              <span className="text-base">📷</span>
              <span className="text-[10px] font-semibold text-zinc-200">Add Photos</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setListingPreviewFill(null);
                document.getElementById("listing-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-2 py-2.5 text-center transition hover:bg-white/[0.08] active:scale-[0.97]"
            >
              <span className="text-base">✏️</span>
              <span className="text-[10px] font-semibold text-zinc-200">Edit Listing</span>
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={async () => {
                setPublishing(true);
                try {
                  const token = await getFreshIdToken();
                  if (!token) {
                    updateAssistant("", { text: "" });
                    setPublishing(false);
                    document.getElementById("listing-submit-btn")?.click();
                    return;
                  }
                  const fill = listingPreviewFill;
                  if (!fill) { setPublishing(false); return; }
                  const csrfToken = await getClientCsrfToken();
                  const res = await fetch("/api/create-listing", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
                    },
                    body: JSON.stringify({
                      title: fill.title || "Untitled",
                      description: fill.description || "",
                      price: fill.price || "0",
                      category: fill.category || "Other",
                      listingType: fill.listingType || "physical",
                      type: fill.listingType || "physical",
                      location: fill.location || "",
                      condition: fill.condition || "Used - Good",
                      paymentType: fill.paymentType || "contact",
                      pickupAvailable: fill.pickupAvailable ?? true,
                      shippingAvailable: fill.shippingAvailable ?? false,
                      vehicleMake: fill.vehicleMake || "",
                      vehicleModel: fill.vehicleModel || "",
                      vehicleYear: fill.vehicleYear ? Number(fill.vehicleYear) : null,
                      vehicleOdometer: fill.vehicleOdometer ? Number(fill.vehicleOdometer) : null,
                      vehicleColour: fill.vehicleColour || "",
                      vehicleBodyType: fill.vehicleBodyType || "",
                      vehicleFuelType: fill.vehicleFuelType || "Petrol",
                      vehicleTransmission: fill.vehicleTransmission || "Automatic",
                      rentalPriceWeekly: fill.rentalPriceWeekly ? Number(fill.rentalPriceWeekly) : null,
                      rentalPriceMonthly: fill.rentalPriceMonthly ? Number(fill.rentalPriceMonthly) : null,
                      rentalDeposit: fill.rentalDeposit ? Number(fill.rentalDeposit) : null,
                      stockQuantity: fill.stockQuantity ? Number(fill.stockQuantity) : null,
                      serviceDuration: fill.serviceDuration || "",
                      servicePricingType: fill.servicePricingType || "",
                      pricingType: fill.pricingType || "fixed",
                      acceptOffers: fill.acceptOffers ?? false,
                      saleType: fill.saleType || "buy_now",
                      status: "live",
                      expiresAt: new Date(Date.now() + 14 * 86400000),
                    }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok && data.success && data.listingId) {
                    setListingPreviewFill(null);
                    setMessages(welcomeMessages(welcomeText));
                    setConversationId(null);
                    window.location.href = `/post/listing/${data.listingId}`;
                  } else {
                    const errMsg = data.error || `Failed to publish (${res.status})`;
                    setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", text: `❌ ${errMsg}\n\nTry scrolling down and clicking **Post Now** in the form instead.` }]);
                  }
                } catch (e) {
                  setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", text: "❌ Couldn't connect — check your internet and try again, or click **Post Now** in the form below." }]);
                }
                setPublishing(false);
              }}
              className="flex flex-col items-center gap-1 rounded-xl bg-sky-500 px-2 py-2.5 text-center transition hover:bg-sky-400 active:scale-[0.97] disabled:opacity-50"
            >
              <span className="text-base">{publishing ? "⏳" : "🚀"}</span>
              <span className="text-[10px] font-bold text-always-white">{publishing ? "Publishing…" : "Publish"}</span>
            </button>
          </div>

          {/* Photo reminder if no photos */}
          <div className="border-t border-white/[0.04] px-4 py-2">
            <p className="text-[10px] text-zinc-500">💡 Listings with photos sell 3× faster — add at least 3 before publishing.</p>
          </div>
        </div>
      )}

      <input ref={fileInputRefInternal} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length || !listingPreviewFill) return;
        const prepared = await prepareSkyAiImages(files.slice(0, 8));
        if ("error" in prepared) return;
        if (prepared.dataUrls.length) {
          dispatchListingImages(prepared.dataUrls, prepared.names);
        }
        e.target.value = "";
      }} />

      <div
        className={`border-t border-white/[0.06] relative z-10 shrink-0 px-3 py-2.5 ${
          isSheet
            ? "awhina-chat-surface max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] bg-[rgba(6,8,12,0.98)]"
            : isWorkspace
              ? "bg-transparent"
              : "awhina-chat-surface rounded-b-xl bg-[rgba(6,8,12,0.98)]"
        }`}
      >
        {!listingPreviewFill && !isWorkspace && quickPrompts.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quickPrompts.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={busy}
                onClick={() => respond(p.query)}
                className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-zinc-400 transition hover:border-sky-500/35 hover:text-zinc-200 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingImages.map((img, idx) => (
              <div key={idx} className="relative">
                <img
                  src={img.dataUrl}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover ring-1 ring-white/10"
                />
                <button
                  type="button"
                  onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] text-always-white ring-1 ring-white/20 hover:bg-red-500"
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImagePick}
        />
        <form onSubmit={handleSubmit} className="space-y-2">
          <div
            className={`flex items-end gap-2 rounded-2xl border px-2 py-2 transition focus-within:border-sky-500/45 focus-within:ring-1 focus-within:ring-sky-500/20 ${
              isWorkspace
                ? "border-white/[0.1] bg-white/[0.03]"
                : "overflow-hidden border-white/[0.1] bg-white/[0.03]"
            }`}
          >
            <button
              type="button"
              disabled={busy || imageBusy || pendingImages.length >= SKY_AI_MAX_IMAGES_PER_MESSAGE}
              onClick={() => imageInputRef.current?.click()}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40"
              title="Add photos"
              aria-label="Add photos"
            >
              +
            </button>
            <textarea
              ref={chatInputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) handleSubmit(e);
                }
              }}
              placeholder={
                isWorkspace
                  ? "Message Āwhina…"
                  : "Describe what you're selling, or attach a photo…"
              }
              disabled={busy}
              rows={isWorkspace ? 1 : 2}
              className={`block min-h-[36px] max-h-32 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[13px] leading-relaxed text-white outline-none placeholder:text-zinc-600 ${
                isWorkspace ? "" : "w-full px-3 pt-2.5 pb-1 text-[12px]"
              }`}
            />
            {voiceSupported && (
              <button
                type="button"
                disabled={busy || imageBusy}
                onClick={toggleListening}
                className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm transition disabled:opacity-40 ${
                  listening
                    ? "bg-red-500/15 text-red-300"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
                }`}
                title={listening ? "Stop listening" : "Voice input"}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                aria-pressed={listening}
              >
                {listening ? "●" : "♪"}
              </button>
            )}
            <button
              type="submit"
              disabled={!canSend}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-35"
              aria-label="Send"
            >
              ↑
            </button>
          </div>
        </form>
        {voiceStatus && (
          <p className="mt-1.5 text-[10px] leading-snug text-zinc-500" role="status">
            {voiceStatus}
          </p>
        )}
        {voiceHint && (
          <p className="mt-1.5 text-[10px] leading-snug text-amber-400/90" role="alert">
            {voiceHint}
          </p>
        )}
      </div>
    </div>
  );

  if (!isSheet) {
    return (
      <div
        className={`${
          isWorkspace
            ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/55 awhina-chat awhina-chat-shell"
            : "mt-4 flex flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-zinc-950/80 awhina-chat awhina-chat-shell animate-fade-in-panel"
        } ${className}`}
      >
        {header}
        {body}
      </div>
    );
  }

  return (
    <>
      <div
        className={`awhina-chat awhina-chat-shell fixed right-0 top-0 ${AWHINA_CHAT_SHEET_Z} flex h-full w-full max-w-[400px] flex-col border-l border-white/[0.1] bg-zinc-950/95 backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0 animate-fade-in-panel" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        {header}
        {body}
      </div>

      {open && (
        <button
          type="button"
          className={`fixed inset-0 ${AWHINA_CHAT_BACKDROP_Z} bg-black/50 md:bg-black/25 animate-fade-in-backdrop`}
          aria-label={`Close ${AWHINA_NAME} overlay`}
          onClick={() => setOpen(false)}
        />
      )}

      {floatingFab && (
      <div className={`fixed z-[10002] transition-all duration-300 ${open ? "opacity-0 pointer-events-none scale-75" : "opacity-100"} bottom-6 right-6 max-md:bottom-24 max-md:right-4`}>
        <div className="relative group">
          <span className="awhina-chat-fab-tooltip absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-zinc-900/95 border border-white/[0.06] text-[11px] font-semibold text-always-white whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            Ask {AWHINA_NAME}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-zinc-900/95 border-r border-b border-white/[0.06]" />
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="relative flex h-[56px] w-[56px] items-center justify-center rounded-full border border-white/[0.08] bg-[#0c0e14]/90 backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-sky-500/40 active:scale-95 light:border-gray-200/90 light:bg-white/95"
            aria-label={`Open ${AWHINA_ASK_LABEL}`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-sm text-white">
              ✦
            </span>
          </button>
        </div>
      </div>
      )}
    </>
  );
}
