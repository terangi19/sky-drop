"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpeechRecognition,
  ensureMicrophonePermission,
  extractTranscript,
  isBraveBrowser,
  isSpeechRecognitionSupported,
  mapSpeechError,
  resolveSpeechRecognitionConfig,
  startMicrophoneRecording,
  transcribeAudioOnServer,
  type SpeechRecognitionLike,
} from "../lib/speech-recognition";

export type UseVoiceInputOptions = {
  onFinalTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  onStatus?: (message: string) => void;
  lang?: string;
  disabled?: boolean;
};

export function useVoiceInput({
  onFinalTranscript,
  onInterimTranscript,
  onError,
  onStatus,
  lang = "en-NZ",
  disabled = false,
}: UseVoiceInputOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingSessionRef = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const listeningRef = useRef(false);
  const recordingRef = useRef(false);
  const usedOnDeviceRef = useRef(false);
  const callbacksRef = useRef({ onFinalTranscript, onInterimTranscript, onError, onStatus });

  useEffect(() => {
    callbacksRef.current = { onFinalTranscript, onInterimTranscript, onError, onStatus };
  }, [onFinalTranscript, onInterimTranscript, onError, onStatus]);

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported() || typeof MediaRecorder !== "undefined");
    return () => {
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
    if (recordingSessionRef.current) {
      recordingSessionRef.current.cancel();
      recordingSessionRef.current = null;
      clearActive();
      return;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    if (!recordingRef.current) clearActive();
  }, [clearActive]);

  const transcribeBlob = useCallback(async (blob: Blob | null) => {
    clearActive();

    if (!blob) {
      callbacksRef.current.onError?.("Didn't catch that — try speaking again.");
      return;
    }

    callbacksRef.current.onStatus?.("Transcribing…");
    const result = await transcribeAudioOnServer(blob);
    callbacksRef.current.onStatus?.("");

    if (result.ok === false) {
      callbacksRef.current.onError?.(result.message);
      return;
    }

    callbacksRef.current.onFinalTranscript(result.text);
  }, [clearActive]);

  const beginServerRecording = useCallback(() => {
    if (recordingRef.current) return;

    recordingRef.current = true;
    listeningRef.current = true;
    setListening(true);
    callbacksRef.current.onStatus?.("Listening… speak now.");

    const session = startMicrophoneRecording({
      onSpeaking: () => callbacksRef.current.onStatus?.("Listening…"),
    });
    recordingSessionRef.current = session;

    void session.finished.then((blob) => transcribeBlob(blob));
  }, [transcribeBlob]);

  const attachRecognitionHandlers = useCallback(
    (recognition: SpeechRecognitionLike, allowServerFallback: boolean) => {
      recognition.onstart = () => {
        listeningRef.current = true;
        setListening(true);
        callbacksRef.current.onStatus?.("Listening… speak now.");
      };

      recognition.onresult = (event) => {
        const { interim, final } = extractTranscript(event);
        if (interim) callbacksRef.current.onInterimTranscript?.(interim);
        if (final) {
          callbacksRef.current.onStatus?.("");
          callbacksRef.current.onFinalTranscript(final);
        }
      };

      recognition.onerror = (event) => {
        void (async () => {
          const brave = await isBraveBrowser();
          const mapped = mapSpeechError(event.error, {
            usedOnDevice: usedOnDeviceRef.current,
            isBrave: brave,
          });

          listeningRef.current = false;
          setListening(false);
          recognitionRef.current = null;

          if (event.error === "aborted") return;

          if (event.error === "language-not-supported") {
            const retry = createSpeechRecognition({
              lang: "en-US",
              processLocally: usedOnDeviceRef.current,
            });
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
        })();
      };

      recognition.onend = () => {
        if (!recordingRef.current) clearActive();
      };
    },
    [beginServerRecording, clearActive]
  );

  const startBrowserRecognition = useCallback(async () => {
    const config = await resolveSpeechRecognitionConfig(lang);
    if (!config) return false;

    usedOnDeviceRef.current = config.processLocally;
    const recognition = createSpeechRecognition(config);
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
  }, [attachRecognitionHandlers, lang]);

  const startListening = useCallback(async () => {
    if (disabled || listeningRef.current || recordingRef.current) return;

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
  }, [beginServerRecording, disabled, startBrowserRecognition]);

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
