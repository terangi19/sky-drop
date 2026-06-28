/**
 * Browser Web Speech API helpers for Āwhina voice input.
 * Uses the free built-in SpeechRecognition (Chrome, Edge, Brave, Safari).
 */

export type SpeechRecognitionErrorCode =
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "aborted"
  | "service-not-available"
  | "bad-grammar"
  | "language-not-supported"
  | "unknown";

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

/** True when the browser exposes SpeechRecognition (client-only). */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = "en-NZ";
  return recognition;
}

/**
 * Request microphone permission explicitly before SpeechRecognition.
 * Site-wide Permissions-Policy must allow microphone=(self) — see next.config.ts.
 */
export async function ensureMicrophonePermission(): Promise<
  { ok: true } | { ok: false; code: SpeechRecognitionErrorCode; message: string }
> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      code: "service-not-available",
      message: "Microphone is not available in this browser.",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        ok: false,
        code: "not-allowed",
        message:
          "Microphone blocked. Allow mic for Sky Drop in your browser (site settings). In Brave: click the lock icon → allow microphone, or lower Shields for this site.",
      };
    }
    if (name === "NotFoundError") {
      return {
        ok: false,
        code: "audio-capture",
        message: "No microphone found. Plug one in or check system settings.",
      };
    }
    return {
      ok: false,
      code: "unknown",
      message: "Could not access the microphone.",
    };
  }
}

export function mapSpeechError(error: string): { code: SpeechRecognitionErrorCode; message: string } {
  switch (error) {
    case "not-allowed":
      return {
        code: "not-allowed",
        message:
          "Microphone blocked. Allow mic for Sky Drop in browser settings. In Brave: lock icon → microphone, or lower Shields.",
      };
    case "no-speech":
      return { code: "no-speech", message: "Didn't catch that — try speaking again." };
    case "audio-capture":
      return { code: "audio-capture", message: "Microphone unavailable. Check device and permissions." };
    case "network":
      return {
        code: "network",
        message: "Voice recognition needs an internet connection (browser speech service).",
      };
    case "aborted":
      return { code: "aborted", message: "" };
    case "service-not-available":
      return {
        code: "service-not-available",
        message: "Voice input isn't supported in this browser. Try Chrome, Edge, or Brave with Shields down.",
      };
    case "language-not-supported":
      return { code: "language-not-supported", message: "English (NZ) voice isn't supported here — try typing instead." };
    default:
      return { code: "unknown", message: "Voice input failed — try typing instead." };
  }
}

export function extractTranscript(event: SpeechRecognitionEventLike): {
  interim: string;
  final: string;
} {
  let interim = "";
  let final = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const text = (result[0]?.transcript ?? "").trim();
    if (!text) continue;
    if (result.isFinal) final += (final ? " " : "") + text;
    else interim += (interim ? " " : "") + text;
  }
  return { interim, final };
}
