/**
 * Edge-safe in-memory rate limiter for proxy.ts (no Firestore / Node APIs).
 * Per-instance only — use Upstash Redis or Vercel WAF for multi-instance production.
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

function pruneStale(now: number) {
  if (store.size < 8_000) return;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export function checkEdgeRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  pruneStale(now);

  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

/** Burst guard: max requests in a short window (slowloris / flood protection). */
export const API_BURST_MAX = 25;
export const API_BURST_WINDOW_MS = 10_000;

/** Global ceiling for all /api/* traffic per IP. */
export const API_GLOBAL_MAX = 100;
export const API_GLOBAL_WINDOW_MS = 60_000;

export type StrictApiRoute = {
  prefix: string;
  key: string;
  max: number;
  windowMs: number;
};

/** Stricter per-route limits for auth / signup / verification surfaces. */
export const STRICT_API_ROUTES: StrictApiRoute[] = [
  { prefix: "/api/check-email-temp", key: "signup-email", max: 15, windowMs: 60_000 },
  { prefix: "/api/check-phone-ban", key: "signup-phone", max: 15, windowMs: 60_000 },
  { prefix: "/api/check-phone-availability", key: "signup-phone", max: 15, windowMs: 60_000 },
  { prefix: "/api/auth/session", key: "auth-session", max: 10, windowMs: 60_000 },
  { prefix: "/api/save-profile", key: "signup-profile", max: 15, windowMs: 60_000 },
  { prefix: "/api/submit-kyc", key: "signup-kyc", max: 5, windowMs: 60_000 },
  { prefix: "/api/claim-verified-phone", key: "signup-phone", max: 10, windowMs: 60_000 },
  { prefix: "/api/sky-ai", key: "sky-ai", max: 40, windowMs: 60_000 },
  { prefix: "/api/awhina-ai", key: "awhina-ai", max: 40, windowMs: 60_000 },
  { prefix: "/api/awhina-intent", key: "awhina-intent", max: 40, windowMs: 60_000 },
  { prefix: "/api/awhina-vision", key: "awhina-vision", max: 20, windowMs: 60_000 },
  { prefix: "/api/ai-price-suggestion", key: "ai-price", max: 20, windowMs: 60_000 },
  { prefix: "/api/ai-search-intent", key: "ai-search", max: 20, windowMs: 60_000 },
  { prefix: "/api/import-listing", key: "import-listing", max: 10, windowMs: 60_000 },
  { prefix: "/api/send-email", key: "send-email", max: 10, windowMs: 60_000 },
  { prefix: "/api/send-notification-email", key: "send-notif-email", max: 20, windowMs: 60_000 },
  { prefix: "/api/create-notification", key: "create-notification", max: 20, windowMs: 60_000 },
  { prefix: "/api/clear-verified-phone", key: "clear-phone", max: 10, windowMs: 60_000 },
  { prefix: "/api/security-health", key: "security-health", max: 20, windowMs: 60_000 },
  { prefix: "/api/knowledge", key: "knowledge", max: 60, windowMs: 60_000 },
  { prefix: "/api/public-profiles", key: "public-profiles", max: 30, windowMs: 60_000 },
  { prefix: "/api/listing-watchlist-count", key: "watchlist-count", max: 20, windowMs: 60_000 },
];
