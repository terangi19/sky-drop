/**
 * Browser Web Speech API helpers for Āwhina voice input.
 * Prefers on-device recognition (works when Brave blocks Google cloud STT).
 * Falls back to server Whisper transcription when browser STT fails.
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
  processLocally?: boolean;
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

type SpeechAvailabilityStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

type SpeechRecognitionStatic = SpeechRecognitionCtor & {
  available?: (options: {
    langs: string[];
    processLocally?: boolean;
  }) => Promise<SpeechAvailabilityStatus>;
  install?: (options: {
    langs: string[];
    processLocally?: boolean;
  }) => Promise<boolean>;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionStatic;
    webkitSpeechRecognition?: SpeechRecognitionStatic;
  }
}

export type SpeechRecognitionConfig = {
  lang: string;
  processLocally: boolean;
};

const LANGUAGE_CANDIDATES = ["en-NZ", "en-US", "en-GB"] as const;

/** True when the browser exposes SpeechRecognition (client-only). */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function getSpeechRecognitionCtor(): SpeechRecognitionStatic | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export async function isBraveBrowser(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
  if (!brave?.isBrave) return false;
  try {
    return await brave.isBrave();
  } catch {
    return false;
  }
}

function uniqueLangs(preferred: string): string[] {
  const langs = [preferred, ...LANGUAGE_CANDIDATES].filter(
    (lang, index, all) => lang && all.indexOf(lang) === index
  );
  return langs;
}

async function checkAvailability(
  Ctor: SpeechRecognitionStatic,
  lang: string,
  processLocally: boolean
): Promise<SpeechAvailabilityStatus | null> {
  if (typeof Ctor.available !== "function") return null;
  try {
    return await Ctor.available({ langs: [lang], processLocally });
  } catch {
    return null;
  }
}

async function tryInstallLanguagePack(
  Ctor: SpeechRecognitionStatic,
  lang: string
): Promise<boolean> {
  if (typeof Ctor.install !== "function") return false;
  try {
    return await Ctor.install({ langs: [lang], processLocally: true });
  } catch {
    return false;
  }
}

/**
 * Pick the best speech engine: on-device first (Brave-friendly), then cloud.
 */
export async function resolveSpeechRecognitionConfig(
  preferredLang = "en-NZ"
): Promise<SpeechRecognitionConfig | null> {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const langs = uniqueLangs(preferredLang);
  const brave = await isBraveBrowser();
  const modes: boolean[] = brave ? [true] : [true, false];

  for (const processLocally of modes) {
    for (const lang of langs) {
      const status = await checkAvailability(Ctor, lang, processLocally);

      if (status === "available") {
        return { lang, processLocally };
      }

      if (processLocally && status === "downloadable") {
        const installed = await tryInstallLanguagePack(Ctor, lang);
        if (installed) {
          const after = await checkAvailability(Ctor, lang, true);
          if (after === "available") return { lang, processLocally: true };
        }
      }
    }
  }

  // Brave blocks Google cloud STT — don't fall back to remote recognition.
  if (brave) return null;

  // Legacy browsers without available() — prefer en-US cloud.
  return { lang: langs.includes("en-US") ? "en-US" : langs[0], processLocally: false };
}

export function createSpeechRecognition(config: SpeechRecognitionConfig): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = config.lang;
  if (config.processLocally) {
    recognition.processLocally = true;
  }
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

export function mapSpeechError(
  error: string,
  options?: { usedOnDevice?: boolean; isBrave?: boolean }
): { code: SpeechRecognitionErrorCode; message: string; retryWithServer?: boolean } {
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
        message: options?.isBrave
          ? "Brave blocked cloud voice recognition. Retrying with on-device transcription…"
          : options?.usedOnDevice
            ? "On-device voice failed. Retrying via server…"
            : "Cloud voice blocked — retrying on-device or server transcription…",
        retryWithServer: true,
      };
    case "aborted":
      return { code: "aborted", message: "" };
    case "service-not-available":
      return {
        code: "service-not-available",
        message: "Browser voice service unavailable. Retrying via server transcription…",
        retryWithServer: true,
      };
    case "language-not-supported":
      return {
        code: "language-not-supported",
        message: "Voice language not supported here — retrying with English (US)…",
      };
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

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

type RecordingController = {
  stop: () => void;
  finished: Promise<Blob | null>;
};

/** Record mic audio until stop() is called or maxMs elapses. */
export function startMicrophoneRecording(options?: {
  maxMs?: number;
}): RecordingController {
  const maxMs = options?.maxMs ?? 20_000;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let timeoutId = 0;

  const finished = new Promise<Blob | null>((resolve) => {
    void (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        resolve(null);
        return;
      }

      const permission = await ensureMicrophonePermission();
      if (permission.ok === false) {
        resolve(null);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        resolve(null);
        return;
      }

      const mimeType = pickRecorderMimeType();
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        resolve(null);
        return;
      }

      const chunks: Blob[] = [];
      let settled = false;

      const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        stream?.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };

      timeoutId = window.setTimeout(() => {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      }, maxMs);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (!chunks.length) {
          finish(null);
          return;
        }
        finish(new Blob(chunks, { type: recorder?.mimeType || mimeType || "audio/webm" }));
      };

      recorder.onerror = () => finish(null);
      recorder.start();
    })();
  });

  return {
    stop: () => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    },
    finished,
  };
}

export async function transcribeAudioOnServer(blob: Blob): Promise<
  { ok: true; text: string } | { ok: false; message: string }
> {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", blob, `voice.${ext}`);

  try {
    const res = await fetch("/api/sky-ai/transcribe", { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok) {
      return {
        ok: false,
        message: data.error || "Voice transcription failed — try typing your message.",
      };
    }
    const text = (data.text || "").trim();
    if (!text) {
      return { ok: false, message: "Didn't catch that — try speaking again." };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, message: "Couldn't reach voice transcription — check your connection." };
  }
}
