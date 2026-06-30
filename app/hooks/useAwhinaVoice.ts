"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AWHINA_NAME } from "../lib/awhina-brand";
import {
  endOfSpeechDelayMs,
  formatUtteranceDisplay,
  isActionableTranscript,
  isIncompleteUtterance,
  isListingSpeech,
  listeningHeadline,
} from "../lib/awhina-voice-end-of-speech";
import {
  isCompleteNavPhrase,
  listingFillFromVoiceApi,
  resolveVoiceCommand,
  type VoiceCommandAction,
} from "../lib/awhina-voice-command";
import { dispatchSkyAiOpen } from "../lib/sky-ai-events";
import { getFreshIdToken } from "../lib/api-auth";
import { readListingDraftFromSkyAi } from "../lib/sky-ai-listing-context";
import { stripSkyAiMachineTags, type SkyAiListingFill } from "../lib/sky-ai-listing-fill";
import { isSpeechRecognitionSupported } from "../lib/speech-recognition";
import { showToast } from "../components/Toast";
import { useVoiceInput, type UtteranceUpdateMeta } from "./useVoiceInput";

export type AwhinaVoicePhase =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "paused"
  | "error"
  | "confirming";

const VOICE_PREFETCH_PATHS = [
  "/watchlist",
  "/services",
  "/search",
  "/messages",
  "/dashboard",
  "/vehicles",
  "/rentals",
  "/post/ai",
  "/sales",
  "/purchases",
];

const INACTIVITY_MS = 45_000;
const VOICE_MODE_STORAGE_KEY = "awhina-voice-mode-on";

function readVoiceModePersisted(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(VOICE_MODE_STORAGE_KEY) === "1";
}
const PAUSED_HINT =
  'Voice paused. Tap the mic or say "Resume listening" to continue.';
const VOICE_MODE_ON_HINT = "Voice Mode on — speak anytime.";

/* Confirmation intent detection */
const CONFIRM_INTENT = /\b(yes|yeah|yep|sure|correct|that'?s right|right|go ahead|do it|okay|ok|confirm|that'?s it|exactly)\b/i;
const DENY_INTENT = /\b(no|nah|nope|cancel|never mind|forget it|stop|not that|wrong|different|no way)\b/i;

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
  /** Visual feedback: what the user said */
  heardText: string | null;
  /** Visual feedback: what action is being taken */
  actionText: string | null;
};

