"use client";

import { useEffect } from "react";
import {
  isChunkLoadError,
  reloadOnceForChunkError,
  scheduleChunkReloadGuardClear,
} from "../lib/chunk-load-recovery";

/**
 * After a deploy, cached HTML can reference removed JS chunks (404).
 * Auto-reload once so users fetch fresh assets instead of hitting ErrorBoundary.
 */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const tryRecover = (error: unknown) => {
      if (!isChunkLoadError(error)) return;
      reloadOnceForChunkError();
    };

    const onError = (event: ErrorEvent) => {
      tryRecover(event.error ?? event.message);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      tryRecover(event.reason);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const clearGuard = scheduleChunkReloadGuardClear();

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      clearGuard();
    };
  }, []);

  return null;
}
