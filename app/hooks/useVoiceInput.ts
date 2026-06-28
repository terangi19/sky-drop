"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  createSpeechRecognition,
  ensureMicrophonePermission,
  isBraveBrowser,
  isSpeechRecognitionSupported,
  mapSpeechError,
  resolveSpeechRecognitionConfig,
  startMicrophoneRecording,
  transcribeAudioOnServer,
  type SpeechRecognitionLike,
} from "../lib/speech-recognition";
import { silenceMsForText as getSilenceMs } from "../lib/awhina-voice-end-of-speech";

export type UtteranceUpdateMeta = {
  hadFinalChunk: boolean;
  /** Server-side recording finished — no extra silence wait needed. */
  completeUtterance?: boolean;
};

export type UseVoiceInputOptions = {
  /** Legacy — prefer onUtteranceUpdate with end-of-speech scheduling in parent. */
  onFinalTranscript?: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  /** Full display text (committed + interim) as the user speaks. */
  onUtteranceUpdate?: (display: string, meta: UtteranceUpdateMeta) => void;
  onError?: (message: string) => void;
  onStatus?: (message: string) => void;
  onActivity?: () => void;
  lang?: string;
  disabled?: boolean;
  sessionContinuousRef?: MutableRefObject<boolean>;
  /** Mirrors live utterance for server-side VAD timing. */
  utteranceTextRef?: MutableRefObject<string>;
  /** Called after parent flushes an utterance so browser STT buffer resets. */
  onUtteranceFlushedRef?: MutableRefObject<(() => void) | null>;
  continuous?: boolean;
  keepAlive?: boolean;
};

