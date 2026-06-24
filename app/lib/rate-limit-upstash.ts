import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let upstashRatelimit: Ratelimit | null = null;
let statusLogged = false;

function logStatus() {
  if (statusLogged) return;
  statusLogged = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    console.log("[rate-limit] Upstash Redis ACTIVE — distributed rate limiting across all Vercel instances");
  } else {
    const env = process.env.NODE_ENV || "development";
    console.log(`[rate-limit] WARNING: running in fallback mode (per-instance in-memory + Firestore) — ${env}`);
    console.log("[rate-limit] Upstash Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production.");
    console.log("[rate-limit] Covered endpoints: signup, login, create-listing, messaging, reports, disputes, KYC, payments, offers, reviews");
  }
}

export type UpstashRateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Upstash unreachable — caller should fall back to Firestore/in-memory. */
  degraded?: boolean;
};

function getUpstashRatelimit(): Ratelimit | null {
  if (upstashRatelimit) return upstashRatelimit;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  try {
    const redis = new Redis({ url, token });
    upstashRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(150, "60 s"),
      analytics: true,
      prefix: "sky-drop",
    });
    return upstashRatelimit;
  } catch {
    return null;
  }
}

export function isUpstashEnabled(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const enabled = !!(url && token);
  logStatus();
  return enabled;
}

export async function rateLimitUpstash(
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<UpstashRateLimitResult> {
  const rl = getUpstashRatelimit();
  if (!rl) {
    // Fall back to Firestore/in-memory — do not block user-facing routes when Redis is misconfigured.
    return {
      allowed: true,
      remaining: maxRequests,
      limit: maxRequests,
      degraded: true,
    };
  }

  try {
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const limiter = new Ratelimit({
      redis: (rl as any).redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
      analytics: true,
      prefix: "sd",
    });
    const result = await limiter.limit(identifier);
    return {
      allowed: result.success,
      remaining: result.remaining,
      limit: result.limit,
    };
  } catch (err) {
    console.warn("[rate-limit] Upstash error, falling back to Firestore:", err);
    return {
      allowed: true,
      remaining: maxRequests,
      limit: maxRequests,
      degraded: true,
    };
  }
}
