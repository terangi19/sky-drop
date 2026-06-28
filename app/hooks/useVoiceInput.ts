"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpeechRecognition,
  ensureMicrophonePermission,
  extractTranscript,
  isSpeechRecognitionSupported,
  mapSpeechError,
  type SpeechRecognitionLike,
} from "../lib/speech-recognition";

export type UseVoiceInputOptions = {
  /** Called with the final transcript when the user finishes speaking. */
  onFinalTranscript: (text: string) => void;
  /** Live partial text while the user is still speaking. */
  onInterimTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  /** BCP-47 language tag */
  lang?: string;
  disabled?: boolean;
};

export function useVoiceInput({
  onFinalTranscript,
  onInterimTranscript,
  onError,
  lang = "en-NZ",
  disabled = false,
}: UseVoiceInputOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const callbacksRef = useRef({ onFinalTranscript, onInterimTranscript, onError });

  useEffect(() => {
    callbacksRef.current = { onFinalTranscript, onInterimTranscript, onError };
  }, [onFinalTranscript, onInterimTranscript, onError]);

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      listeningRef.current = false;
    };
  }, []);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const startListening = useCallback(async () => {
    if (disabled || listeningRef.current) return;
    if (!isSpeechRecognitionSupported()) {
      callbacksRef.current.onError?.(
        "Voice input isn't supported in this browser. Try Chrome, Edge, or Safari — or type your message."
      );
      return;
    }

    const permission = await ensureMicrophonePermission();
    if (!permission.ok) {
      callbacksRef.current.onError?.(permission.message);
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) {
      callbacksRef.current.onError?.("Voice input isn't available in this browser.");
      return;
    }

    recognition.lang = lang;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      listeningRef.current = true;
      setListening(true);
    };

    recognition.onresult = (event) => {
      const { interim, final } = extractTranscript(event);
      if (interim) callbacksRef.current.onInterimTranscript?.(interim);
      if (final) callbacksRef.current.onFinalTranscript(final);
    };

    recognition.onerror = (event) => {
      const mapped = mapSpeechError(event.error);
      if (mapped.message) callbacksRef.current.onError?.(mapped.message);
      listeningRef.current = false;
      setListening(false);
    };

    recognition.onend = () => {
      listeningRef.current = false;
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      listeningRef.current = false;
      setListening(false);
      callbacksRef.current.onError?.("Could not start voice input — try again.");
    }
  }, [disabled, lang]);

  const toggleListening = useCallback(() => {
    if (listeningRef.current) stopListening();
    else void startListening();
  }, [startListening, stopListening]);

  return {
    supported,
    listening,
    startListening,
    stopListening,
    toggleListening,
  };
}
