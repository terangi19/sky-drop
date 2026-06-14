import { rateLimitUpstash, isUpstashEnabled } from "./rate-limit-upstash";
import { logSecurityWarning } from "./security-log";

const store = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { allowed: boolean; remaining: number; limit: number };

const BLOCKED_KEY_CACHE = new Map<string, number>();

export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();

  // Layer 1: Upstash Redis (distributed, production)
  if (isUpstashEnabled()) {
    const result = await rateLimitUpstash(key, maxRequests, windowMs);
    if (!result.allowed) {
      const lastLogged = BLOCKED_KEY_CACHE.get(key) || 0;
      if (now - lastLogged > 60_000) {
        BLOCKED_KEY_CACHE.set(key, now);
        logSecurityWarning("rate_limit_exceeded", `Rate limit hit for ${key}`, {
          metadata: { key, maxRequests, windowMs },
        });
      }
      return result;
    }
    store.set(key, { count: 1, resetAt: now + windowMs });
    return result;
  }

  // Layer 2: Fast in-memory check (dev / fallback)
  const memEntry = store.get(key);
  if (memEntry && now > memEntry.resetAt) {
    store.delete(key);
  } else if (memEntry && memEntry.count >= maxRequests) {
    const lastLogged = BLOCKED_KEY_CACHE.get(key) || 0;
    if (now - lastLogged > 60_000) {
      BLOCKED_KEY_CACHE.set(key, now);
      logSecurityWarning("rate_limit_exceeded", `Rate limit hit for ${key}`, {
        metadata: { key, maxRequests, windowMs },
      });
    }
    return { allowed: false, remaining: 0, limit: maxRequests };
  }

  // Layer 3: Firestore-backed check (cross-instance fallback when no Upstash)
  try {
    const { getAdminDb, isAdminInitialized } = await import("./firebase-admin");
    if (isAdminInitialized()) {
      const db = getAdminDb();
      const fsKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
      const ref = db.collection("rateLimits").doc(fsKey);
      const snap = await ref.get();
      let data = snap.data();
      let count = 1;
      let resetAt = now + windowMs;

      if (data && now < data.resetAt?.toMillis?.()) {
        count = (data.count || 0) + 1;
        resetAt = data.resetAt.toMillis();
        if (count > maxRequests) {
          store.set(key, { count, resetAt });
          const lastLogged = BLOCKED_KEY_CACHE.get(key) || 0;
          if (now - lastLogged > 60_000) {
            BLOCKED_KEY_CACHE.set(key, now);
            logSecurityWarning("rate_limit_exceeded", `Rate limit hit for ${key}`, {
              metadata: { key, maxRequests, windowMs },
            });
          }
          return { allowed: false, remaining: 0, limit: maxRequests };
        }
      }

      await ref.set({ count, resetAt: new Date(resetAt), key }, { merge: true });
      store.set(key, { count, resetAt });
      return { allowed: true, remaining: maxRequests - count, limit: maxRequests };
    }
  } catch {}

  // Layer 4: Fall back to in-memory only
  if (!memEntry || now > memEntry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, limit: maxRequests };
  }

  memEntry.count++;
  return { allowed: true, remaining: maxRequests - memEntry.count, limit: maxRequests };
}

// Clean up stale in-memory entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
