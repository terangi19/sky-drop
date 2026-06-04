"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { getGuideReply } from "../lib/guide-assistant";
import {
  openAiIssueHint,
  skyAiRuleFallbackText,
  type OpenAiHealthIssue,
} from "../lib/openai-health";
import {
  dispatchListingFill,
  stripSkyAiMachineTags,
  type SkyAiListingFill,
} from "../lib/sky-ai-listing-fill";
import { SKY_AI_QUICK_PROMPTS, SKY_AI_WELCOME } from "../lib/sky-ai-prompts";
import { readListingDraftFromSkyAi } from "../lib/sky-ai-listing-context";
import { getFreshIdToken } from "../lib/api-auth";
import type { SkyAiConversationSummary } from "../lib/sky-ai-types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  navigating?: boolean;
  streaming?: boolean;
};

function handleListingFill(fill: SkyAiListingFill | undefined, navigateTo?: string) {
  if (!fill?.title && !fill?.description && !fill?.price) return navigateTo;
  dispatchListingFill(fill);
  if (navigateTo) return navigateTo;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/post/ai")) {
    return undefined;
  }
  return "/post/ai";
}

function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
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

function welcomeMessages(): ChatMessage[] {
  return [{ id: "welcome", role: "assistant", text: SKY_AI_WELCOME }];
}