export function useVoiceInput({
  onFinalTranscript,
  onInterimTranscript,
  onUtteranceUpdate,
  onError,
  onStatus,
  onActivity,
  lang = "en-NZ",
  disabled = false,
  sessionContinuousRef,
  utteranceTextRef,
  onUtteranceFlushedRef,
  continuous = false,
  keepAlive = false,
}: UseVoiceInputOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingSessionRef = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const listeningRef = useRef(false);
  const recordingRef = useRef(false);
  const usedOnDeviceRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const keepAliveRef = useRef(keepAlive);
  const continuousRef = useRef(continuous);
  const sessionBufferRef = useRef("");
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);
  const callbacksRef = useRef({
    onFinalTranscript,
    onInterimTranscript,
    onUtteranceUpdate,
    onError,
    onStatus,
    onActivity,
  });

  useEffect(() => {
    keepAliveRef.current = keepAlive;
  }, [keepAlive]);

  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);

  const clearSessionBuffer = useCallback(() => {
    sessionBufferRef.current = "";
    if (utteranceTextRef) utteranceTextRef.current = "";
  }, [utteranceTextRef]);

  useEffect(() => {
    if (onUtteranceFlushedRef) {
      onUtteranceFlushedRef.current = clearSessionBuffer;
      return () => {
        onUtteranceFlushedRef.current = null;
      };
    }
  }, [clearSessionBuffer, onUtteranceFlushedRef]);

  useEffect(() => {
    callbacksRef.current = {
      onFinalTranscript,
      onInterimTranscript,
      onUtteranceUpdate,
      onError,
      onStatus,
      onActivity,
    };
  }, [onFinalTranscript, onInterimTranscript, onUtteranceUpdate, onError, onStatus, onActivity]);

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported() || typeof MediaRecorder !== "undefined");
    return () => {
      intentionalStopRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      recordingSessionRef.current?.cancel();
      recordingSessionRef.current = null;
      listeningRef.current = false;
      recordingRef.current = false;
    };
  }, []);

  const clearActive = useCallback(() => {
    listeningRef.current = false;
    recordingRef.current = false;
    setListening(false);
    recognitionRef.current = null;
    recordingSessionRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    intentionalStopRef.current = true;
    if (recordingSessionRef.current) {
      recordingSessionRef.current.cancel();
      recordingSessionRef.current = null;
      clearActive();
      return;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* already stopped */
      }
    }
    clearActive();
  }, [clearActive]);

  const emitUtterance = useCallback(
    (display: string, hadFinalChunk: boolean, meta?: Partial<UtteranceUpdateMeta>) => {
      if (utteranceTextRef) utteranceTextRef.current = display;
      const payload: UtteranceUpdateMeta = {
        hadFinalChunk,
        completeUtterance: meta?.completeUtterance,
      };
      if (display) {
        callbacksRef.current.onUtteranceUpdate?.(display, payload);
      }
      if (!display) return;
      if (!hadFinalChunk) {
        callbacksRef.current.onInterimTranscript?.(display);
      }
      if (!callbacksRef.current.onUtteranceUpdate && hadFinalChunk) {
        callbacksRef.current.onFinalTranscript?.(display);
      }
    },
    [utteranceTextRef]
  );

  const transcribeBlob = useCallback(
    async (blob: Blob | null) => {
      clearActive();

      if (!blob) {
        if (!keepAliveRef.current) {
          callbacksRef.current.onError?.("Didn't catch that — try speaking again.");
        } else {
          void startListeningRef.current?.();
        }
        return;
      }

      callbacksRef.current.onStatus?.("Transcribing…");
      const result = await transcribeAudioOnServer(blob);
      callbacksRef.current.onStatus?.("");

      if (result.ok === false) {
        callbacksRef.current.onError?.(result.message);
        return;
      }

      emitUtterance(result.text, true, { completeUtterance: true });

      if (keepAliveRef.current && !intentionalStopRef.current) {
        window.setTimeout(() => {
          if (!intentionalStopRef.current) void startListeningRef.current?.();
        }, 400);
      }
    },
    [clearActive, emitUtterance]
  );

  const beginServerRecording = useCallback(() => {
    if (recordingRef.current || intentionalStopRef.current) return;

    recordingRef.current = true;
    listeningRef.current = true;
    setListening(true);
    if (utteranceTextRef) utteranceTextRef.current = "";
    sessionBufferRef.current = "";
    callbacksRef.current.onStatus?.("Listening…");

    const sessionContinuous = sessionContinuousRef?.current ?? keepAliveRef.current;
    const session = startMicrophoneRecording({
      maxMs: sessionContinuous ? 60_000 : 30_000,
      getSilenceMs: () => getSilenceMs(utteranceTextRef?.current ?? ""),
      onSpeaking: () => {
        callbacksRef.current.onActivity?.();
        callbacksRef.current.onStatus?.("Listening…");
      },
      onSpeechActivity: () => {
        callbacksRef.current.onActivity?.();
        const preview = utteranceTextRef?.current ?? "";
        if (preview) emitUtterance(preview, false);
      },
    });
    recordingSessionRef.current = session;

    void session.finished.then((blob) => transcribeBlob(blob));
  }, [emitUtterance, sessionContinuousRef, transcribeBlob, utteranceTextRef]);

  const attachRecognitionHandlers = useCallback(
    (recognition: SpeechRecognitionLike, allowServerFallback: boolean) => {
      recognition.onstart = () => {
        listeningRef.current = true;
        intentionalStopRef.current = false;
        setListening(true);
        if (!continuousRef.current && !keepAliveRef.current) {
          clearSessionBuffer();
        }
        callbacksRef.current.onStatus?.("Listening…");
      };

      recognition.onresult = (event) => {
        let hadFinalChunk = false;
        let interim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = (result[0]?.transcript ?? "").trim();
          if (!text) continue;
          if (result.isFinal) {
            sessionBufferRef.current += (sessionBufferRef.current ? " " : "") + text;
            hadFinalChunk = true;
          } else {
            interim = text;
          }
        }

        const display = [sessionBufferRef.current, interim].filter(Boolean).join(" ").trim();
        if (!display) return;

        callbacksRef.current.onActivity?.();
        emitUtterance(display, hadFinalChunk);
      };

      recognition.onerror = (event) => {
        void (async () => {
          if (event.error === "aborted") return;

          const brave = await isBraveBrowser();
          const mapped = mapSpeechError(event.error, {
            usedOnDevice: usedOnDeviceRef.current,
            isBrave: brave,
          });

          listeningRef.current = false;
          setListening(false);
          recognitionRef.current = null;

          if (event.error === "no-speech" && keepAliveRef.current) {
            void startListeningRef.current?.();
            return;
          }

          if (event.error === "language-not-supported") {
            const retry = createSpeechRecognition(
              { lang: "en-US", processLocally: usedOnDeviceRef.current },
              { continuous: continuousRef.current }
            );
            if (retry) {
              recognitionRef.current = retry;
              attachRecognitionHandlers(retry, false);
              try {
                retry.start();
                return;
              } catch {
                /* fall through */
              }
            }
          }

          if (allowServerFallback && mapped.retryWithServer) {
            beginServerRecording();
            return;
          }

          if (mapped.message) callbacksRef.current.onError?.(mapped.message);

          if (keepAliveRef.current && !intentionalStopRef.current && event.error === "network") {
            window.setTimeout(() => void startListeningRef.current?.(), 600);
          }
        })();
      };

      recognition.onend = () => {
        if (recordingRef.current) return;
        const shouldRestart =
          keepAliveRef.current && !intentionalStopRef.current && listeningRef.current;
        clearActive();
        if (shouldRestart) {
          window.setTimeout(() => {
            if (!intentionalStopRef.current) void startListeningRef.current?.();
          }, 250);
        }
      };
    },
    [beginServerRecording, clearActive, clearSessionBuffer, emitUtterance, utteranceTextRef]
  );

  const startBrowserRecognition = useCallback(async () => {
    const config = await resolveSpeechRecognitionConfig(lang);
    if (!config) return false;

    const sessionContinuous = sessionContinuousRef?.current ?? continuousRef.current;
    keepAliveRef.current = sessionContinuous;
    continuousRef.current = sessionContinuous;

    usedOnDeviceRef.current = config.processLocally;
    const recognition = createSpeechRecognition(config, { continuous: sessionContinuous });
    if (!recognition) return false;

    recognitionRef.current = recognition;
    attachRecognitionHandlers(recognition, true);

    try {
      recognition.start();
      return true;
    } catch {
      recognitionRef.current = null;
      return false;
    }
  }, [attachRecognitionHandlers, lang, sessionContinuousRef]);

  const startListening = useCallback(async () => {
    if (disabled || listeningRef.current || recordingRef.current) return;
    intentionalStopRef.current = false;

    const sessionContinuous = sessionContinuousRef?.current ?? continuousRef.current;
    keepAliveRef.current = sessionContinuous || keepAliveRef.current;
    continuousRef.current = sessionContinuous;

    const permission = await ensureMicrophonePermission();
    if (permission.ok === false) {
      callbacksRef.current.onError?.(permission.message);
      return;
    }

    if (isSpeechRecognitionSupported()) {
      const started = await startBrowserRecognition();
      if (started) return;
    }

    beginServerRecording();
  }, [beginServerRecording, disabled, sessionContinuousRef, startBrowserRecognition]);

  startListeningRef.current = startListening;

  const toggleListening = useCallback(() => {
    if (listeningRef.current || recordingRef.current) {
      stopListening();
      return;
    }
    void startListening();
  }, [startListening, stopListening]);

  return {
    supported,
    listening,
    startListening,
    stopListening,
    toggleListening,
  };
}
