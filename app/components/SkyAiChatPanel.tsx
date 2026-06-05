"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
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
import {
  normalizeSkyAiChatText,
  SKY_AI_QUICK_PROMPTS,
  SKY_AI_WELCOME,
} from "../lib/sky-ai-prompts";
import {
  readListingDraftFromSkyAi,
  readSkyAiSessionDraft,
  readSkyAiSessionState,
  saveSkyAiSessionDraft,
  saveSkyAiSessionState,
} from "../lib/sky-ai-listing-context";
import type { SkyAiListingDraft } from "../lib/sky-ai-types";
import {
  dispatchListingImages,
  prepareSkyAiImages,
  SKY_AI_MAX_IMAGES_PER_MESSAGE,
} from "../lib/sky-ai-images";
import { getFreshIdToken } from "../lib/api-auth";
import { SkyAiTypingCursor, SkyAiTypingText } from "./SkyAiTypingText";
import SkyAiSearchResultCards from "./SkyAiSearchResultCards";
import SkyAiPricingCard from "./SkyAiPricingCard";
import type { SkyAiSearchResultCard } from "../lib/sky-ai-listing-search";
import type { SkyAiPricingInsight } from "../lib/sky-ai-comps";

export type SkyAiChatPanelMode = "sheet" | "inline";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: string[];
  searchResults?: SkyAiSearchResultCard[];
  pricingInsight?: SkyAiPricingInsight;
  navigatePath?: string;
  streaming?: boolean;
};

function persistSessionMeta(data: {
  listingDraft?: SkyAiListingDraft;
  conversationState?: { currentFlow?: string | null; currentStep?: string | null };
  subjectChanged?: boolean;
}) {
  if (data.listingDraft) saveSkyAiSessionDraft(data.listingDraft);
  if (data.conversationState) {
    saveSkyAiSessionState({
      flow: (data.conversationState.currentFlow ?? null) as SkyAiListingDraft["flow"],
      step: (data.conversationState.currentStep ?? null) as SkyAiListingDraft["step"],
    });
  }
}

function shouldAutoNavigate(
  source: string | undefined,
  listingFill: SkyAiListingFill | undefined,
  navigateTo: string | undefined
): boolean {
  if (!navigateTo) return false;
  if (source === "platform_guide" || source === "marketplace_knowledge") return false;
  if (source === "conversation_flow") {
    return !!(listingFill?.startingBid || listingFill?.title || listingFill?.description);
  }
  if (source === "seller_coach" || source === "rules") return true;
  if (listingFill?.startingBid && !listingFill.title && !listingFill.description) return false;
  if (
    listingFill?.title ||
    listingFill?.description ||
    listingFill?.price ||
    listingFill?.vehicleMake
  ) {
    return true;
  }
  return false;
}

function navLinkLabel(path: string): string {
  const base = path.split("#")[0];
  const labels: Record<string, string> = {
    "/services": "Browse services",
    "/post/ai": "Open Quick Post",
    "/messages": "Open Messages",
    "/watchlist": "Open Watchlist",
    "/profile": "Open Profile",
    "/buyer-protection": "Payment details",
    "/seller-guidelines": "Seller guidelines",
    "/": "Browse listings",
  };
  return labels[base] || "Open page";
}

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
  /** Typewriter effect on the welcome bubble (Quick Post) */
  typingWelcome?: boolean;
  className?: string;
};

function handleListingFill(fill: SkyAiListingFill | undefined, navigateTo?: string) {
  const hasContent =
    !!fill?.title ||
    !!fill?.description ||
    !!fill?.price ||
    !!fill?.startingBid ||
    !!fill?.rentalPriceWeekly ||
    !!fill?.rentalPriceMonthly ||
    !!fill?.vehicleMake ||
    !!fill?.vehicleModel;
  if (!hasContent) return navigateTo;
  dispatchListingFill(fill);
  if (navigateTo) return navigateTo;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/post/ai")) {
    return undefined;
  }
  return "/post/ai";
}

