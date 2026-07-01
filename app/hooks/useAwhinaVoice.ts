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
import { isExactNavShortcut } from "../lib/local-command-engine";
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
  "/",
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
  "/list-list",
  "/notifications",
  "/profile",
  "/payments",
  "/reviews",
  "/trade-feed",
  "/wanted",
  "/opportunities",
  "/events",
  "/jobs",
  "/faqs",
];

const INACTIVITY_MS = 45_000;
const BUSY_RECOVERY_MS = 15_000;
const CONFIRMATION_TIMEOUT_MS = 30_000;
const VOICE_MODE_STORAGE_KEY = "awhina-voice-mode-on";

function readVoiceModePersisted(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(VOICE_MODE_STORAGE_KEY) === "1";
}

/** Check if a voice command is high-priority navigation — can preempt AI processing. */
function isPriorityNav(cmd: VoiceCommandAction | null): boolean {
  if (!cmd) return false;
  return (
    cmd.type === "navigate" ||
    cmd.type === "search" ||
    cmd.type === "page" ||
    cmd.type === "resume" ||
    cmd.type === "voice_off" ||
    (cmd.type === "listing" && cmd.path === "/post/ai")
  );
}
const PAUSED_HINT =
  'Voice paused. Tap the mic or say "Resume listening" to continue.';
const VOICE_MODE_ON_HINT = "Voice Mode on — speak anytime.";
const VOICE_MODE_INTRO = "🎤 Control Sky Drop with your voice.\nNavigate pages, search listings, create posts, and more—just speak naturally.";