export default function SkyAiChat() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(welcomeMessages);
  const [conversations, setConversations] = useState<SkyAiConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [openAiReady, setOpenAiReady] = useState<boolean | null>(null);
  const [openAiIssue, setOpenAiIssue] = useState<OpenAiHealthIssue | undefined>();
  const listRef = useRef<HTMLDivElement>(null);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sky-ai/status");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setOpenAiReady(data.openaiReady === true);
        setOpenAiIssue(
          typeof data.openaiIssue === "string" ? (data.openaiIssue as OpenAiHealthIssue) : undefined
        );
      } catch {
        if (!cancelled) setOpenAiReady(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
    setMessages(welcomeMessages());
    setShowHistory(false);
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
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
        setMessages(loaded.length ? loaded : welcomeMessages());
        setShowHistory(false);
      } catch {
        /* ignore */
      }
      setBusy(false);
    },
    []
  );

  const respond = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || busy) return;

      setBusy(true);
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: trimmed,
      };
      setMessages((prev) => [...prev.filter((m) => m.id !== "welcome"), userMsg]);

      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome" && !m.streaming)
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.text }));

      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);

      let navigateTo: string | undefined;
      let newConversationId = conversationId;

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
            message: trimmed,
            pathname,
            history: user ? undefined : history,
            conversationId: user ? conversationId || undefined : undefined,
            listingContext,
            stream: true,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const err = new Error(
            typeof data.error === "string" ? data.error : "Ask Sky Anything request failed"
          ) as Error & { code?: string };
          err.code = typeof data.code === "string" ? data.code : undefined;
          throw err;
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream") && res.body) {
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
                  const navFromFill = handleListingFill(evt.listingFill, navigateTo);
                  if (navFromFill) navigateTo = navFromFill;
                  if (evt.conversationId) newConversationId = evt.conversationId;
                  updateAssistant(assistantId, {
                    text: evt.reply || stripSkyAiMachineTags(accumulated),
                    streaming: false,
                    navigating: !!navigateTo,
                  });
                }
                if (evt.type === "error") throw new Error(evt.error || "Stream failed");
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) continue;
                throw parseErr;
              }
            }
          }
        } else {
          const data = await res.json();
          navigateTo = data.navigateTo;
          const navFromFill = handleListingFill(data.listingFill, navigateTo);
          if (navFromFill) navigateTo = navFromFill;
          if (data.conversationId) newConversationId = data.conversationId;
          updateAssistant(assistantId, {
            text: data.reply || "",
            streaming: false,
            navigating: !!navigateTo,
          });
        }
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code)
            : "";
        const rule = skyAiRuleFallbackText(trimmed, pathname);
        navigateTo = rule.navigateTo;
        const issueFromCode: OpenAiHealthIssue | undefined =
          code === "missing_openai_key"
            ? "not_configured"
            : code === "openai_auth_failed"
              ? "auth_failed"
              : code === "openai_quota_exceeded"
                ? "quota_exceeded"
                : code === "openai_rate_limit"
                  ? "rate_limit"
                  : undefined;
        if (issueFromCode) {
          setOpenAiReady(false);
          setOpenAiIssue(issueFromCode);
        }
        const apiDown = issueFromCode === "quota_exceeded" || issueFromCode === "not_configured" || issueFromCode === "auth_failed";
        let text: string;
        if (apiDown) {
          text =
            `**ChatGPT mode is off** — ${openAiIssueHint(issueFromCode)}\n\n` +
            `Until billing is fixed, I use built-in guides (not full ChatGPT). Quick buttons and phrases like *"take me to seller guidelines"* still work.\n\n---\n\n` +
            rule.text;
        } else {
          let hint = "";
          if (code === "openai_rate_limit") {
            hint = "\n\nWait a minute and try again.";
          } else if (err instanceof Error && err.message) {
            hint = `\n\n(${err.message})`;
          }
          text = rule.text + hint;
        }
        updateAssistant(assistantId, {
          text,
          streaming: false,
          navigating: !!rule.navigateTo,
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
    ]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input;
    setInput("");
    respond(q);
  }

  const showThinking =
    busy && messages.length > 0 && messages[messages.length - 1]?.streaming && !messages[messages.length - 1]?.text;

  if (pathname.startsWith("/admin")) return null;

  return (
    <>
      <div
        className={`fixed right-0 top-0 z-[10001] flex h-full w-full max-w-[400px] flex-col border-l border-sky-500/20 bg-[#080a10]/98 shadow-[0_0_60px_rgba(14,165,233,0.08)] backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0 animate-fade-in-panel" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.06] to-violet-500/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-violet-500/25 text-sm shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/30">
              ✦
            </span>
            <div>
              <p className="text-sm font-bold text-white">Ask Sky Anything</p>
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
              className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-violet-400 hover:bg-violet-500/10"
            >
              New
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              aria-label="Close Ask Sky Anything"
            >
              ✕
            </button>
          </div>
        </div>

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

        {openAiReady === false && (
          <p className="border-b border-rose-500/25 bg-rose-500/[0.08] px-3 py-2 text-[10px] leading-snug text-rose-200/90">
            <strong className="text-rose-100">ChatGPT off:</strong> {openAiIssueHint(openAiIssue)}{" "}
            <a
              href="https://platform.openai.com/account/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline hover:text-white"
            >
              Open billing
            </a>
          </p>
        )}

        {!user && (
          <p className="border-b border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[10px] text-amber-400/90">
            <Link href="/login" className="font-bold underline hover:text-amber-300">
              Sign in
            </Link>{" "}
            to save conversations across devices.
          </p>
        )}

        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin">
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
                      : "border border-violet-500/15 bg-violet-500/[0.04] text-zinc-300 shadow-[0_0_24px_rgba(139,92,246,0.06)]"
                  }`}
                >
                  {renderText(m.text)}
                  {m.streaming && m.text && (
                    <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-violet-400/80" />
                  )}
                  {m.navigating && (
                    <p className="mt-1.5 text-[10px] font-medium text-emerald-400/90 animate-pulse">
                      Navigating…
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {showThinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] px-3 py-2 text-[11px] text-violet-300/70">
                Ask Sky Anything is thinking…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-sky-500/15 bg-[#06080c]/90 px-3 py-2 max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SKY_AI_QUICK_PROMPTS.map((p) => (
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
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !busy) handleSubmit(e);
                }
              }}
              placeholder="Ask about listings, prices, safety…"
              disabled={busy}
              rows={2}
              className="min-w-0 flex-1 resize-none rounded-xl border border-sky-500/20 bg-white/[0.03] px-3 py-2 text-[12px] text-white outline-none placeholder:text-zinc-600 focus:border-sky-400/50 focus:shadow-[0_0_20px_rgba(14,165,233,0.1)]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 self-end rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-2.5 text-[11px] font-bold text-white shadow-[0_0_20px_rgba(14,165,233,0.25)] hover:brightness-110 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-[10000] bg-black/50 md:bg-black/25 animate-fade-in-backdrop"
          aria-label="Close Ask Sky Anything overlay"
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
        aria-label={open ? "Close Ask Sky Anything" : "Open Ask Sky Anything assistant"}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-500 text-xs shadow-lg">
          ✦
        </span>
        <span className="max-sm:hidden">{open ? "Close" : "Ask Sky Anything"}</span>
      </button>
    </>
  );
}
