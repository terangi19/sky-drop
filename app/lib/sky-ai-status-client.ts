/**
 * Shared Āwhina OpenAI-ready probe. Multiple chat mounts (Strict Mode,
 * sheet + inline) must not hammer GET /api/sky-ai/status.
 */
export const SKY_AI_STATUS_TTL_MS = 30_000;

export type SkyAiStatusClientResult = {
  openaiReady: boolean;
};

type CacheEntry = {
  value: SkyAiStatusClientResult;
  at: number;
};

let inflight: Promise<SkyAiStatusClientResult | null> | null = null;
let cache: CacheEntry | null = null;

export function resetSkyAiStatusClientCache(): void {
  inflight = null;
  cache = null;
}

export function fetchSkyAiStatus(options?: {
  ttlMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}): Promise<SkyAiStatusClientResult | null> {
  const ttlMs = options?.ttlMs ?? SKY_AI_STATUS_TTL_MS;
  const now = options?.now ?? Date.now;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const at = now();
  if (cache && at - cache.at < ttlMs) {
    return Promise.resolve(cache.value);
  }
  if (inflight) return inflight;

  inflight = Promise.resolve()
    .then(() => fetchImpl("/api/sky-ai/status"))
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && typeof data.openaiReady === "boolean") {
        const value = { openaiReady: Boolean(data.openaiReady) };
        cache = { value, at: now() };
        return value;
      }
      return cache?.value ?? null;
    })
    .catch(() => cache?.value ?? null)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
