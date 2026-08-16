"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  /** Remaining slots in the listing (max 8 total). */
  maxCaptures?: number;
  onClose: () => void;
  /** Same ingest path as Choose Photos — File[] into existing upload handler. */
  onCapture: (files: File[]) => void;
};

type Facing = "environment" | "user";

function stopStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

function isCameraSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

async function hasMultipleCameras(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput").length > 1;
  } catch {
    return false;
  }
}

async function captureFrameToFile(video: HTMLVideoElement): Promise<File | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
  });
  if (!blob) return null;

  const name = `camera-${Date.now()}.jpg`;
  return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
}

/**
 * Shared in-app getUserMedia camera — used by SellPhotoUpload, Āwhina chat composer,
 * and the global bubble. Same permission, rear cam, shutter, Blob/File, cleanup.
 */
export default function SharedPhotoCapture({
  open,
  maxCaptures = 8,
  onClose,
  onCapture,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const [facing, setFacing] = useState<Facing>("environment");
  const [canFlip, setCanFlip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sessionFiles, setSessionFiles] = useState<File[]>([]);
  const [sessionPreviews, setSessionPreviews] = useState<string[]>([]);

  const cleanupStream = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const revokeAllPreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
    previewUrlsRef.current = [];
    setSessionPreviews([]);
  }, []);

  const startCamera = useCallback(
    async (mode: Facing) => {
      if (!isCameraSupported()) {
        setError("Camera couldn't be opened. Choose a photo instead.");
        cleanupStream();
        return;
      }

      setStarting(true);
      setError(null);
      cleanupStream();

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          });
        } catch {
          // Fallback: simpler constraint (older WebKit / no rear cam)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: mode },
          });
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.setAttribute("playsinline", "true");
          video.playsInline = true;
          await video.play().catch(() => {
            /* user already opened via button */
          });
        }

        setCanFlip(await hasMultipleCameras());
      } catch {
        setError("Camera couldn't be opened. Choose a photo instead.");
        cleanupStream();
      } finally {
        setStarting(false);
      }
    },
    [cleanupStream]
  );

  // Open / close lifecycle — stop every track when closed or unmounted
  useEffect(() => {
    if (!open) {
      cleanupStream();
      return;
    }

    previewUrlsRef.current = [];
    setSessionFiles([]);
    setSessionPreviews([]);
    setError(null);
    setFacing("environment");
    void startCamera("environment");

    const halt = () => cleanupStream();
    window.addEventListener("pagehide", halt);
    window.addEventListener("beforeunload", halt);

    return () => {
      window.removeEventListener("pagehide", halt);
      window.removeEventListener("beforeunload", halt);
      cleanupStream();
      for (const url of previewUrlsRef.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
      previewUrlsRef.current = [];
    };
  }, [open, cleanupStream, startCamera]);

  const handleClose = () => {
    cleanupStream();
    revokeAllPreviews();
    setSessionFiles([]);
    setError(null);
    onClose();
  };

  const handleShutter = async () => {
    const video = videoRef.current;
    if (!video || sessionFiles.length >= maxCaptures) return;
    const file = await captureFrameToFile(video);
    if (!file) {
      setError("Camera couldn't be opened. Choose a photo instead.");
      return;
    }
    const preview = URL.createObjectURL(file);
    previewUrlsRef.current.push(preview);
    // Camera capture is complete now. Hand the original capture to the existing
    // upload/vision path immediately; the workspace owns analysis and its thumbnail.
    setSessionFiles((prev) => [...prev, file]);
    setSessionPreviews((prev) => [...prev, preview]);
    cleanupStream();
    onCapture([file]);
    revokeAllPreviews();
    onClose();
  };

  const handleFlip = () => {
    const next: Facing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    void startCamera(next);
  };

  if (!open) return null;

  const atLimit = sessionFiles.length >= maxCaptures;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Take photo"
    >
      <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={handleClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Close camera"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span className="text-sm font-medium text-white/80">
          {sessionFiles.length > 0
            ? `${sessionFiles.length} photo${sessionFiles.length === 1 ? "" : "s"}`
            : "Camera"}
        </span>
        {canFlip && !error ? (
          <button
            type="button"
            onClick={handleFlip}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Flip camera"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
          </button>
        ) : (
          <div className="h-10 w-10" />
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-base text-white/90">{error}</p>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400"
            >
              Choose a photo instead
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />
            {starting ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <p className="text-sm text-white/70">Starting camera…</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {!error ? (
        <div className="flex flex-col gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center justify-center py-2">
            <button
              type="button"
              onClick={() => void handleShutter()}
              disabled={starting || atLimit}
              className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-[3px] border-white/90 bg-white/15 transition active:scale-95 disabled:opacity-40"
              aria-label="Take photo"
            >
              <span className="h-14 w-14 rounded-full bg-white shadow-inner" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { isCameraSupported };
