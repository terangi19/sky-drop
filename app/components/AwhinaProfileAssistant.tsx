"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AWHINA_NAME, AWHINA_THINKING } from "../lib/awhina-brand";
import { getFreshIdToken } from "../lib/api-auth";
import {
  SKY_AI_PROFILE_QUICK_PROMPTS,
  SKY_AI_PROFILE_WELCOME,
} from "../lib/sky-ai-prompts";
import { readProfileDraftFromSkyAi, syncProfileDraftToSkyAi } from "../lib/sky-ai-profile-context";
import {
  extractProfileFill,
  hasProfileFillContent,
  mergeProfileFill,
  profileDraftChecklist,
  type SkyAiProfileFill,
} from "../lib/sky-ai-profile-fill";
import { stripSkyAiMachineTags } from "../lib/sky-ai-listing-fill";
import AwhinaAvatar from "./AwhinaAvatar";
import AwhinaOnlineBadge from "./AwhinaOnlineBadge";

const PREFERS_REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
};

type Props = {
  draft: SkyAiProfileFill;
  onApplyFill: (fill: SkyAiProfileFill) => void;
  className?: string;
};

const WELCOME_ID = "welcome";

function getUpdatedFields(
  current: SkyAiProfileFill,
  incoming: SkyAiProfileFill
): string[] {
  const updated: string[] = [];
  if (incoming.bio && incoming.bio !== current.bio) updated.push("bio");
  if (incoming.region && incoming.region !== current.region) updated.push("region");
  if (incoming.username && incoming.username !== current.username) updated.push("username");
  if (incoming.instagram && incoming.instagram !== current.instagram) updated.push("Instagram");
  if (incoming.facebook && incoming.facebook !== current.facebook) updated.push("Facebook");
  if (incoming.website && incoming.website !== current.website) updated.push("website");
  if (incoming.discord && incoming.discord !== current.discord) updated.push("Discord");
  if (incoming.tiktok && incoming.tiktok !== current.tiktok) updated.push("TikTok");
  if (incoming.youtube && incoming.youtube !== current.youtube) updated.push("YouTube");
  if (incoming.businessName && incoming.businessName !== current.businessName) updated.push("business name");
  return updated;
}

function DraftCheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        done
          ? "border-sky-500/25 bg-sky-500/10 text-sky-300 light:border-sky-600/30 light:bg-sky-100 light:text-sky-700"
          : "border-white/[0.06] bg-white/[0.02] text-zinc-500 awhina-chat-muted light:border-gray-300/30 light:bg-gray-100 light:text-gray-600"
      }`}
    >
      <span className={done ? "text-sky-400 light:text-sky-600" : "text-zinc-600 light:text-gray-500"}>{done ? "✓" : "○"}</span>
      {label}
    </span>
  );
}

export default function AwhinaProfileAssistant({ draft, onApplyFill, className = "" }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: WELCOME_ID, role: "assistant", text: SKY_AI_PROFILE_WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [lastUpdatedFields, setLastUpdatedFields] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const checklist = useMemo(() => profileDraftChecklist(draft), [draft]);

  useEffect(() => {
    syncProfileDraftToSkyAi(draft);
  }, [draft]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const respond = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || busy) return;

      setBusy(true);
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: trimmed };
      setMessages((prev) => [...prev.filter((m) => m.id !== WELCOME_ID), userMsg]);

      const history = [...messagesRef.current, userMsg]
        .filter((m) => m.id !== WELCOME_ID && !m.streaming)
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.text }));

      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "", streaming: true }]);

      try {
        const token = await getFreshIdToken();
        const profileContext = readProfileDraftFromSkyAi() || draft;
        const res = await fetch("/api/sky-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: trimmed,
            pathname: "/profile",
            conversationId: conversationId || undefined,
            profileContext,
            stream: true,
          }),
        });

        let replyText = "";
        let newConversationId = conversationId;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          replyText = data.reply || "I couldn't update your profile right now. Try again.";
          if (data.profileFill && hasProfileFillContent(data.profileFill)) {
            const updated = getUpdatedFields(profileContext, data.profileFill);
            setLastUpdatedFields(updated);
            onApplyFill(mergeProfileFill(profileContext, data.profileFill));
          } else {
            const extractedFill = extractProfileFill(replyText);
            if (extractedFill && hasProfileFillContent(extractedFill)) {
              const updated = getUpdatedFields(profileContext, extractedFill);
              setLastUpdatedFields(updated);
              onApplyFill(mergeProfileFill(profileContext, extractedFill));
            }
          }
        } else if (res.body && (res.headers.get("content-type") || "").includes("text/event-stream")) {
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
                  profileFill?: SkyAiProfileFill;
                  conversationId?: string;
                };
                if (evt.type === "delta" && evt.text) {
                  accumulated += evt.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, text: stripSkyAiMachineTags(accumulated) }
                        : m
                    )
                  );
                }
                if (evt.type === "done") {
                  replyText = evt.reply || stripSkyAiMachineTags(accumulated);
                  if (evt.conversationId) newConversationId = evt.conversationId;
                  if (evt.profileFill && hasProfileFillContent(evt.profileFill)) {
                    const updated = getUpdatedFields(profileContext, evt.profileFill);
                    setLastUpdatedFields(updated);
                    onApplyFill(mergeProfileFill(profileContext, evt.profileFill));
                  } else {
                    const extractedFill = extractProfileFill(replyText);
                    if (extractedFill && hasProfileFillContent(extractedFill)) {
                      const updated = getUpdatedFields(profileContext, extractedFill);
                      setLastUpdatedFields(updated);
                      onApplyFill(mergeProfileFill(profileContext, extractedFill));
                    }
                  }
                }
              } catch {
                /* skip bad chunks */
              }
            }
          }
        } else {
          const data = await res.json();
          replyText = data.reply || "";
          if (data.conversationId) newConversationId = data.conversationId;
          if (data.profileFill && hasProfileFillContent(data.profileFill)) {
            const updated = getUpdatedFields(profileContext, data.profileFill);
            setLastUpdatedFields(updated);
            onApplyFill(mergeProfileFill(profileContext, data.profileFill));
          } else {
            const extractedFill = extractProfileFill(replyText);
            if (extractedFill && hasProfileFillContent(extractedFill)) {
              const updated = getUpdatedFields(profileContext, extractedFill);
              setLastUpdatedFields(updated);
              onApplyFill(mergeProfileFill(profileContext, extractedFill));
            }
          }
        }

        if (newConversationId) setConversationId(newConversationId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: replyText || "Done — check your profile fields below.", streaming: false }
              : m
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: "Āwhina couldn't process your request. Please try again or rephrase your message.", streaming: false }
              : m
          )
        );
      } finally {
        setBusy(false);
        setInput("");
      }
    },
    [busy, conversationId, draft, onApplyFill]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    respond(input);
  }

  return (
    <div
      className={`awhina-chat awhina-chat-shell relative overflow-hidden rounded-2xl border border-sky-500/20 shadow-[0_12px_40px_rgba(14,165,233,0.08)] backdrop-blur-2xl light:border-sky-600/20 light:shadow-[0_12px_40px_rgba(14,165,233,0.12)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent light:via-sky-600/30" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.12),transparent_60%)] light:bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.08),transparent_60%)]" />

      <div className="relative p-4 sm:p-5">
        <div className="flex gap-3 sm:gap-4">
          <AwhinaAvatar speaking={busy} size="md" />
          <div className="min-w-0 flex-1">
            <AwhinaOnlineBadge />
            <p className="mt-2 text-sm font-medium text-always-white light:text-gray-800">
              Talk to {AWHINA_NAME} — I&apos;ll fill your profile as we go.
            </p>
            <p className="mt-1 text-[12px] text-zinc-400 light:text-gray-600">
              Tell me about yourself — I'll build your profile as we go.
            </p>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="mt-4 max-h-44 space-y-2 overflow-y-auto rounded-xl border border-white/[0.05] awhina-chat-history-bg px-3 py-2.5 scrollbar-thin light:border-gray-300/30"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`text-[12px] leading-relaxed ${
                m.role === "user" ? "text-right text-sky-300 light:text-sky-600" : "text-always-white/90 light:text-gray-700"
              }`}
            >
              {m.role === "user" && (
                <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-zinc-600 light:text-gray-500">
                  You
                </span>
              )}
              {m.role === "assistant" && m.id !== WELCOME_ID && (
                <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-sky-500/70 light:text-sky-600">
                  {AWHINA_NAME}
                </span>
              )}
              <span className={m.role === "user" ? "inline-block rounded-lg bg-sky-500/10 px-2.5 py-1.5 light:bg-sky-100" : ""}>
                {m.text}
                {m.streaming && !PREFERS_REDUCED_MOTION && (
                  <span className="ml-0.5 inline-block h-3 w-[2px] awhina-cursor-blink bg-sky-400 align-middle light:bg-sky-600" />
                )}
              </span>
            </div>
          ))}
          {busy && messages[messages.length - 1]?.role !== "assistant" && (
            <p className="text-[11px] text-zinc-500 light:text-gray-600">{AWHINA_THINKING}</p>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 light:border-gray-300/30 light:bg-gray-100/80">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 light:text-gray-600">Profile Completion</p>
            <span className="text-[11px] font-bold text-sky-400 light:text-sky-600">
              {Math.round(
                ([checklist.username, checklist.bio, checklist.region, checklist.social].filter(Boolean).length / 4) * 100
              )}%
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06] light:bg-gray-300">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500"
              style={{ width: `${([checklist.username, checklist.bio, checklist.region, checklist.social].filter(Boolean).length / 4) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <DraftCheckItem done={checklist.username} label="Username" />
            <DraftCheckItem done={checklist.bio} label="Bio" />
            <DraftCheckItem done={checklist.region} label="Region" />
            <DraftCheckItem done={checklist.social} label="Social links" />
          </div>
          {lastUpdatedFields.length > 0 && (
            <p className="mt-2 text-[10px] text-sky-400 light:text-sky-600">
              Updated: {lastUpdatedFields.join(", ")}
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SKY_AI_PROFILE_QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={busy}
              onClick={() => respond(p.query)}
              className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-40 light:border-sky-600/30 light:bg-sky-100 light:text-sky-700 light:hover:bg-sky-200"
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder='e.g. "I sell cars in Auckland" or "Write my bio"'
            className="min-w-0 flex-1 rounded-xl border border-sky-500/20 bg-white/[0.03] px-3 py-2.5 text-[13px] text-always-white outline-none placeholder:text-zinc-500 focus:border-sky-400/50 light:border-gray-300 light:bg-white light:text-gray-800 light:placeholder:text-gray-400 light:focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2.5 text-xs font-bold text-always-white shadow-[0_0_20px_rgba(56,189,248,0.2)] transition hover:brightness-110 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
