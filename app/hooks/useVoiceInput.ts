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
  const recordingStopRef = useRef<(() => void) | null>(null);
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
      recordingStopRef.current?.();
      recordingStopRef.current = null;
      listeningRef.current = false;
      recordingRef.current = false;
    };
  }, []);

  const clearActive = useCallback(() => {
    listeningRef.current = false;
    recordingRef.current = false;
    setListening(false);
    recognitionRef.current = null;
    recordingStopRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    if (recordingStopRef.current) {
      recordingStopRef.current();
      return;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    if (!recordingRef.current) clearActive();
  }, [clearActive]);

  const finishServerRecording = useCallback(async () => {
    const stop = recordingStopRef.current;
    if (!stop) return;

    stop();
    recordingStopRef.current = null;
    callbacksRef.current.onStatus?.("Transcribing…");
  }, []);

  const beginServerRecording = useCallback(() => {
    if (recordingRef.current) return;

    recordingRef.current = true;
    listeningRef.current = true;
    setListening(true);
    callbacksRef.current.onStatus?.("Recording… tap mic when done, then we'll transcribe.");

    const session = startMicrophoneRecording({ maxMs: 20_000 });
    recordingStopRef.current = session.stop;

    void session.finished.then(async (blob) => {
      clearActive();

      if (!blob) {
        callbacksRef.current.onError?.("No audio captured — try again or type your message.");
        return;
      }

      const result = await transcribeAudioOnServer(blob);
      callbacksRef.current.onStatus?.("");

      if (result.ok === false) {
        callbacksRef.current.onError?.(result.message);
        return;
      }

      callbacksRef.current.onFinalTranscript(result.text);
    });
  }, [clearActive]);

  const attachRecognitionHandlers = useCallback(
    (recognition: SpeechRecognitionLike, allowServerFallback: boolean) => {
      recognition.onstart = () => {
        listeningRef.current = true;
        setListening(true);
        callbacksRef.current.onStatus?.("");
      };

      recognition.onresult = (event) => {
        const { interim, final } = extractTranscript(event);
        if (interim) callbacksRef.current.onInterimTranscript?.(interim);
        if (final) callbacksRef.current.onFinalTranscript(final);
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
            callbacksRef.current.onStatus?.(
              brave
                ? "Brave blocked cloud voice — recording on your device instead. Tap mic when done."
                : "Browser voice unavailable — recording instead. Tap mic when done."
            );
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
    if (recordingRef.current && recordingStopRef.current) {
      void finishServerRecording();
      return;
    }
    if (listeningRef.current) {
      stopListening();
      return;
    }
    void startListening();
  }, [finishServerRecording, startListening, stopListening]);

  return {
    supported,
    listening,
    startListening,
    stopListening,
    toggleListening,
  };
}