/* Confirmation intent detection */
const CONFIRM_INTENT = /\b(yes|yeah|yep|sure|correct|that'?s right|right|go ahead|do it|okay|ok|confirm|that'?s it|exactly)\b/i;
const DENY_INTENT = /\b(no|nah|nope|cancel|never mind|forget it|not that|wrong|different|no way)\b/i;
const RESUME_INTENT = /\b(resume( listening)?|continue listening|i'?m back|keep listening|unpause)\b/i;

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
  /** Intro text for voice mode */
  intro: string | null;
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
  const [intro, setIntro] = useState<string | null>(null);

  const voiceModeRef = useRef(readVoiceModePersisted());
  const pausedRef = useRef(false);
  const busyRef = useRef(false);
  const busySinceRef = useRef(0);
  const phaseRef = useRef<AwhinaVoicePhase>("idle");
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
  const inactivityTimerRef = useRef<number | null>(null);
  const stopListeningRef = useRef<((options?: { preserveVoiceSession?: boolean }) => void) | null>(null);
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);
  const restartListeningRef = useRef<((options?: { force?: boolean }) => Promise<void>) | null>(null);
  const micListeningRef = useRef(false);
  const suppressMicAutoRestartRef = useRef(false);
  const speakingUntilRef = useRef(0);
  const pendingUtteranceRef = useRef("");
  const confirmationTimerRef = useRef<number | null>(null);
  const restartDebounceRef = useRef<number | null>(null);
  const previousPathRef = useRef<string>(pathname);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const markBusy = useCallback(() => {
    busyRef.current = true;
    busySinceRef.current = Date.now();
  }, []);

  const clearBusy = useCallback(() => {
    busyRef.current = false;
    busySinceRef.current = 0;
  }, []);

  /* ── Confirmation state for medium-confidence commands ── */
  const pendingConfirmationRef = useRef<VoiceCommandAction | null>(null);

  const clearConfirmationTimer = useCallback(() => {
    if (confirmationTimerRef.current) {
      window.clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = null;
    }
  }, []);

  const scheduleMicRestart = useCallback(() => {
    if (restartDebounceRef.current) {
      window.clearTimeout(restartDebounceRef.current);
    }
    restartDebounceRef.current = window.setTimeout(() => {
      restartDebounceRef.current = null;
      if (!voiceModeRef.current || pausedRef.current || busyRef.current) return;
      suppressMicAutoRestartRef.current = true;
      const restart = restartListeningRef.current?.({ force: true });
      if (restart && typeof restart.finally === "function") {
        void restart.finally(() => {
          window.setTimeout(() => {
            suppressMicAutoRestartRef.current = false;
          }, 250);
        });
      } else {
        window.setTimeout(() => {
          suppressMicAutoRestartRef.current = false;
        }, 250);
      }
    }, 150);
  }, []);

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
    setIntro(null);
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
    clearBusy();
    abortProcessingRef.current = false;
    clearConfirmationTimer();
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

    const queued = pendingUtteranceRef.current.trim();
    pendingUtteranceRef.current = "";
    
    // Force mic restart with multiple fallback attempts
    const attemptMicRestart = (attempt = 0) => {
      if (!voiceModeRef.current || pausedRef.current) return;
      if (attempt >= 3) {
        console.warn("[voice] Mic restart failed after 3 attempts");
        setHint("Tap the mic to resume listening.");
        setPhase("paused");
        setHeadline("Voice paused");
        setPausedState(true);
        return;
      }
      
      const restart = restartListeningRef.current?.({ force: true });
      if (restart) {
        restart.finally(() => {
          // Verify mic is actually listening after restart
          window.setTimeout(() => {
            if (!micListeningRef.current && voiceModeRef.current && !pausedRef.current) {
              console.warn(`[voice] Mic not listening after restart, retrying (attempt ${attempt + 1})`);
              window.setTimeout(() => attemptMicRestart(attempt + 1), 200);
            }
          }, 300);
        });
      } else {
        window.setTimeout(() => attemptMicRestart(attempt + 1), 200);
      }
    };
    
    window.setTimeout(() => attemptMicRestart(0), 100);
    
    if (queued) {
      window.setTimeout(() => flushUtteranceRef.current?.(queued), 120);
    }
  }, [clearBusy, clearConfirmationTimer, keepVoiceModeOn, scheduleInactivityPause, setPausedState]);

  const startConfirmationTimer = useCallback(() => {
    clearConfirmationTimer();
    confirmationTimerRef.current = window.setTimeout(() => {
      pendingConfirmationRef.current = null;
      setHint("Confirmation timed out — try your command again.");
      afterCommandCycle();
    }, CONFIRMATION_TIMEOUT_MS);
  }, [afterCommandCycle, clearConfirmationTimer]);

  const flushUtteranceRef = useRef<((text: string) => void) | null>(null);

  const ensureListening = useCallback(() => {
    if (!voiceModeRef.current || pausedRef.current || busyRef.current) return;
    scheduleMicRestart();
  }, [scheduleMicRestart]);

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
    clearConfirmationTimer();
    if (restartDebounceRef.current) {
      window.clearTimeout(restartDebounceRef.current);
      restartDebounceRef.current = null;
    }
    clearBusy();
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
  }, [clearConfirmationTimer, clearEndOfSpeechTimers, clearInactivityTimer, persistVoiceMode, setPausedState]);

  const runAction = useCallback(
    async (action: VoiceCommandAction) => {
      keepVoiceModeOn();
      if (action.type === "resume") {
        resumeListening();
        clearBusy();
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
          clearBusy();
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
        speakingUntilRef.current = Date.now() + 2000;
        clearBusy();
        window.setTimeout(() => afterCommandCycle(), 1800);
        return;
      }

      afterCommandCycle();
    },
    [afterCommandCycle, clearBusy, disableVoiceMode, keepVoiceModeOn, resumeListening, router]
  );

  const runVoiceCommandNow = useCallback(
    (trimmed: string): boolean => {
      if (busyRef.current) return false;

      // Check if user is responding to a confirmation prompt
      const pending = pendingConfirmationRef.current;
      if (pending) {
        if (CONFIRM_INTENT.test(trimmed)) {
          pendingConfirmationRef.current = null;
          clearConfirmationTimer();
          markBusy();
          void runAction(pending);
          return true;
        }
        if (DENY_INTENT.test(trimmed)) {
          pendingConfirmationRef.current = null;
          clearConfirmationTimer();
          setHint(`Cancelled. Try saying "go to ${pending.targetTitle}".`);
          afterCommandCycle();
          return true;
        }
        // Check if user repeated the original command (implicit confirmation)
        const targetNorm = pending.heard?.toLowerCase().replace(/[^a-z0-9]/g, "");
        const saidNorm = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (targetNorm && (saidNorm === targetNorm || saidNorm.includes(targetNorm) || targetNorm.includes(saidNorm))) {
          pendingConfirmationRef.current = null;
          markBusy();
          void runAction(pending);
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
        void restartListeningRef.current?.({ force: true });
        startConfirmationTimer();
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
        clearBusy();
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
        void runAction(cmd);
        return true;
      }

      if (cmd.type === "page") {
        markBusy();
        lastInstantExecRef.current = execKey;
        lastInstantAtRef.current = now;
        if (cmd.heard && cmd.targetTitle) {
          setHeardText(cmd.heard);
          setActionText(cmd.targetTitle);
        } else if (cmd.heard) {
          setHeardText(cmd.heard);
        }
        showToast(cmd.status || "Opening…", "info");
        const result = cmd.run!();
        if (!result.ok) {
          clearBusy();
          setHint("Couldn't do that on this page — try another command.");
          afterCommandCycle();
          return true;
        }
        if (result.path && !result.path.startsWith("#")) {
          navigatedByVoiceRef.current = true;
          router.push(result.path);
        }
        afterCommandCycle();
        return true;
      }

      if (cmd.type === "navigate" || cmd.type === "search" || cmd.type === "listing") {
        markBusy();
        lastInstantExecRef.current = execKey;
        lastInstantAtRef.current = now;
        if (cmd.heard && cmd.targetTitle) {
          setHeardText(cmd.heard);
          setActionText(cmd.targetTitle);
        } else if (cmd.heard) {
          setHeardText(cmd.heard);
        }
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
      clearConfirmationTimer,
      disableVoiceMode,
      keepVoiceModeOn,
      markBusy,
      clearBusy,
      pathname,
      resumeListening,
      router,
      runAction,
      startConfirmationTimer,
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
        local?.type === "page" ||
        (local?.type === "listing" && local.path === "/post/ai");

      markBusy();

      if (!isInstant && local?.confidence === "high") {
        setPhase("processing");
        setHeadline("Processing…");
        setTranscript(formatUtteranceDisplay(trimmed));
        setHint(null);
      }

      const abortIfSuperseded = () =>
        abortProcessingRef.current || generation !== processGenerationRef.current;

      try {
        if (local) {
          if (abortIfSuperseded()) {
            clearBusy();
            scheduleMicRestart();
            return;
          }
          await runAction(local);
          return;
        }

        setPhase("processing");
        setHeadline("Asking Āwhina…");
        setTranscript(formatUtteranceDisplay(trimmed));
        setHint("One moment…");

        if (abortIfSuperseded()) {
          clearBusy();
          scheduleMicRestart();
          return;
        }

        const controller = new AbortController();
        const fetchTimeout = window.setTimeout(() => controller.abort(), 8_000);

        try {
          const token = await getFreshIdToken();
          if (abortIfSuperseded()) {
            clearBusy();
            scheduleMicRestart();
            return;
          }
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
            clearBusy();
            scheduleMicRestart();
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
            clearBusy();
            scheduleMicRestart();
            return;
          }
          setPhase("error");
          setHeadline("Voice unavailable");
          setHint(
            err instanceof Error
              ? err.message
              : `Try typing in ${AWHINA_NAME} chat instead.`
          );
          clearBusy();
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
      } catch {
        if (abortIfSuperseded()) {
          clearBusy();
          scheduleMicRestart();
        } else {
          clearBusy();
          afterCommandCycle();
        }
      }
    },
    [afterCommandCycle, clearBusy, clearInactivityTimer, markBusy, pathname, resumeListening, runAction, scheduleMicRestart]
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

  useEffect(() => {
    flushUtteranceRef.current = flushUtterance;
  }, [flushUtterance]);

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
        const stillListeningMs = Math.max(200, silenceMs - 300);
        stillListeningTimerRef.current = window.setTimeout(() => {
          if (!utteranceTextRef.current.trim() || busyRef.current) return;
          const quietFor = Date.now() - quietStart;
          setHeadline(listeningHeadline(utteranceTextRef.current, quietFor));
        }, stillListeningMs);
      }

      const runFlush = () => {
        const latest = utteranceTextRef.current.trim();
        if (!latest) return;
        if (busyRef.current) {
          pendingUtteranceRef.current = latest;
          endOfSpeechTimerRef.current = window.setTimeout(runFlush, 350);
          return;
        }
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
      const trimmed = display.trim();

      // Check if this is a priority navigation command that can preempt AI processing
      if (busyRef.current && trimmed) {
        const navCmd = resolveVoiceCommand(trimmed, pathname);
        if (isPriorityNav(navCmd)) {
          abortProcessingRef.current = true;
          processGenerationRef.current += 1;
          clearBusy();
          clearEndOfSpeechTimers();
          clearInactivityTimer();
          setPhase("listening");
          setHeadline("Listening…");
          // Fall through to handle this nav command immediately
          if (runVoiceCommandNow(trimmed)) return;
        } else if (pendingConfirmationRef.current) {
          abortProcessingRef.current = true;
          processGenerationRef.current += 1;
          clearBusy();
          abortProcessingRef.current = false;
        } else {
          pendingUtteranceRef.current = trimmed;
          setHint("Still working on that — I'll handle your next command right after.");
          return;
        }
      }

      if (!trimmed) return;

      if (pausedRef.current) {
        const pausedCmd = resolveVoiceCommand(trimmed, pathname);
        if (
          RESUME_INTENT.test(trimmed) ||
          pausedCmd?.type === "resume" ||
          pausedCmd?.type === "voice_off"
        ) {
          setPausedState(false);
        } else {
          return;
        }
      }

      const textChanged = trimmed !== utteranceTextRef.current.trim();
      utteranceTextRef.current = display;

      if (textChanged) bumpActivity();
      setPhase("listening");
      setHeadline(listeningHeadline(display, 0));
      setTranscript(formatUtteranceDisplay(display));
      if (voiceModeRef.current) setHint(VOICE_MODE_ON_HINT);

      // Exact shortcuts ("sell", "home") run instantly — even on interim STT.
      // Other navigation waits for a final chunk to avoid partial matches.
      if (isExactNavShortcut(trimmed) || meta.hadFinalChunk) {
        if (runVoiceCommandNow(trimmed)) return;
      } else {
        const urgent = resolveVoiceCommand(trimmed, pathname);
        if (urgent && (urgent.type === "voice_off" || urgent.type === "resume")) {
          if (runVoiceCommandNow(trimmed)) return;
        }
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
        if (meta.hadFinalChunk && runVoiceCommandNow(trimmed)) return;
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
    suppressAutoRestartRef: suppressMicAutoRestartRef,
    onUtteranceUpdate: handleUtteranceUpdate,
    onError: (message) => {
      if (!voiceModeRef.current) {
        clearBusy();
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
            scheduleMicRestart();
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
    setIntro(VOICE_MODE_INTRO);
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

    let cancel = false;
    let attempts = 0;
    const maxAttempts = 4;
    const tryStart = () => {
      if (cancel || !voiceModeRef.current || attempts >= maxAttempts) {
        if (attempts >= maxAttempts && !cancel) {
          setHint("Tap the mic to resume.");
          setPhase("paused");
          setHeadline("Voice paused");
          setPausedState(true);
        }
        return;
      }
      attempts++;
      try {
        const p = startListeningRef.current?.();
        if (p) {
          p.catch(() => {
            if (!cancel && voiceModeRef.current) {
              window.setTimeout(tryStart, 250);
            }
          });
        } else {
          window.setTimeout(tryStart, 100);
        }
      } catch {
        if (!cancel && voiceModeRef.current) {
          window.setTimeout(tryStart, 250);
        }
      }
    };

    // Wait briefly for startListeningRef to be assigned, then try
    const ready = () => {
      if (startListeningRef.current) tryStart();
      else window.setTimeout(ready, 50);
    };
    ready();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

  useEffect(() => {
    if (!voiceModeRef.current && !readVoiceModePersisted()) return;
    keepVoiceModeOn();
    clearEndOfSpeechTimers();

    if (navigatedByVoiceRef.current) {
      navigatedByVoiceRef.current = false;
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled || !voiceModeRef.current || pausedRef.current || busyRef.current) return;
      scheduleMicRestart();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [clearEndOfSpeechTimers, keepVoiceModeOn, pathname, scheduleMicRestart, voiceMode]);

  // Track previous path for "go back" command
  useEffect(() => {
    previousPathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!voiceMode) return;

    const id = window.setInterval(() => {
      if (!voiceModeRef.current || pausedRef.current) return;

      if (
        busyRef.current &&
        busySinceRef.current > 0 &&
        Date.now() - busySinceRef.current > BUSY_RECOVERY_MS
      ) {
        afterCommandCycle();
        return;
      }

      if (!busyRef.current && phaseRef.current === "processing") {
        setPhase("listening");
        setHeadline("Listening…");
        setHint(VOICE_MODE_ON_HINT);
        scheduleMicRestart();
        return;
      }

      if (!busyRef.current && !micListeningRef.current) {
        scheduleMicRestart();
      }
    }, 1_500);

    return () => window.clearInterval(id);
  }, [afterCommandCycle, scheduleMicRestart, voiceMode]);

  useEffect(() => {
    if (!voiceMode) return;
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        voiceModeRef.current &&
        !pausedRef.current &&
        !busyRef.current
      ) {
        scheduleMicRestart();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [scheduleMicRestart, voiceMode]);

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
      (listening ||
        phase === "listening" ||
        phase === "processing" ||
        phase === "confirming" ||
        phase === "speaking"),
    headline,
    transcript,
    hint,
    toggle,
    cancel,
    resume,
    heardText,
    actionText,
    intro,
  };
}