export function useAwhinaVoice() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [phase, setPhase] = useState<AwhinaVoicePhase>(() =>
    readVoiceModePersisted() ? "listening" : "idle"
  );
  const [voiceMode, setVoiceMode] = useState(readVoiceModePersisted);
  const [paused, setPaused] = useState(false);
  const [headline, setHeadline] = useState("Listening…");
  const [transcript, setTranscript] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [heardText, setHeardText] = useState<string | null>(null);
  const [actionText, setActionText] = useState<string | null>(null);

  const voiceModeRef = useRef(readVoiceModePersisted());
  const pausedRef = useRef(false);
  const busyRef = useRef(false);
  const navigatedByVoiceRef = useRef(false);
  const utteranceTextRef = useRef("");
  const onUtteranceFlushedRef = useRef<(() => void) | null>(null);
  const endOfSpeechTimerRef = useRef<number | null>(null);
  const stillListeningTimerRef = useRef<number | null>(null);
  const abortProcessingRef = useRef(false);
  const processGenerationRef = useRef(0);
  const lastScheduledTextRef = useRef("");
  const lastInstantExecRef = useRef("");
  const lastInstantAtRef = useRef(0);
  const lastCommandAtRef = useRef(0);
  const COMMAND_COOLDOWN_MS = 1200;
  const inactivityTimerRef = useRef<number | null>(null);
  const stopListeningRef = useRef<((options?: { preserveVoiceSession?: boolean }) => void) | null>(null);
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);
  const restartListeningRef = useRef<((options?: { force?: boolean }) => Promise<void>) | null>(null);
  const micListeningRef = useRef(false);
  const previousPathRef = useRef<string>(pathname);

  /* ── Confirmation state for medium-confidence commands ── */
  const pendingConfirmationRef = useRef<VoiceCommandAction | null>(null);

  const persistVoiceMode = useCallback((on: boolean) => {
    if (typeof window === "undefined") return;
    if (on) sessionStorage.setItem(VOICE_MODE_STORAGE_KEY, "1");
    else sessionStorage.removeItem(VOICE_MODE_STORAGE_KEY);
  }, []);

  const keepVoiceModeOn = useCallback(() => {
    voiceModeRef.current = true;
    setVoiceMode(true);
    persistVoiceMode(true);
  }, [persistVoiceMode]);

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

  const clearVisualFeedback = useCallback(() => {
    setHeardText(null);
    setActionText(null);
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
      setHeardText(null);
      setActionText(null);
      utteranceTextRef.current = "";
    }, INACTIVITY_MS);
  }, [clearEndOfSpeechTimers, clearInactivityTimer, setPausedState]);

  const bumpActivity = useCallback(() => {
    if (voiceModeRef.current && !pausedRef.current) {
      scheduleInactivityPause();
    }
  }, [scheduleInactivityPause]);

  const afterCommandCycle = useCallback(() => {
    lastCommandAtRef.current = Date.now();
    busyRef.current = false;
    abortProcessingRef.current = false;
    pendingConfirmationRef.current = null;
    if (!voiceModeRef.current) {
      setPhase("idle");
      setTranscript("");
      setHint(null);
      setHeardText(null);
      setActionText(null);
      utteranceTextRef.current = "";
      return;
    }
    keepVoiceModeOn();
    if (pausedRef.current) return;
    onUtteranceFlushedRef.current?.();
    lastScheduledTextRef.current = "";
    utteranceTextRef.current = "";
    lastInstantExecRef.current = "";
    setPhase("listening");
    setHeadline("Listening…");
    setTranscript("");
    setHint(VOICE_MODE_ON_HINT);
    setHeardText(null);
    setActionText(null);
    scheduleInactivityPause();
    if (navigatedByVoiceRef.current || !micListeningRef.current) {
      navigatedByVoiceRef.current = false;
      void restartListeningRef.current?.({ force: true });
    }
  }, [keepVoiceModeOn, scheduleInactivityPause]);

  const ensureListening = useCallback(() => {
    if (!voiceModeRef.current || pausedRef.current || busyRef.current) return;
    void restartListeningRef.current?.();
  }, []);

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
    setHeardText(null);
    setActionText(null);
    scheduleInactivityPause();
    ensureListening();
  }, [clearEndOfSpeechTimers, ensureListening, scheduleInactivityPause, setPausedState]);

  const disableVoiceMode = useCallback(() => {
    voiceModeRef.current = false;
    setPausedState(false);
    setVoiceMode(false);
    persistVoiceMode(false);
    clearInactivityTimer();
    clearEndOfSpeechTimers();
    busyRef.current = false;
    abortProcessingRef.current = false;
    processGenerationRef.current += 1;
    pendingConfirmationRef.current = null;
    utteranceTextRef.current = "";
    stopListeningRef.current?.();
    setPhase("idle");
    setTranscript("");
    setHint(null);
    setHeardText(null);
    setActionText(null);
  }, [clearEndOfSpeechTimers, clearInactivityTimer, persistVoiceMode, setPausedState]);

  const runAction = useCallback(
    async (action: VoiceCommandAction) => {
      keepVoiceModeOn();
      if (action.type === "resume") {
        resumeListening();
        busyRef.current = false;
        return;
      }

      if (action.type === "voice_off") {
        disableVoiceMode();
        return;
      }

      // Set visual feedback
      if (action.heard && action.targetTitle) {
        setHeardText(action.heard);
        setActionText(action.targetTitle);
      } else if (action.heard) {
        setHeardText(action.heard);
      }

      // Show toast for navigation actions
      if (
        action.type === "navigate" ||
        action.type === "search" ||
        action.type === "page" ||
        action.type === "listing"
      ) {
        showToast(action.status || "Opening…", "info");
      }

      if (action.type === "page") {
        const result = action.run();
        if (!result.ok) {
          setHint("Couldn't do that on this page — try another command.");
          busyRef.current = false;
          afterCommandCycle();
          return;
        }
        if (result.path && !result.path.startsWith("#")) {
          navigatedByVoiceRef.current = true;
          setPhase("speaking");
          setHeadline(action.status || "Opening…");
          router.push(result.path);
        }
        afterCommandCycle();
        return;
      }

      if (
        action.type === "search" ||
        action.type === "navigate" ||
        action.type === "listing"
      ) {
        if (action.type === "listing") {
          dispatchSkyAiOpen(action.message);
        }
        navigatedByVoiceRef.current = true;
        setPhase("speaking");
        setHeadline(action.status || "Opening…");
        router.push(action.path);
        afterCommandCycle();
        return;
      }

      if (action.type === "chat") {
        dispatchSkyAiOpen(action.message);
        afterCommandCycle();
        return;
      }

      if (action.type === "reply") {
        setPhase("speaking");
        setHeadline(`${AWHINA_NAME}`);
        setHint(action.status);
        setTranscript(action.message);
        window.setTimeout(() => afterCommandCycle(), 1800);
        return;
      }

      afterCommandCycle();
    },
    [afterCommandCycle, disableVoiceMode, keepVoiceModeOn, resumeListening, router]
  );

  const runVoiceCommandNow = useCallback(
    (trimmed: string): boolean => {
      if (busyRef.current) return false;

      // Check if user is responding to a confirmation prompt
      const pending = pendingConfirmationRef.current;
      if (pending) {
        if (CONFIRM_INTENT.test(trimmed)) {
          pendingConfirmationRef.current = null;
          busyRef.current = true;
          void runAction(pending);
          return true;
        }
        if (DENY_INTENT.test(trimmed)) {
          pendingConfirmationRef.current = null;
          setHint(`Cancelled. Try saying "go to ${pending.targetTitle}".`);
          afterCommandCycle();
          return true;
        }
        // User said something else — cancel confirmation, process new input
        pendingConfirmationRef.current = null;
      }

      const cmd = resolveVoiceCommand(trimmed, pathname);
      if (!cmd) return false;

      if (cmd.type === "listing" && isListingSpeech(trimmed)) return false;
      if (cmd.type === "chat") return false;

      const execKey =
        cmd.type === "navigate" || cmd.type === "search" || cmd.type === "listing"
          ? `${cmd.type}:${cmd.path}`
          : cmd.type;
      const now = Date.now();
      if (
        lastInstantExecRef.current === execKey &&
        now - lastInstantAtRef.current < 600
      ) {
        return true;
      }

      // Medium confidence — ask user instead of navigating
      if (cmd.confidence === "medium" && cmd.targetTitle && (cmd.type === "navigate" || cmd.type === "search")) {
        lastInstantExecRef.current = execKey;
        lastInstantAtRef.current = now;
        pendingConfirmationRef.current = cmd;
        keepVoiceModeOn();
        setPhase("confirming" as AwhinaVoicePhase);
        setHeadline("Did you mean…");
        setTranscript(formatUtteranceDisplay(trimmed));
        setHint(`Did you mean ${cmd.targetTitle}? Say "Yes" or "No".`);
        clearEndOfSpeechTimers();
        lastScheduledTextRef.current = "";
        utteranceTextRef.current = "";
        return true;
      }

      clearEndOfSpeechTimers();
      lastScheduledTextRef.current = "";
      utteranceTextRef.current = "";
      onUtteranceFlushedRef.current?.();
      keepVoiceModeOn();

      if (cmd.type === "resume") {
        lastInstantExecRef.current = execKey;
        lastInstantAtRef.current = now;
        busyRef.current = false;
        resumeListening();
        return true;
      }

      if (cmd.type === "voice_off") {
        lastInstantExecRef.current = execKey;
        lastInstantAtRef.current = now;
        disableVoiceMode();
        return true;
      }

      if (cmd.type === "reply") {
        lastInstantExecRef.current = execKey;
        lastInstantAtRef.current = now;
        busyRef.current = true;
        setTranscript(formatUtteranceDisplay(trimmed));
        setHint(cmd.message.replace(/\*\*([^*]+)\*\*/g, "$1"));
        afterCommandCycle();
        return true;
      }

      if (cmd.type === "page") {
        busyRef.current = true;
        lastInstantExecRef.current = execKey;
        lastInstantAtRef.current = now;
        showToast(cmd.status || "Opening…", "info");
        const result = cmd.run!();
        if (!result.ok) {
          busyRef.current = false;
          setHint("Couldn't do that on this page — try another command.");
          afterCommandCycle();
          return false;
        }
        if (result.path && !result.path.startsWith("#")) {
          navigatedByVoiceRef.current = true;
          router.push(result.path);
        }
        afterCommandCycle();
        return true;
      }

      if (cmd.type === "navigate" || cmd.type === "search" || cmd.type === "listing") {
        busyRef.current = true;
        lastInstantExecRef.current = execKey;
        lastInstantAtRef.current = now;
        showToast(cmd.status || "Opening…", "info");
        if (cmd.type === "listing") {
          dispatchSkyAiOpen(cmd.message);
        }
        navigatedByVoiceRef.current = true;
        router.push(cmd.path);
        afterCommandCycle();
        return true;
      }

      return false;
    },
    [
      afterCommandCycle,
      clearEndOfSpeechTimers,
      disableVoiceMode,
      keepVoiceModeOn,
      pathname,
      resumeListening,
      router,
      runAction,
    ]
  );

  const processTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const generation = ++processGenerationRef.current;
      abortProcessingRef.current = false;
      clearInactivityTimer();

      const local = resolveVoiceCommand(trimmed, pathname);
      const isInstant =
        local?.type === "navigate" ||
        local?.type === "search" ||
        local?.type === "page";

      busyRef.current = true;

      if (!isInstant && local?.confidence === "high") {
        setPhase("processing");
        setHeadline("Processing…");
        setTranscript(formatUtteranceDisplay(trimmed));
        setHint(null);
      }

      const abortIfSuperseded = () =>
        abortProcessingRef.current || generation !== processGenerationRef.current;

      if (local) {
        if (abortIfSuperseded()) {
          busyRef.current = false;
          return;
        }
        await runAction(local);
        return;
      }

      setPhase("processing");
      setHeadline("Processing…");
      setTranscript(formatUtteranceDisplay(trimmed));
      setHint(null);

      const controller = new AbortController();
      const fetchTimeout = window.setTimeout(() => controller.abort(), 15_000);

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
          signal: controller.signal,
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
            confidence: "high",
            heard: trimmed,
            message: trimmed,
          });
          return;
        }

        if (data.navigateTo) {
          await runAction({
            type: "navigate",
            path: data.navigateTo,
            status: stripSkyAiMachineTags(data.reply || "On my way…"),
            confidence: "high",
            heard: trimmed,
          });
          return;
        }

        const reply = stripSkyAiMachineTags(data.reply || "").trim();
        if (reply) {
          await runAction({
            type: "reply",
            status: "Here's what I found…",
            confidence: "high",
            heard: trimmed,
            message: reply,
          });
          return;
        }

        await runAction({
          type: "chat",
          status: "Opening chat for more help…",
          confidence: "high",
          heard: trimmed,
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
      } finally {
        window.clearTimeout(fetchTimeout);
      }
    },
    [clearInactivityTimer, pathname, resumeListening, runAction]
  );

  const flushUtterance = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      clearEndOfSpeechTimers();
      lastScheduledTextRef.current = "";
      utteranceTextRef.current = "";
      onUtteranceFlushedRef.current?.();

      if (runVoiceCommandNow(trimmed)) return;

      if (!isActionableTranscript(trimmed, pathname)) {
        if (voiceModeRef.current && !pausedRef.current) {
          setPhase("listening");
          setHeadline("Listening…");
          setTranscript("");
          setHint(VOICE_MODE_ON_HINT);
          ensureListening();
        }
        return;
      }

      if (!voiceModeRef.current) {
        stopListeningRef.current?.();
      }
      void processTranscript(trimmed);
    },
    [clearEndOfSpeechTimers, ensureListening, pathname, processTranscript, runVoiceCommandNow]
  );

  const scheduleEndOfSpeech = useCallback(
    (display: string, opts?: { force?: boolean; hadFinalChunk?: boolean; quickCommand?: boolean }) => {
      const trimmed = display.trim();
      if (!trimmed) return;

      const unchanged = trimmed === lastScheduledTextRef.current;
      if (unchanged && !opts?.force && endOfSpeechTimerRef.current) {
        return;
      }

      lastScheduledTextRef.current = trimmed;
      clearEndOfSpeechTimers();

      const silenceMs = endOfSpeechDelayMs(trimmed, {
        hadFinalChunk: opts?.hadFinalChunk,
        pathname,
        quickCommand: opts?.quickCommand,
      });
      const quietStart = Date.now();

      if (silenceMs > 400) {
        const stillListeningMs = Math.min(1400, Math.max(500, silenceMs - 400));
        stillListeningTimerRef.current = window.setTimeout(() => {
          if (!utteranceTextRef.current.trim() || busyRef.current) return;
          const quietFor = Date.now() - quietStart;
          setHeadline(listeningHeadline(utteranceTextRef.current, quietFor));
        }, stillListeningMs);
      }

      const runFlush = () => {
        const latest = utteranceTextRef.current.trim();
        if (!latest || busyRef.current) return;
        lastScheduledTextRef.current = "";
        flushUtterance(latest);
      };

      if (silenceMs <= 0) {
        runFlush();
        return;
      }

      endOfSpeechTimerRef.current = window.setTimeout(runFlush, silenceMs);
    },
    [clearEndOfSpeechTimers, flushUtterance, pathname]
  );

  const handleUtteranceUpdate = useCallback(
    (display: string, meta: UtteranceUpdateMeta) => {
      if (busyRef.current) {
        abortProcessingRef.current = true;
        processGenerationRef.current += 1;
        // If we're waiting for confirmation and user says something, process it
        if (pendingConfirmationRef.current) {
          const trimmed = display.trim();
          if (trimmed) {
            busyRef.current = false; // Temporarily un-busy to let runVoiceCommandNow handle it
            abortProcessingRef.current = false;
          } else {
            return;
          }
        } else {
          return;
        }
      }

      const trimmed = display.trim();
      if (!trimmed) return;

      if (Date.now() - lastCommandAtRef.current < COMMAND_COOLDOWN_MS) return;

      const textChanged = trimmed !== utteranceTextRef.current.trim();
      utteranceTextRef.current = display;

      if (pausedRef.current) {
        setPausedState(false);
      }

      if (textChanged) bumpActivity();
      setPhase("listening");
      setHeadline(listeningHeadline(display, 0));
      setTranscript(formatUtteranceDisplay(display));
      if (voiceModeRef.current) setHint(VOICE_MODE_ON_HINT);

      if (runVoiceCommandNow(trimmed)) {
        return;
      }

      if (meta.completeUtterance) {
        flushUtterance(trimmed);
        return;
      }

      if (isListingSpeech(trimmed)) {
        if (meta.hadFinalChunk && !isIncompleteUtterance(trimmed)) {
          scheduleEndOfSpeech(display, { force: true, hadFinalChunk: true });
        } else if (textChanged || meta.hadFinalChunk) {
          scheduleEndOfSpeech(display, { hadFinalChunk: meta.hadFinalChunk });
        } else if (!endOfSpeechTimerRef.current) {
          scheduleEndOfSpeech(display, { force: true });
        }
        return;
      }

      if (meta.hadFinalChunk && !isIncompleteUtterance(trimmed)) {
        flushUtterance(trimmed);
        return;
      }

      if (isCompleteNavPhrase(trimmed, pathname)) {
        if (runVoiceCommandNow(trimmed)) return;
        scheduleEndOfSpeech(display, { force: true, quickCommand: true });
        return;
      }

      if (textChanged || meta.hadFinalChunk) {
        scheduleEndOfSpeech(display, { hadFinalChunk: meta.hadFinalChunk });
      } else if (!endOfSpeechTimerRef.current) {
        scheduleEndOfSpeech(display, { force: true });
      }
    },
    [
      bumpActivity,
      flushUtterance,
      pathname,
      runVoiceCommandNow,
      scheduleEndOfSpeech,
      setPausedState,
    ]
  );

  const voiceSupported =
    typeof window !== "undefined" &&
    (isSpeechRecognitionSupported() || typeof MediaRecorder !== "undefined");

  const { listening, startListening, stopListening, restartListening } = useVoiceInput({
    continuous: voiceMode,
    keepAlive: voiceMode,
    sessionContinuousRef: voiceModeRef,
    utteranceTextRef,
    onUtteranceFlushedRef,
    micListeningRef,
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
            void restartListeningRef.current?.();
          }
        }, 600);
      }
    },
    onStatus: (message) => {
      if (message && voiceModeRef.current && !busyRef.current) {
        if (!pendingConfirmationRef.current) {
          setPhase("listening");
          if (!utteranceTextRef.current.trim()) {
            setHeadline("Listening…");
          }
          setHint(message);
        }
      }
    },
    onActivity: () => {
      if (!busyRef.current) bumpActivity();
    },
  });

  startListeningRef.current = startListening;
  stopListeningRef.current = stopListening;
  restartListeningRef.current = restartListening;

  const enableVoiceMode = useCallback(() => {
    keepVoiceModeOn();
    setPausedState(false);
    utteranceTextRef.current = "";
    onUtteranceFlushedRef.current?.();
    clearEndOfSpeechTimers();
    setPhase("listening");
    setHeadline("Listening…");
    setTranscript("");
    setHint(VOICE_MODE_ON_HINT);
    setHeardText(null);
    setActionText(null);
    scheduleInactivityPause();
    for (const path of VOICE_PREFETCH_PATHS) {
      router.prefetch(path);
    }
    void startListening();
  }, [clearEndOfSpeechTimers, keepVoiceModeOn, router, scheduleInactivityPause, setPausedState, startListening]);

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

  useLayoutEffect(() => {
    if (!readVoiceModePersisted()) return;
    keepVoiceModeOn();
    setPausedState(false);
    setPhase("listening");
    setHeadline("Listening…");
    setHint(VOICE_MODE_ON_HINT);
    scheduleInactivityPause();
    void startListeningRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

  useEffect(() => {
    if (!voiceModeRef.current && !readVoiceModePersisted()) return;
    keepVoiceModeOn();
    clearEndOfSpeechTimers();

    let cancelled = false;
    const restart = () => {
      if (cancelled || !voiceModeRef.current || pausedRef.current) return;
      if (busyRef.current) {
        window.setTimeout(restart, 80);
        return;
      }
      void restartListeningRef.current?.();
    };

    const t = window.setTimeout(restart, navigatedByVoiceRef.current ? 60 : 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [clearEndOfSpeechTimers, keepVoiceModeOn, pathname, voiceMode]);

  // Track previous path for "go back" command
  useEffect(() => {
    previousPathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!voiceMode) return;

    const id = window.setInterval(() => {
      if (!voiceModeRef.current || pausedRef.current || busyRef.current) return;
      if (!micListeningRef.current) {
        void restartListeningRef.current?.();
      }
    }, 1_500);

    return () => window.clearInterval(id);
  }, [voiceMode]);

  useEffect(() => {
    if (!voiceMode) return;
    for (const path of VOICE_PREFETCH_PATHS) {
      router.prefetch(path);
    }
  }, [router, voiceMode]);

  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      persistVoiceMode(voiceModeRef.current);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [persistVoiceMode]);

  useEffect(
    () => () => {
      clearInactivityTimer();
      clearEndOfSpeechTimers();
    },
    [clearEndOfSpeechTimers, clearInactivityTimer]
  );

  const showCard = voiceMode || phase === "error" || phase === "confirming";
  const activePhase: AwhinaVoicePhase = !showCard
    ? "idle"
    : phase === "idle" && voiceMode
      ? paused
        ? "paused"
        : "listening"
      : phase === "confirming"
        ? "confirming"
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
    heardText,
    actionText,
  };
}
