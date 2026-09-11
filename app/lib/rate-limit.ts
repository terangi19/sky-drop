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

function logRateLimitHit(key: string, maxRequests: number, windowMs: number, suffix = "") {
  const now = Date.now();
  const lastLogged = BLOCKED_KEY_CACHE.get(key) || 0;
  if (now - lastLogged > 60_000) {
    BLOCKED_KEY_CACHE.set(key, now);
    logSecurityWarning("rate_limit_exceeded", `Rate limit hit for ${key}${suffix}`, {
      metadata: { key, maxRequests, windowMs },
    });
  }
}

/**
 * Per-instance in-memory limiter.
 * Used when Upstash is unset, misconfigured, or unreachable.
 * Intentionally does not touch Firestore — rateLimits writes amplify cost.
 */
function rateLimitMemory(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, maxRequests - 1), limit: maxRequests };
  }

  if (entry.count >= maxRequests) {
    logRateLimitHit(key, maxRequests, windowMs, " (in-memory fallback)");
    return { allowed: false, remaining: 0, limit: maxRequests };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, limit: maxRequests };
}

export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  // Layer 1: Upstash Redis (distributed, production)
  if (isUpstashEnabled()) {
    const result = await rateLimitUpstash(key, maxRequests, windowMs);
    if (!result.degraded) {
      if (!result.allowed) {
        logRateLimitHit(key, maxRequests, windowMs);
      }
      return result;
    }
    // Redis unset/unreachable/error — skip Firestore. Enforce in-memory only.
  }

  // Layer 2: in-memory only (dev, missing Upstash, or degraded Upstash)
  return rateLimitMemory(key, maxRequests, windowMs);
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
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref?.();
