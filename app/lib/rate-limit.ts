import { rateLimitUpstash, isUpstashEnabled } from "./rate-limit-upstash";
import { logSecurityWarning } from "./security-log";

export { isUpstashEnabled };
import {
  evaluateFriction,
  applyDelay,
  recordViolation,
  shouldSkipCaptcha,
  shouldWaste,
  type FrictionInput,
  type FrictionDecision,
} from "./adaptive-friction";

const store = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { allowed: boolean; remaining: number; limit: number };

export type FrictionResult = RateLimitResult & {
  delayMs: number;
  downgrade: boolean;
  riskTier: FrictionDecision["riskTier"];
};

export type { FrictionInput };

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
    if (result.degraded) {
      // Redis misconfigured or unreachable — fall through to Firestore/in-memory.
    } else if (!result.allowed) {
      const lastLogged = BLOCKED_KEY_CACHE.get(key) || 0;
      if (now - lastLogged > 60_000) {
        BLOCKED_KEY_CACHE.set(key, now);
        logSecurityWarning("rate_limit_exceeded", `Rate limit hit for ${key}`, {
          metadata: { key, maxRequests, windowMs },
        });
      }
      return result;
    } else {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return result;
    }
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

  // Layer 4: In-memory fallback (used when Upstash + Firestore both unavailable)
  const freshEntry = store.get(key);
  if (!freshEntry || now > freshEntry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, limit: maxRequests };
  }

  freshEntry.count++;
  if (freshEntry.count > maxRequests) {
    const lastLogged = BLOCKED_KEY_CACHE.get(key) || 0;
    if (now - lastLogged > 60_000) {
      BLOCKED_KEY_CACHE.set(key, now);
      logSecurityWarning("rate_limit_exceeded", `Rate limit hit for ${key} (in-memory fallback)`, {
        metadata: { key, maxRequests, windowMs },
      });
    }
    return { allowed: false, remaining: 0, limit: maxRequests };
  }
  return { allowed: true, remaining: maxRequests - freshEntry.count, limit: maxRequests };
}

/**
 * Adaptive friction limit — replaces hard 429 blocks with soft delays.
 *
 * 1. Evaluates behavioral risk signals
 * 2. Applies adaptive delay (0ms for real users, up to 10s for bots)
 * 3. Checks hard rate limit as safety net (still escalates but doesn't 429)
 * 4. Returns downgrade flag for wasted-effort decisions
 *
 * API routes should use this instead of raw `rateLimit()` for all
 * user-facing endpoints. The hard 429 is only returned when the
 * edge proxy (25/10s burst) triggers, keeping the app layer smooth.
 */
export async function frictionLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  friction: FrictionInput
): Promise<FrictionResult> {
  const decision = await evaluateFriction(friction);
  await applyDelay(decision.delayMs);

  const result = await rateLimit(key, maxRequests, windowMs);

  if (!result.allowed) {
    recordViolation(friction.uid || friction.ip);
    const extraDelay = Math.min(decision.delayMs + 3000, 15000);
    await applyDelay(extraDelay);
    return {
      allowed: true,
      remaining: 0,
      limit: maxRequests,
      delayMs: extraDelay,
      downgrade: shouldWaste(decision.riskTier),
      riskTier: decision.riskTier,
    };
  }

  return {
    ...result,
    delayMs: decision.delayMs,
    downgrade: decision.downgrade,
    riskTier: decision.riskTier,
  };
}

export { shouldSkipCaptcha, shouldWaste };

// Clean up stale in-memory entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
