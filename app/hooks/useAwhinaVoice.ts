"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AWHINA_NAME } from "../lib/awhina-brand";
import {
  formatUtteranceDisplay,
  listeningHeadline,
  silenceMsForText,
} from "../lib/awhina-voice-end-of-speech";
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
import { useVoiceInput, type UtteranceUpdateMeta } from "./useVoiceInput";

export type AwhinaVoicePhase =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "paused"
  | "error";

const INACTIVITY_MS = 45_000;
const PAUSED_HINT =
  'Voice paused. Tap the mic or say "Resume listening" to continue.';
const VOICE_MODE_ON_HINT = "Voice Mode on — speak anytime.";

export type AwhinaVoiceState = {
  phase: AwhinaVoicePhase;
  voiceMode: boolean;
  paused: boolean;
  supported: boolean;
  listening: boolean;
  headline: string;
  transcript: string;
  hint: string | null;
  toggle: () => void;
  cancel: () => void;
  resume: () => void;
};

export function useAwhinaVoice() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [phase, setPhase] = useState<AwhinaVoicePhase>("idle");
  const [voiceMode, setVoiceMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [headline, setHeadline] = useState("Listening…");
  const [transcript, setTranscript] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  const voiceModeRef = useRef(false);
  const pausedRef = useRef(false);
  const busyRef = useRef(false);
  const utteranceTextRef = useRef("");
  const onUtteranceFlushedRef = useRef<(() => void) | null>(null);
  const endOfSpeechTimerRef = useRef<number | null>(null);
  const stillListeningTimerRef = useRef<number | null>(null);
  const abortProcessingRef = useRef(false);
  const processGenerationRef = useRef(0);
  const inactivityTimerRef = useRef<number | null>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);

  const clearEndOfSpeechTimers = useCallback(() => {
    if (endOfSpeechTimerRef.current) {
      window.clearTimeout(endOfSpeechTimerRef.current);
      endOfSpeechTimerRef.current = null;
    }
    if (stillListeningTimerRef.current) {
      window.clearTimeout(stillListeningTimerRef.current);
      stillListeningTimerRef.current = null;
    }
  }, []);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const setPausedState = useCallback((value: boolean) => {
    pausedRef.current = value;
    setPaused(value);
  }, []);

  const scheduleInactivityPause = useCallback(() => {
    clearInactivityTimer();
    if (!voiceModeRef.current || pausedRef.current) return;
    inactivityTimerRef.current = window.setTimeout(() => {
      if (!voiceModeRef.current || busyRef.current) return;
      setPausedState(true);
      clearEndOfSpeechTimers();
      stopListeningRef.current?.();
      setPhase("paused");
      setHeadline("Voice paused");
      setHint(PAUSED_HINT);
      setTranscript("");
      utteranceTextRef.current = "";
    }, INACTIVITY_MS);
  }, [clearEndOfSpeechTimers, clearInactivityTimer, setPausedState]);

  const bumpActivity = useCallback(() => {
    if (voiceModeRef.current && !pausedRef.current) {
      scheduleInactivityPause();
    }
  }, [scheduleInactivityPause]);

  const afterCommandCycle = useCallback(() => {
    busyRef.current = false;
    abortProcessingRef.current = false;
    if (!voiceModeRef.current) {
      setPhase("idle");
      setTranscript("");
      setHint(null);
      utteranceTextRef.current = "";
      return;
    }
    if (pausedRef.current) return;
    setPhase("listening");
    setHeadline("Listening…");
    setHint(VOICE_MODE_ON_HINT);
    scheduleInactivityPause();
    window.setTimeout(() => {
      if (voiceModeRef.current && !pausedRef.current && !busyRef.current) {
        void startListeningRef.current?.();
      }
    }, 500);
  }, [scheduleInactivityPause]);

  const resumeListening = useCallback(() => {
    if (!voiceModeRef.current) return;
    setPausedState(false);
    utteranceTextRef.current = "";
    onUtteranceFlushedRef.current?.();
    clearEndOfSpeechTimers();
    setPhase("listening");
    setHeadline("Listening…");
    setTranscript("");
    setHint(VOICE_MODE_ON_HINT);
    scheduleInactivityPause();
    void startListeningRef.current?.();
  }, [clearEndOfSpeechTimers, scheduleInactivityPause, setPausedState]);

  const disableVoiceMode = useCallback(() => {
    voiceModeRef.current = false;
    setPausedState(false);
    setVoiceMode(false);
    clearInactivityTimer();
    clearEndOfSpeechTimers();
    busyRef.current = false;
    abortProcessingRef.current = false;
    processGenerationRef.current += 1;
    utteranceTextRef.current = "";
    stopListeningRef.current?.();
    setPhase("idle");
    setTranscript("");
    setHint(null);
  }, [clearEndOfSpeechTimers, clearInactivityTimer, setPausedState]);

  const runAction = useCallback(
    async (action: VoiceCommandAction) => {
      if (action.type === "resume") {
        resumeListening();
        busyRef.current = false;
        return;
      }

      if (action.type === "voice_off") {
        disableVoiceMode();
        return;
      }

      setPhase("speaking");
      setHeadline(
        action.type === "search"
          ? "Searching…"
          : action.type === "navigate"
            ? "Navigating…"
            : action.type === "listing"
              ? "Creating listing…"
              : action.type === "page"
                ? "Working…"
                : `${AWHINA_NAME}`
      );
      setHint(action.status);

      await new Promise((r) => setTimeout(r, 400));

      if (action.type === "page") {
        const result = action.run();
        if (!result.ok) {
          setHint("Couldn't do that on this page — try another command.");
          busyRef.current = false;
          afterCommandCycle();
          return;
        }
        if (result.path && !result.path.startsWith("#")) {
          router.push(result.path);
        }
      } else if (
        action.type === "search" ||
        action.type === "navigate" ||
        action.type === "listing"
      ) {
        if (action.type === "listing") {
          dispatchSkyAiOpen(action.message);
        }
        router.push(action.path);
      } else if (action.type === "chat") {
        dispatchSkyAiOpen(action.message);
      }

      if (action.type === "reply") {
        setTranscript(action.message);
        window.setTimeout(() => afterCommandCycle(), 2800);
        return;
      }

      window.setTimeout(() => afterCommandCycle(), 900);
    },
    [afterCommandCycle, disableVoiceMode, resumeListening, router]
  );

  const processTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const generation = ++processGenerationRef.current;
      abortProcessingRef.current = false;
      clearInactivityTimer();
      busyRef.current = true;
      setPhase("processing");
      setHeadline("Processing…");
      setTranscript(formatUtteranceDisplay(trimmed));
      setHint(null);

      const abortIfSuperseded = () =>
        abortProcessingRef.current || generation !== processGenerationRef.current;

      const local = resolveVoiceCommand(trimmed, pathname);
      if (local) {
        if (abortIfSuperseded()) {
          busyRef.current = false;
          return;
        }
        await runAction(local);
        return;
      }

      setHeadline("Processing…");
      setHint(`Understanding "${trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed}"…`);

      try {
        const token = await getFreshIdToken();
        const res = await fetch("/api/sky-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: trimmed,
            pathname,
            listingContext: readListingDraftFromSkyAi(),
            stream: false,
          }),
        });

        if (abortIfSuperseded()) {
          busyRef.current = false;
          return;
        }

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
            message: trimmed,
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
          message: trimmed,
        });
      } catch (err) {
        if (abortIfSuperseded()) {
          busyRef.current = false;
          return;
        }
        setPhase("error");
        setHeadline("Voice unavailable");
        setHint(
          err instanceof Error
            ? err.message
            : `Try typing in ${AWHINA_NAME} chat instead.`
        );
        busyRef.current = false;
        window.setTimeout(() => {
          if (voiceModeRef.current) {
            resumeListening();
          } else {
            setPhase("idle");
            setTranscript("");
            setHint(null);
          }
        }, 3500);
      }
    },
    [clearInactivityTimer, pathname, resumeListening, runAction]
  );

  const flushUtterance = useCallback(
    (text: string) => {
      clearEndOfSpeechTimers();
      utteranceTextRef.current = "";
      onUtteranceFlushedRef.current?.();
      void processTranscript(text);
    },
    [clearEndOfSpeechTimers, processTranscript]
  );

  const scheduleEndOfSpeech = useCallback(
    (display: string) => {
      clearEndOfSpeechTimers();
      const trimmed = display.trim();
      if (!trimmed) return;

      const silenceMs = silenceMsForText(trimmed);
      const quietStart = Date.now();

      stillListeningTimerRef.current = window.setTimeout(() => {
        if (!utteranceTextRef.current.trim() || busyRef.current) return;
        const quietFor = Date.now() - quietStart;
        setHeadline(listeningHeadline(utteranceTextRef.current, quietFor));
      }, 1_400);

      endOfSpeechTimerRef.current = window.setTimeout(() => {
        const latest = utteranceTextRef.current.trim();
        if (!latest || busyRef.current) return;
        flushUtterance(latest);
      }, silenceMs);
    },
    [clearEndOfSpeechTimers, flushUtterance]
  );

  const handleUtteranceUpdate = useCallback(
    (display: string, meta: UtteranceUpdateMeta) => {
      if (busyRef.current) {
        abortProcessingRef.current = true;
        busyRef.current = false;
        processGenerationRef.current += 1;
        setPhase("listening");
        setHeadline("Listening…");
      }

      clearEndOfSpeechTimers();
      utteranceTextRef.current = display;

      if (!display.trim()) return;

      if (pausedRef.current) {
        setPausedState(false);
      }

      bumpActivity();
      setPhase("listening");
      setHeadline(listeningHeadline(display, 0));
      setTranscript(formatUtteranceDisplay(display));
      if (voiceModeRef.current) setHint(VOICE_MODE_ON_HINT);

      if (meta.completeUtterance) {
        flushUtterance(display.trim());
        return;
      }

      scheduleEndOfSpeech(display);
    },
    [bumpActivity, flushUtterance, scheduleEndOfSpeech, setPausedState]
  );

  const voiceSupported =
    typeof window !== "undefined" &&
    (isSpeechRecognitionSupported() || typeof MediaRecorder !== "undefined");

  const { listening, startListening, stopListening } = useVoiceInput({
    continuous: voiceMode,
    keepAlive: voiceMode,
    sessionContinuousRef: voiceModeRef,
    utteranceTextRef,
    onUtteranceFlushedRef,
    onUtteranceUpdate: handleUtteranceUpdate,
    onError: (message) => {
      if (!voiceModeRef.current) {
        busyRef.current = false;
        setPhase("error");
        setHeadline("Voice unavailable");
        setHint(message);
        window.setTimeout(() => {
          setPhase("idle");
          setHint(null);
          setTranscript("");
        }, 5000);
        return;
      }
      setHint(message);
      scheduleInactivityPause();
      if (!pausedRef.current && !busyRef.current) {
        window.setTimeout(() => {
          if (voiceModeRef.current && !pausedRef.current && !busyRef.current) {
            void startListeningRef.current?.();
          }
        }, 1200);
      }
    },
    onStatus: (message) => {
      if (message && voiceModeRef.current && !busyRef.current) {
        setPhase("listening");
        if (!utteranceTextRef.current.trim()) {
          setHeadline("Listening…");
        }
        setHint(message);
      }
    },
    onActivity: () => {
      bumpActivity();
      const display = utteranceTextRef.current;
      if (display.trim() && !busyRef.current) {
        setHeadline(listeningHeadline(display, 0));
        scheduleEndOfSpeech(display);
      }
    },
  });

  startListeningRef.current = startListening;
  stopListeningRef.current = stopListening;

  const enableVoiceMode = useCallback(() => {
    voiceModeRef.current = true;
    setPausedState(false);
    setVoiceMode(true);
    utteranceTextRef.current = "";
    onUtteranceFlushedRef.current?.();
    clearEndOfSpeechTimers();
    setPhase("listening");
    setHeadline("Listening…");
    setTranscript("");
    setHint(VOICE_MODE_ON_HINT);
    scheduleInactivityPause();
    void startListening();
  }, [clearEndOfSpeechTimers, scheduleInactivityPause, setPausedState, startListening]);

  const toggle = useCallback(() => {
    if (!voiceSupported) {
      setPhase("error");
      setHeadline("Voice not supported");
      setHint("Use Chrome, Edge, or Safari — or open Āwhina chat to type.");
      return;
    }
    if (paused && voiceModeRef.current) {
      resumeListening();
      return;
    }
    if (voiceModeRef.current) {
      disableVoiceMode();
      return;
    }
    enableVoiceMode();
  }, [disableVoiceMode, enableVoiceMode, paused, resumeListening, voiceSupported]);

  const cancel = useCallback(() => {
    disableVoiceMode();
  }, [disableVoiceMode]);

  const resume = useCallback(() => {
    resumeListening();
  }, [resumeListening]);

  useEffect(() => {
    if (!voiceModeRef.current || pausedRef.current || busyRef.current) return;
    const t = window.setTimeout(() => {
      if (voiceModeRef.current && !pausedRef.current && !busyRef.current && !listening) {
        void startListening();
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [pathname, listening, startListening]);

  useEffect(() => {
    const onBeforeUnload = () => {
      voiceModeRef.current = false;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(
    () => () => {
      clearInactivityTimer();
      clearEndOfSpeechTimers();
    },
    [clearEndOfSpeechTimers, clearInactivityTimer]
  );

  const showCard = voiceMode || phase === "error";
  const activePhase: AwhinaVoicePhase = !showCard
    ? "idle"
    : phase === "idle" && voiceMode
      ? paused
        ? "paused"
        : "listening"
      : phase;

  return {
    phase: activePhase,
    voiceMode,
    paused,
    supported: voiceSupported,
    listening:
      voiceMode &&
      !paused &&
      (listening || phase === "listening" || phase === "processing"),
    headline,
    transcript,
    hint,
    toggle,
    cancel,
    resume,
  };
}