/** Older replies included a ChatGPT-off preamble — hide it in the UI. */
function stripLegacyChatGptWarning(text: string): string {
  return text
    .replace(/\*\*ChatGPT mode is off\*\*[\s\S]*?---\n\n/g, "")
    .replace(/\*\*(Sky AI|Āwhina|Awhina) limited:\*\*[^\n]*\n\n/gi, "")
    .trim();
}

const LISTING_PATH_SPLIT = /(\/post\/listing\/[a-zA-Z0-9_-]+)/;
const LISTING_PATH_ONLY = /^\/post\/listing\/[a-zA-Z0-9_-]+$/;

function renderPlainWithLinks(segment: string, keyBase: string) {
  const bits = segment.split(LISTING_PATH_SPLIT);
  return bits.map((bit, j) => {
    if (LISTING_PATH_ONLY.test(bit)) {
      return (
        <Link
          key={`${keyBase}-l-${j}`}
          href={bit}
          className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
        >
          {bit}
        </Link>
      );
    }
    return bit ? <span key={`${keyBase}-s-${j}`}>{bit}</span> : null;
  });
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
    return <span key={i}>{renderPlainWithLinks(part, `p${i}`)}</span>;
  });
}

/** Compact chat layout — normal paragraph spacing, not landing-page gaps */
function renderChatMessage(text: string) {
  const normalized = normalizeSkyAiChatText(text);
  const paragraphs = normalized.split(/\n\n+/).filter((p) => p.trim());

  if (paragraphs.length <= 1) {
    const lines = normalized.split("\n");
    return (
      <>
        {lines.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {renderText(line)}
          </span>
        ))}
      </>
    );
  }

  return (
    <div className="space-y-1.5">
      {paragraphs.map((para, i) => {
        const lines = para.split("\n");
        return (
          <p key={i} className="m-0">
            {lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {renderText(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function welcomeMessages(text: string): ChatMessage[] {
  return [{ id: "welcome", role: "assistant", text: normalizeSkyAiChatText(text) }];
}

export default function SkyAiChatPanel({
  mode,
  open: openControlled,
  onOpenChange,
  autoQuery,
  onAutoQueryConsumed,
  quickPrompts = SKY_AI_QUICK_PROMPTS,
  welcomeText = SKY_AI_WELCOME,
  typingWelcome = false,
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => welcomeMessages(welcomeText));
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingAttachment[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [welcomeTypeRun, setWelcomeTypeRun] = useState(0);
  const [sellerVerified, setSellerVerified] = useState<boolean | null>(null);
  const [openAiReady] = useState(true);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user?.uid) {
      setSellerVerified(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "profiles", user.uid))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.data();
        setSellerVerified(!!(data?.verified || data?.phoneVerified));
      })
      .catch(() => {
        if (!cancelled) setSellerVerified(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    return () => {
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
    };
  }, []);

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

  useEffect(() => {
    if (open && typingWelcome && messages.length === 1 && messages[0]?.id === "welcome") {
      setWelcomeTypeRun((k) => k + 1);
    }
  }, [open, typingWelcome, messages.length, messages[0]?.id]);

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
      let responseSource: string | undefined;
      let responseListingFill: SkyAiListingFill | undefined;
      let newConversationId = conversationId;

      try {
        const token = await getFreshIdToken();
        const listingContext = readListingDraftFromSkyAi();
        const listingDraft = readSkyAiSessionDraft();
        const conversationState = readSkyAiSessionState();
        const res = await fetch("/api/sky-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message:
              trimmed ||
              "I uploaded product photo(s). Analyze them and fill my Quick Post listing with LISTING_FILL.",
            pathname,
            history,
            conversationId: user ? conversationId || undefined : undefined,
            listingContext,
            listingDraft: listingDraft || undefined,
            conversationState: conversationState
              ? {
                  currentFlow: conversationState.flow,
                  currentStep: conversationState.step,
                }
              : undefined,
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
            searchResults?: SkyAiSearchResultCard[];
            pricingInsight?: SkyAiPricingInsight;
            error?: string;
          };
          if (typeof data.reply === "string" && data.reply.trim()) {
            navigateTo = data.navigateTo;
            responseSource = (data as { source?: string }).source;
            responseListingFill = data.listingFill;
            const navFromFill = handleListingFill(data.listingFill, navigateTo);
            if (navFromFill) navigateTo = navFromFill;
            const autoNav = shouldAutoNavigate(responseSource, data.listingFill, navigateTo);
            persistSessionMeta(data as { listingDraft?: SkyAiListingDraft; conversationState?: { currentFlow?: string | null; currentStep?: string | null } });
            updateAssistant(assistantId, {
              text: data.reply,
              searchResults: data.searchResults,
              pricingInsight: data.pricingInsight,
              streaming: false,
              navigatePath: navigateTo && !autoNav ? navigateTo : undefined,
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
                  listingDraft?: SkyAiListingDraft;
                  conversationState?: { currentFlow?: string | null; currentStep?: string | null };
                  searchResults?: SkyAiSearchResultCard[];
                  pricingInsight?: SkyAiPricingInsight;
                  conversationId?: string;
                  source?: string;
                  error?: string;
                };
                if (evt.type === "started") {
                  updateAssistant(assistantId, { text: "…" });
                }
                if (evt.type === "delta" && evt.text) {
                  accumulated += evt.text;
                  updateAssistant(assistantId, {
                    text: stripSkyAiMachineTags(accumulated),
                  });
                }
                if (evt.type === "done") {
                  navigateTo = evt.navigateTo;
                  responseSource = evt.source;
                  responseListingFill = evt.listingFill;
                  const navFromFill = handleListingFill(evt.listingFill, navigateTo);
                  if (navFromFill) navigateTo = navFromFill;
                  if (evt.conversationId) newConversationId = evt.conversationId;
                  const autoNav = shouldAutoNavigate(evt.source, evt.listingFill, navigateTo);
                  persistSessionMeta(evt);
                  updateAssistant(assistantId, {
                    text: evt.reply || stripSkyAiMachineTags(accumulated),
                    searchResults: evt.searchResults,
                    pricingInsight: evt.pricingInsight,
                    streaming: false,
                    navigatePath: navigateTo && !autoNav ? navigateTo : undefined,
                  });
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
          responseSource = data.source;
          responseListingFill = data.listingFill;
          const navFromFill = handleListingFill(data.listingFill, navigateTo);
          if (navFromFill) navigateTo = navFromFill;
          if (data.conversationId) newConversationId = data.conversationId;
          const autoNav = shouldAutoNavigate(data.source, data.listingFill, navigateTo);
          persistSessionMeta(data);
          updateAssistant(assistantId, {
            text: data.reply || "",
            searchResults: data.searchResults,
            pricingInsight: data.pricingInsight,
            streaming: false,
            navigatePath: navigateTo && !autoNav ? navigateTo : undefined,
          });
        }
      } catch (err) {
        const rule = skyAiRuleFallbackText(trimmed, pathname);
        navigateTo = rule.navigateTo;
        responseSource = "rules";
        let text = rule.text;
        if (err instanceof Error && err.message && err.message !== AWHINA_REQUEST_FAILED) {
          text += `\n\n_${err.message}_`;
        }
        const autoNav = shouldAutoNavigate("rules", undefined, navigateTo);
        updateAssistant(assistantId, {
          text,
          streaming: false,
          navigatePath: navigateTo && !autoNav ? navigateTo : undefined,
        });
      }

      if (newConversationId) setConversationId(newConversationId);
      if (shouldAutoNavigate(responseSource, responseListingFill, navigateTo)) {
        runNavigate(navigateTo!);
      }
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

  const showThinking =
    busy && messages.length > 0 && messages[messages.length - 1]?.streaming && !messages[messages.length - 1]?.text;

  if (!isSheet && !open) return null;

  const header = (
    <div
      className={`flex items-center justify-between border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.06] to-violet-500/[0.06] px-4 py-3 ${
        isSheet ? "" : "rounded-t-xl"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-violet-500/25 text-sm shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/30">
          ✦
        </span>
        <div>
          <p className="text-sm font-bold text-white">{isSheet ? AWHINA_ASK_LABEL : AWHINA_NAME}</p>
          <p className="text-[10px] text-sky-400/80">
            {openAiReady === false ? "Built-in guides · navigation" : "Listings · prices · safety"}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white"
        aria-label={`Close ${AWHINA_NAME}`}
      >
        ✕
      </button>
    </div>
  );

  const body = (
    <>
      {!user && (
        <p className="border-b border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[10px] text-amber-400/90">
          <Link href="/login" className="font-bold underline hover:text-amber-300">
            Sign in
          </Link>{" "}
          to save conversations across devices.
        </p>
      )}

      {user && !user.emailVerified && (
        <p className="border-b border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[10px] leading-relaxed text-amber-400/90">
          You&apos;re <strong className="text-amber-300">not email verified</strong> yet — verify in{" "}
          <Link href="/profile" className="font-bold underline hover:text-amber-300">
            Profile
          </Link>{" "}
          before you can publish listings or buy. Check spam for the verification email.
        </p>
      )}

      {user && user.emailVerified && sellerVerified === false && (
        <p className="border-b border-zinc-700/50 bg-zinc-900/40 px-3 py-2 text-[10px] leading-relaxed text-zinc-400">
          Your seller profile is <strong className="text-zinc-300">not verified</strong> — buyers may see a warning.
          Complete phone or ID verification in{" "}
          <Link href="/profile" className="font-bold text-sky-400 underline hover:text-sky-300">
            Profile
          </Link>{" "}
          for more trust (optional to list).
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
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-[12px] leading-snug ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-sky-500/25 to-sky-600/15 text-sky-50 ring-1 ring-sky-500/20 whitespace-pre-line"
                    : "border border-violet-500/15 bg-violet-500/[0.04] text-zinc-300 shadow-[0_0_24px_rgba(139,92,246,0.06)]"
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
                {m.text &&
                  (m.role === "user" ? (
                    renderText(m.text)
                  ) : m.id === "welcome" && typingWelcome ? (
                    <SkyAiTypingText
                      key={welcomeTypeRun}
                      text={m.text}
                      run={open}
                    >
                      {(displayed, isDone) => (
                        <>
                          {isDone ? renderChatMessage(m.text) : (
                            <span className="whitespace-pre-wrap">{displayed}</span>
                          )}
                          {!isDone && <SkyAiTypingCursor />}
                        </>
                      )}
                    </SkyAiTypingText>
                  ) : (
                    renderChatMessage(m.text)
                  ))}
                {m.pricingInsight && m.pricingInsight.compsUsed > 0 && (
                  <SkyAiPricingCard insight={m.pricingInsight} />
                )}
                {m.searchResults && m.searchResults.length > 0 && (
                  <SkyAiSearchResultCards results={m.searchResults} />
                )}
                {m.streaming && m.text && (
                  <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-violet-400/80" />
                )}
                {m.navigatePath && (
                  <Link
                    href={m.navigatePath}
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/20"
                  >
                    {navLinkLabel(m.navigatePath)} →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
        {showThinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] px-3 py-2 text-[11px] text-violet-300/70">
              {AWHINA_THINKING}
            </div>
          </div>
        )}
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
            className="shrink-0 self-end rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-2.5 text-[11px] font-bold text-white shadow-[0_0_20px_rgba(14,165,233,0.25)] hover:brightness-110 disabled:opacity-40"
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

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-6 z-[10002] flex items-center gap-2 rounded-full border border-sky-400/40 bg-gradient-to-r from-[#0c0e14] to-[#12151f] px-4 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_rgba(14,165,233,0.35)] ring-1 ring-sky-500/30 backdrop-blur-md transition-all hover:shadow-[0_0_40px_rgba(139,92,246,0.35)] active:scale-[0.98] max-md:bottom-20 ${
          open ? "right-[400px] max-md:right-4" : "right-4"
        }`}
        aria-expanded={open}
        aria-label={open ? `Close ${AWHINA_ASK_LABEL}` : `Open ${AWHINA_ASK_LABEL}`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-500 text-xs shadow-lg">
          ✦
        </span>
        <span className="max-sm:hidden">{open ? "Close" : AWHINA_ASK_LABEL}</span>
      </button>
    </>
  );
}
