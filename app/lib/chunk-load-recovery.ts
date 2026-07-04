const CHUNK_RELOAD_KEY = "skydrop-chunk-reload-count";
const MAX_CHUNK_RELOADS = 2;

/** Detect Next.js / Turbopack chunk load failures after a deploy. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  const name = error instanceof Error ? error.name : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);

  if (name === "ChunkLoadError") return true;

  return /Failed to load chunk|Loading chunk \d+ failed|ChunkLoadError|Importing a module script failed|dynamically imported module/i.test(
    message
  );
}

/** Hard-reload once or twice so users pick up fresh HTML + chunk hashes. */
export function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const count = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
    if (count >= MAX_CHUNK_RELOADS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(count + 1));
  } catch {
    /* sessionStorage blocked — still try one reload */
  }

  window.location.reload();
  return true;
}

/** Clear reload guard after the app has loaded successfully. */
export function scheduleChunkReloadGuardClear(delayMs = 10_000): () => void {
  if (typeof window === "undefined") return () => {};

  const id = window.setTimeout(() => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      /* ignore */
    }
  }, delayMs);

  return () => window.clearTimeout(id);
}
