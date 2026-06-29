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

let _cachedConfig: SpeechRecognitionConfig | null | undefined = undefined;

/**
 * Pick the best speech engine: on-device first (Brave-friendly), then cloud.
 * Results are cached so successive mic restarts skip async availability checks.
 */
export async function resolveSpeechRecognitionConfig(
  preferredLang = "en-NZ"
): Promise<SpeechRecognitionConfig | null> {
  if (_cachedConfig !== undefined) return _cachedConfig;

  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    _cachedConfig = null;
    return null;
  }

  const langs = uniqueLangs(preferredLang);
  const brave = await isBraveBrowser();
  const modes: boolean[] = brave ? [true] : [true, false];

  for (const processLocally of modes) {
    for (const lang of langs) {
      const status = await checkAvailability(Ctor, lang, processLocally);

      if (status === "available") {
        _cachedConfig = { lang, processLocally };
        return _cachedConfig;
      }

      if (processLocally && status === "downloadable") {
        const installed = await tryInstallLanguagePack(Ctor, lang);
        if (installed) {
          const after = await checkAvailability(Ctor, lang, true);
          if (after === "available") {
            _cachedConfig = { lang, processLocally: true };
            return _cachedConfig;
          }
        }
      }
    }
  }

  // Brave blocks Google cloud STT — don't fall back to remote recognition.
  if (brave) {
    _cachedConfig = null;
    return null;
  }

  // Legacy browsers without available() — prefer en-US cloud.
  _cachedConfig = { lang: langs.includes("en-US") ? "en-US" : langs[0], processLocally: false };
  return _cachedConfig;
}

export function createSpeechRecognition(
  config: SpeechRecognitionConfig,
  options?: { continuous?: boolean }
): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = options?.continuous ?? false;
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

/** Full committed + live partial text from a continuous recognition event. */
export function extractSessionTranscript(event: SpeechRecognitionEventLike): {
  committed: string;
  interim: string;
  display: string;
  hadFinalChunk: boolean;
} {
  let committed = "";
  let interim = "";
  let hadFinalChunk = false;

  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    const text = (result[0]?.transcript ?? "").trim();
    if (!text) continue;
    if (result.isFinal) {
      committed += (committed ? " " : "") + text;
      if (i >= event.resultIndex) hadFinalChunk = true;
    } else {
      interim = text;
    }
  }

  const display = [committed, interim].filter(Boolean).join(" ").trim();
  return { committed, interim, display, hadFinalChunk };
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

type RecordingController = {
  stop: () => void;
  cancel: () => void;
  finished: Promise<Blob | null>;
};

type VadOptions = {
  maxMs?: number;
  silenceMs?: number;
  /** Dynamic silence window — overrides silenceMs when provided. */
  getSilenceMs?: () => number;
  minSpeechMs?: number;
  noSpeechMs?: number;
  speechThreshold?: number;
  onSpeaking?: () => void;
  /** Fired when user is speaking (for extending patience mid-utterance). */
  onSpeechActivity?: () => void;
};

function rmsFromAnalyser(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const sample = (data[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / data.length);
}

/**
 * Record mic audio until silence is detected, stop() is called, or maxMs elapses.
 * Silence window can be dynamic via getSilenceMs (longer for listing descriptions).
 */
export function startMicrophoneRecording(options?: VadOptions): RecordingController {
  const maxMs = options?.maxMs ?? 45_000;
  const baseSilenceMs = options?.silenceMs ?? 3_600;
  const minSpeechMs = options?.minSpeechMs ?? 500;
  const noSpeechMs = options?.noSpeechMs ?? 7_000;
  const speechThreshold = options?.speechThreshold ?? 0.032;

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let monitorId = 0;
  let timeoutId = 0;
  let cancelled = false;

  let resolveFinished: (blob: Blob | null) => void = () => undefined;
  const finished = new Promise<Blob | null>((resolve) => {
    resolveFinished = resolve;
  });

  void (async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      resolveFinished(null);
      return;
    }

    const permission = await ensureMicrophonePermission();
    if (permission.ok === false) {
      resolveFinished(null);
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      resolveFinished(null);
      return;
    }

    const mimeType = pickRecorderMimeType();
    const chunks: Blob[] = [];
    let settled = false;

    const settle = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (monitorId) window.cancelAnimationFrame(monitorId);
      monitorId = 0;
      stream?.getTracks().forEach((t) => t.stop());
      void audioContext?.close().catch(() => undefined);
      stream = null;
      audioContext = null;
      resolveFinished(blob);
    };

    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      settle(null);
      return;
    }

    timeoutId = window.setTimeout(() => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      else settle(null);
    }, maxMs);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (cancelled || !chunks.length) {
        settle(null);
        return;
      }
      settle(new Blob(chunks, { type: recorder?.mimeType || mimeType || "audio/webm" }));
    };

    recorder.onerror = () => settle(null);
    recorder.start(250);

    try {
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      audioContext.createMediaStreamSource(stream).connect(analyser);

      const startedAt = Date.now();
      let heardSpeech = false;
      let speechSince = 0;
      let quietSince = 0;

      const monitor = () => {
        if (settled || cancelled) return;

        const level = rmsFromAnalyser(analyser);
        const now = Date.now();

        if (level >= speechThreshold) {
          if (!heardSpeech) {
            heardSpeech = true;
            speechSince = now;
            options?.onSpeaking?.();
          }
          quietSince = 0;
          options?.onSpeechActivity?.();
        } else if (heardSpeech) {
          if (!quietSince) quietSince = now;
          const quietFor = now - quietSince;
          const spokeFor = now - speechSince;
          const silenceMs = options?.getSilenceMs?.() ?? baseSilenceMs;
          if (quietFor >= silenceMs && spokeFor >= minSpeechMs) {
            if (recorder && recorder.state !== "inactive") recorder.stop();
            return;
          }
        } else if (now - startedAt >= noSpeechMs) {
          if (recorder && recorder.state !== "inactive") recorder.stop();
          else settle(null);
          return;
        }

        monitorId = window.requestAnimationFrame(monitor);
      };

      monitorId = window.requestAnimationFrame(monitor);
    } catch {
      /* VAD unavailable — fall back to max timeout only */
    }
  })();

  return {
    stop: () => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    },
    cancel: () => {
      cancelled = true;
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
