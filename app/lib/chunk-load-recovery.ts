const CHUNK_RELOAD_KEY = "skydrop-chunk-reload-count";
const MAX_CHUNK_RELOADS = 2;

/** Detect Next.js / Turbopack chunk load failures after a deploy or HMR drift. */
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

  return /Failed to load chunk|Loading chunk \d+ failed|ChunkLoadError|Importing a module script failed|dynamically imported module|module factory is not available|was instantiated because it was required from module/i.test(
    message
  );
}

/** Hard-reload with cache-bust so users pick up fresh HTML + chunk hashes. */
export function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const count = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
    if (count >= MAX_CHUNK_RELOADS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(count + 1));
  } catch {
    /* sessionStorage blocked — still try one reload */
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_cb", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
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
