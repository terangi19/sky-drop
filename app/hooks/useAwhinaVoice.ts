"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AWHINA_NAME } from "../lib/awhina-brand";
import {
  listingFillFromVoiceApi,
  resolveVoiceCommand,
  type VoiceCommandAction,
} from "../lib/awhina-voice-command";
import { dispatchSkyAiOpen } from "../lib/sky-ai-events";
import { getFreshIdToken } from "../lib/api-auth";
import { readListingDraftFromSkyAi } from "../lib/sky-ai-listing-context";
import { stripSkyAiMachineTags, type SkyAiListingFill } from "../lib/sky-ai-listing-fill";
import { isSpeechRecognitionSupported } from "../lib/speech-recognition";
import { useVoiceInput } from "./useVoiceInput";

export type AwhinaVoicePhase = "idle" | "listening" | "processing" | "speaking" | "error";

export type AwhinaVoiceState = {
  phase: AwhinaVoicePhase;
  supported: boolean;
  listening: boolean;
  headline: string;
  transcript: string;
  hint: string | null;
  toggle: () => void;
  cancel: () => void;
};

export function useAwhinaVoice(): AwhinaVoiceState {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [phase, setPhase] = useState<AwhinaVoicePhase>("idle");
  const [headline, setHeadline] = useState("Listening…");
  const [transcript, setTranscript] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const busyRef = useRef(false);

  const runAction = useCallback(
    async (action: VoiceCommandAction) => {
      setPhase("speaking");
      setHeadline(
        action.type === "search"
          ? "Searching…"
          : action.type === "navigate"
            ? "Navigating…"
            : action.type === "listing"
              ? "Creating listing…"
              : `${AWHINA_NAME}`
      );
      setHint(action.status);

      await new Promise((r) => setTimeout(r, 450));

      if (action.type === "search" || action.type === "navigate" || action.type === "listing") {
        if (action.type === "listing") {
          dispatchSkyAiOpen(action.message);
        }
        router.push(action.path);
      } else if (action.type === "chat") {
        dispatchSkyAiOpen(action.message);
      }

      if (action.type === "reply") {
        setTranscript(action.message);
      }

      window.setTimeout(() => {
        setPhase("idle");
        setTranscript("");
        setHint(null);
        busyRef.current = false;
      }, action.type === "reply" ? 3200 : 1800);
    },
    [router]
  );

  const processTranscript = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setPhase("processing");
      setHeadline("Processing…");
      setTranscript(`"${text}"`);
      setHint(null);

      const local = resolveVoiceCommand(text, pathname);
      if (local) {
        await runAction(local);
        return;
      }

      setHeadline("Searching…");
      setHint(`Understanding "${text.length > 48 ? `${text.slice(0, 48)}…` : text}"…`);

      try {
        const token = await getFreshIdToken();
        const res = await fetch("/api/sky-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: text,
            pathname,
            listingContext: readListingDraftFromSkyAi(),
            stream: false,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          navigateTo?: string;
          listingFill?: Record<string, unknown>;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || "Voice request failed");
        }

        if (data.listingFill) {
          listingFillFromVoiceApi(data.listingFill as SkyAiListingFill);
          await runAction({
            type: "listing",
            path: "/post/ai",
            status: "Listing draft ready on Sell…",
            message: text,
          });
          return;
        }

        if (data.navigateTo) {
          await runAction({
            type: "navigate",
            path: data.navigateTo,
            status: stripSkyAiMachineTags(data.reply || "On my way…"),
          });
          return;
        }

        const reply = stripSkyAiMachineTags(data.reply || "").trim();
        if (reply) {
          await runAction({
            type: "reply",
            status: "Here's what I found…",
            message: reply,
          });
          return;
        }

        await runAction({
          type: "chat",
          status: "Opening chat for more help…",
          message: text,
        });
      } catch (err) {
        setPhase("error");
        setHeadline("Voice unavailable");
        setHint(
          err instanceof Error
            ? err.message
            : `Try typing in ${AWHINA_NAME} chat instead.`
        );
        busyRef.current = false;
        window.setTimeout(() => {
          setPhase("idle");
          setTranscript("");
          setHint(null);
        }, 4000);
      }
    },
    [pathname, runAction]
  );

  const voiceSupported =
    typeof window !== "undefined" &&
    (isSpeechRecognitionSupported() || typeof MediaRecorder !== "undefined");

  const { listening, toggleListening, stopListening } = useVoiceInput({
    onInterimTranscript: (text) => {
      setPhase("listening");
      setHeadline("Listening…");
      setTranscript(text ? `"${text}"` : "");
      setHint(null);
    },
    onFinalTranscript: (text) => {
      void processTranscript(text);
    },
    onError: (message) => {
      busyRef.current = false;
      setPhase("error");
      setHeadline("Voice unavailable");
      setHint(message);
      window.setTimeout(() => {
        setPhase("idle");
        setHint(null);
        setTranscript("");
      }, 5000);
    },
    onStatus: (message) => {
      if (message) {
        setPhase("listening");
        setHeadline("Listening…");
        setHint(message);
      }
    },
  });

  const toggle = useCallback(() => {
    if (!voiceSupported) {
      setPhase("error");
      setHeadline("Voice not supported");
      setHint("Use Chrome, Edge, or Safari — or open Āwhina chat to type.");
      return;
    }
    if (phase === "processing" || phase === "speaking") return;
    if (listening) {
      stopListening();
      setPhase("idle");
      setTranscript("");
      setHint(null);
      busyRef.current = false;
      return;
    }
    setPhase("listening");
    setHeadline("Listening…");
    setTranscript("");
    setHint("Speak naturally — e.g. “find me a gaming PC under $1,500”");
    toggleListening();
  }, [listening, phase, stopListening, toggleListening, voiceSupported]);

  const cancel = useCallback(() => {
    stopListening();
    setPhase("idle");
    setTranscript("");
    setHint(null);
    busyRef.current = false;
  }, [stopListening]);

  const activePhase: AwhinaVoicePhase =
    phase === "idle" && listening ? "listening" : phase;

  return {
    phase: activePhase,
    supported: voiceSupported,
    listening,
    headline,
    transcript,
    hint,
    toggle,
    cancel,
  };
}
