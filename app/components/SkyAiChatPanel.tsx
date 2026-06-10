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
import {
  dispatchListingFill,
  stripSkyAiMachineTags,
  type SkyAiListingFill,
} from "../lib/sky-ai-listing-fill";
import { SKY_AI_OPEN_EVENT, type SkyAiOpenDetail } from "../lib/sky-ai-events";
import { SKY_AI_QUICK_PROMPTS, SKY_AI_WELCOME } from "../lib/sky-ai-prompts";
import { mergeListingFillWithDraft } from "../lib/sky-ai-draft-merge";
import { readListingDraftFromSkyAi } from "../lib/sky-ai-listing-context";
import {
  dispatchListingImages,
  prepareSkyAiImages,
  SKY_AI_MAX_IMAGES_PER_MESSAGE,
} from "../lib/sky-ai-images";
import { getFreshIdToken } from "../lib/api-auth";
import type { SkyAiConversationSummary } from "../lib/sky-ai-types";

export type SkyAiChatPanelMode = "sheet" | "inline";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: string[];
  navigating?: boolean;
  streaming?: boolean;
};

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
  quickPrompts?: QuickPrompt[];
  /** First assistant message (defaults to global welcome) */
  welcomeText?: string;
  className?: string;
};

function handleListingFill(fill: SkyAiListingFill | undefined, _navigateTo?: string) {
  if (!fill) return _navigateTo;
  const merged = mergeListingFillWithDraft(readListingDraftFromSkyAi(), fill);
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
        <strong key={i} className="font-semibold text-zinc-100">
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
  quickPrompts = SKY_AI_QUICK_PROMPTS,
  welcomeText = SKY_AI_WELCOME,
  className = "",
}: SkyAiChatPanelProps) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const isSheet = mode === "sheet";
  const [openInternal, setOpenInternal] = useState(false);
  const open = isSheet ? openInternal : (openControlled ?? false);
  const setOpen = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(isSheet ? openInternal : (openControlled ?? false)) : v;
      if (isSheet) setOpenInternal(next);
      else onOpenChange?.(next);
    },
    [isSheet, openInternal, openControlled, onOpenChange]
  );

  const [user, setUser] = useState<User | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => welcomeMessages(welcomeText));
  const [conversations, setConversations] = useState<SkyAiConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingAttachment[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [openAiReady, setOpenAiReady] = useState(true);
  const [listingPreviewFill, setListingPreviewFill] = useState<SkyAiListingFill | null>(null);
  const [publishing, setPublishing] = useState(false);
  const fileInputRefInternal = useRef<HTMLInputElement>(null);

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
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      navigateTimerRef.current = setTimeout(() => {
        router.push(path);
        const hash = path.includes("#") ? path.split("#")[1] : "";
        if (hash) {
          setTimeout(() => {
            document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 400);
        }
      }, 700);
    },
    [router]
  );

  const updateAssistant = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const startNewChat = useCallback(() => {
    setConversationId(null);
    setMessages(welcomeMessages(welcomeText));
    setShowHistory(false);
    setListingPreviewFill(null);
  }, [welcomeText]);

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
        (m: { id: string; role: string; content: string }) => ({
          id: m.id,
          role: m.role === "user" ? "user" : "assistant",
          text: m.content,
        })
      );
      setConversationId(id);
      setMessages(loaded.length ? loaded : welcomeMessages(welcomeText));
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

      if (listingPreviewFill) setListingPreviewFill(null);

      if (imageUrls.length && pathname.startsWith("/post/ai")) {
        dispatchListingImages(imageUrls, imageNames);
      }

      setPendingImages([]);
      setBusy(true);

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

      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome" && !m.streaming)
        .slice(-20)
        .map((m) => ({
          role: m.role,
          content: m.images?.length ? `${m.text} [sent ${m.images.length} photo(s)]` : m.text,
        }));

      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);

      let navigateTo: string | undefined;
      let newConversationId = conversationId;
      let finalMessage = trimmed ||
        "I uploaded product photo(s). Analyze them and fill my Quick Post listing with LISTING_FILL.";

      const isSellPage = pathname.startsWith("/post/ai");

      if (isSellPage) {
        const listingPatterns = /^(title:|price:|description:|location:|condition:|category:|features:|specifications:|available:|photos needed:|contact:|for sale|for rent|wanted|auction|rental listing|vehicle listing|service listing|digital listing|item listing)/i;
        const hasListingFields = /(?:^|\n)(title|price|description|location|condition|category|features|specifications|available|photos needed|contact)\s*:/i.test(finalMessage);
        const hasListingType = /(?:rental|vehicle|service|digital|item)\s+listing|for\s+(sale|rent)|wanted|auction/i.test(finalMessage);
        const hasMultipleFields = (finalMessage.match(/(?:^|\n)\s*\w+\s*:/g) || []).length >= 3;

        if (hasListingFields || hasListingType || hasMultipleFields) {
          finalMessage = `[LISTING CREATION REQUEST]\nParse the following as listing data and output LISTING_FILL. Do not respond with general chat — this is listing content to be filled into the form.\n\n${finalMessage}`;
        }
      }

      try {
        const token = await getFreshIdToken();
        const listingContext = readListingDraftFromSkyAi();
        const res = await fetch("/api/sky-ai", {
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
            listingContext,
            images: imageUrls.length ? imageUrls : undefined,
            stream: true,
          }),
        });

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
                  listingFill?: SkyAiListingFill;
                  conversationId?: string;
                  source?: string;
                  error?: string;
                };
                if (evt.type === "delta" && evt.text) {
                  accumulated += evt.text;
                  updateAssistant(assistantId, {
                    text: stripSkyAiMachineTags(accumulated),
                  });
                }
                if (evt.type === "done") {
                  navigateTo = evt.navigateTo;
                  responseHandled = true;
                  if (isSellPage && navigateTo === "/post/ai") navigateTo = undefined;
                  if (evt.listingFill && isSellPage) {
                    console.log(`[Awhina] Preview card shown: type=${evt.listingFill.listingType}, title=${evt.listingFill.title}`);
                    setListingPreviewFill(evt.listingFill);
                    navigateTo = undefined;
                    const previewText = `Your listing preview is ready above. Review the details, add photos if needed, then click Publish Listing.`;
                    updateAssistant(assistantId, {
                      text: previewText,
                      streaming: false,
                      navigating: false,
                    });
                  } else {
                    if (isSellPage && navigateTo === "/post/ai") navigateTo = undefined;
                    const navFromFill = handleListingFill(evt.listingFill, navigateTo);
                    if (navFromFill) navigateTo = navFromFill;
                    updateAssistant(assistantId, {
                      text: evt.reply || stripSkyAiMachineTags(accumulated),
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
          if (data.listingFill && isSellPage) {
            console.log(`[Awhina] Preview card shown (non-streaming): type=${data.listingFill.listingType}, title=${data.listingFill.title}`);
            setListingPreviewFill(data.listingFill);
            navigateTo = undefined;
            updateAssistant(assistantId, {
              text: `Your listing preview is ready above. Review the details, add photos if needed, then click Publish Listing.`,
              streaming: false,
              navigating: false,
            });
          } else {
            if (isSellPage && navigateTo === "/post/ai") navigateTo = undefined;
            const navFromFill = handleListingFill(data.listingFill, navigateTo);
            if (navFromFill) navigateTo = navFromFill;
            updateAssistant(assistantId, {
              text: data.reply || "",
              streaming: false,
              navigating: !!navigateTo,
            });
          }
          if (data.conversationId) newConversationId = data.conversationId;
        }
      } catch (err) {
        const rule = skyAiRuleFallbackText(trimmed, pathname);
        navigateTo = isSellPage && rule.navigateTo === "/post/ai" ? undefined : rule.navigateTo;
        let text = rule.text;
        if (err instanceof Error && err.message && err.message !== AWHINA_REQUEST_FAILED) {
          text += `\n\n_${err.message}_`;
        }
        updateAssistant(assistantId, {
          text,
          streaming: false,
          navigating: !!navigateTo,
        });
      }

      if (newConversationId) setConversationId(newConversationId);
      if (user) loadConversations();
      if (navigateTo) runNavigate(navigateTo);
      setBusy(false);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input;
    setInput("");
    respond(q);
  }

  const canSend = (input.trim() || pendingImages.length > 0) && !busy && !imageBusy;

  useEffect(() => {
    if (!isSheet) return;
    const onOpen = (e: Event) => {
      const query = (e as CustomEvent<SkyAiOpenDetail>).detail?.query?.trim();
      setOpen(true);
      if (query) respond(query);
    };
    window.addEventListener(SKY_AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SKY_AI_OPEN_EVENT, onOpen);
  }, [isSheet, respond, setOpen]);

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

  const showThinking =
    busy && messages.length > 0 && messages[messages.length - 1]?.streaming && !messages[messages.length - 1]?.text;

  if (!isSheet && !open) return null;

  const header = (
    <div
      className={`flex items-center justify-between border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.06] to-sky-500/[0.06] px-4 py-3 ${
        isSheet ? "" : "rounded-t-xl"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-sky-500/25 text-sm shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/30">
          ✦
        </span>
        <div>
          <p className="text-sm font-bold text-white">{isSheet ? AWHINA_ASK_LABEL : AWHINA_NAME}</p>
          <p className="text-[10px] text-sky-400/80">
            {openAiReady === false ? "Built-in guides · navigation" : "Listings · prices · safety"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {user && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-sky-400 hover:bg-sky-500/10"
            title="Chat history"
          >
            History
          </button>
        )}
        <button
          type="button"
          onClick={startNewChat}
          className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-sky-400 hover:bg-sky-500/10"
        >
          New
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          aria-label={`Close ${AWHINA_NAME}`}
        >
          ✕
        </button>
      </div>
    </div>
  );

  const body = (
    <>
      {showHistory && user && (
        <div className="max-h-36 overflow-y-auto border-b border-white/[0.06] bg-black/20 px-2 py-2 scrollbar-thin">
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
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <span className="line-clamp-1 font-medium">{c.title}</span>
              </button>
            ))
          )}
        </div>
      )}

      {!user && (
        <p className="border-b border-sky-500/20 bg-sky-500/[0.06] px-3 py-2 text-[10px] text-sky-400/90">
          <Link href="/login" className="font-bold underline hover:text-sky-300">
            Sign in
          </Link>{" "}
          to save conversations across devices.
        </p>
      )}

      <div
        ref={listRef}
        className={`overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin ${
          isSheet ? "flex-1" : "min-h-[200px] max-h-[min(360px,45vh)]"
        }`}
      >
        {messages.map((m) => {
          if (m.streaming && !m.text) return null;
          return (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-[12px] leading-relaxed whitespace-pre-line ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-sky-500/25 to-sky-600/15 text-sky-50 ring-1 ring-sky-500/20"
                    : "border border-sky-500/15 bg-sky-500/[0.04] text-zinc-300 shadow-[0_0_24px_rgba(139,92,246,0.06)]"
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
                {m.streaming && m.text && (
                  <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-sky-400/80" />
                )}
                {m.navigating && (
                  <p className="mt-1.5 text-[10px] font-medium text-sky-400/90 animate-pulse">
                    Navigating…
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {showThinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2 text-[11px] text-sky-300/70">
              {AWHINA_THINKING}
            </div>
          </div>
        )}

        {listingPreviewFill && (
          <div className="rounded-2xl border border-sky-400/30 bg-gradient-to-b from-sky-500/[0.06] to-transparent p-4 space-y-3 animate-fade-in-panel">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs">✅</span>
              <span className="text-xs font-bold text-sky-300">Your listing is ready</span>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-bold text-white">{listingPreviewFill.title || "Untitled"}</p>
              {listingPreviewFill.price && (
                <p className="text-base font-black text-sky-400">${listingPreviewFill.price}</p>
              )}
            </div>

            {listingPreviewFill.description && (
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <p className="text-[11px] leading-relaxed text-zinc-300 whitespace-pre-line">{listingPreviewFill.description}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
              {listingPreviewFill.location && <span>📍 {listingPreviewFill.location}</span>}
              {listingPreviewFill.category && <span>📂 {listingPreviewFill.category}</span>}
              {listingPreviewFill.listingType && (
                <span className="capitalize">🏷️ {listingPreviewFill.listingType}</span>
              )}
            </div>

            <p className="text-[10px] text-zinc-500">📷 Photos: Not added yet. Listings with photos usually receive more views, but you can add them later.</p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={publishing}
                onClick={async () => {
                  setPublishing(true);
                  try {
                    const token = await getFreshIdToken();
                    if (!token) { setPublishing(false); return; }
                    const fill = listingPreviewFill;
                    if (!fill) { setPublishing(false); return; }
                    const res = await fetch("/api/create-listing", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({
                        title: fill.title || "Untitled",
                        description: fill.description || "",
                        price: fill.price || "0",
                        category: fill.category || "Other",
                        listingType: fill.listingType || "physical",
                        location: fill.location || "",
                        condition: fill.condition || "",
                        paymentType: fill.paymentType || "stripe",
                        vehicleMake: fill.vehicleMake || "",
                        vehicleModel: fill.vehicleModel || "",
                        vehicleYear: fill.vehicleYear || "",
                        vehicleOdometer: fill.vehicleOdometer || "",
                        vehicleColour: fill.vehicleColour || "",
                        vehicleBodyType: fill.vehicleBodyType || "",
                        vehicleFuelType: fill.vehicleFuelType || "",
                        vehicleTransmission: fill.vehicleTransmission || "",
                        rentalPriceWeekly: fill.rentalPriceWeekly || "",
                        rentalPriceMonthly: fill.rentalPriceMonthly || "",
                        rentalDeposit: fill.rentalDeposit || "",
                        serviceDuration: fill.serviceDuration || "",
                      }),
                    });
                    const data = await res.json();
                    if (data.success && data.listingId) {
                      setListingPreviewFill(null);
                      setMessages([]);
                      setConversationId("");
                      window.location.href = `/post/listing/${data.listingId}`;
                    } else if (data.error) {
                      alert(data.error);
                    }
                  } catch (e) {
                    alert("Failed to publish. Check your connection and try again.");
                    console.error("[Awhina] Publish error:", e);
                  }
                  setPublishing(false);
                }}
                className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-2 text-[11px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
              >
                {publishing ? "Publishing..." : "Publish Listing"}
              </button>
              <button
                type="button"
                onClick={() => setListingPreviewFill(null)}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-zinc-300 transition hover:bg-white/[0.06] hover:text-white active:scale-[0.97]"
              >
                Edit Listing
              </button>
              <button
                type="button"
                onClick={() => fileInputRefInternal.current?.click()}
                className="flex-1 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/20 active:scale-[0.97]"
              >
                Add Photos
              </button>
            </div>

            <p className="text-[10px] text-zinc-500 text-center">Have a quick read through your listing. If you'd like anything changed, just tell me and I'll update it before you publish.</p>
          </div>
        )}

        <input
          ref={fileInputRefInternal}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length || !listingPreviewFill) return;
            const prepared = await prepareSkyAiImages(files.slice(0, 8));
            if ("error" in prepared) return;
            if (prepared.dataUrls.length) {
              dispatchListingImages(prepared.dataUrls, prepared.names);
            }
            e.target.value = "";
          }}
        />
      </div>

      <div
        className={`border-t border-sky-500/15 bg-[#06080c]/90 px-3 py-2 ${
          isSheet ? "max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]" : "rounded-b-xl"
        }`}
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickPrompts.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={busy}
              onClick={() => respond(p.query)}
              className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.12)] hover:bg-sky-500/20 disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingImages.map((img, idx) => (
              <div key={idx} className="relative">
                <img
                  src={img.dataUrl}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover ring-1 ring-sky-500/30"
                />
                <button
                  type="button"
                  onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] text-white ring-1 ring-white/20 hover:bg-red-500"
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
        <form onSubmit={handleSubmit} className="flex gap-2">
          <button
            type="button"
            disabled={busy || imageBusy || pendingImages.length >= SKY_AI_MAX_IMAGES_PER_MESSAGE}
            onClick={() => imageInputRef.current?.click()}
            className="shrink-0 self-end flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/10 text-lg text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
            title="Add photos"
            aria-label="Add photos"
          >
            📷
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) handleSubmit(e);
              }
            }}
            placeholder="Describe what you're selling, or attach a photo…"
            disabled={busy}
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-xl border border-sky-500/20 bg-white/[0.03] px-3 py-2 text-[12px] text-white outline-none placeholder:text-zinc-600 focus:border-sky-400/50 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)]"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="shrink-0 self-end rounded-xl bg-gradient-to-r from-sky-500 to-sky-500 px-3 py-2.5 text-[11px] font-bold text-white shadow-[0_0_20px_rgba(14,165,233,0.25)] hover:brightness-110 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );

  if (!isSheet) {
    return (
      <div
        className={`mt-4 flex flex-col overflow-hidden rounded-xl border border-sky-500/25 bg-[#080a10]/95 shadow-[0_0_30px_rgba(14,165,233,0.08)] animate-fade-in-panel ${className}`}
      >
        {header}
        {body}
      </div>
    );
  }

  return (
    <>
      <div
        className={`fixed right-0 top-0 z-[10001] flex h-full w-full max-w-[400px] flex-col border-l border-sky-500/20 bg-[#080a10]/98 shadow-[0_0_60px_rgba(14,165,233,0.08)] backdrop-blur-xl transition-transform duration-300 ease-out ${
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
          className="fixed inset-0 z-[10000] bg-black/50 md:bg-black/25 animate-fade-in-backdrop"
          aria-label={`Close ${AWHINA_NAME} overlay`}
          onClick={() => setOpen(false)}
        />
      )}

      <div className={`fixed z-[10002] transition-all duration-300 ${open ? "opacity-0 pointer-events-none scale-75" : "opacity-100"} bottom-6 right-6 max-md:bottom-24 max-md:right-4`}>
        <div className="relative group">
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-zinc-900/95 border border-white/[0.06] text-[11px] font-semibold text-white whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            Ask {AWHINA_NAME}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-zinc-900/95 border-r border-b border-white/[0.06]" />
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="relative flex h-[56px] w-[56px] items-center justify-center rounded-full border border-white/[0.06] bg-[#0c0e14]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(14,165,233,0.12)] transition-all duration-300 hover:scale-110 hover:shadow-[0_0_35px_rgba(14,165,233,0.3)] hover:border-sky-400/40 active:scale-95"
            aria-label={`Open ${AWHINA_ASK_LABEL}`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-500 text-sm shadow-[0_0_12px_rgba(14,165,233,0.2)]">
              ✦
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
