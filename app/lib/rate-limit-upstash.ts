import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let upstashRedis: Redis | null = null;
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

function getUpstashRedis(): Redis | null {
  if (upstashRedis) return upstashRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  try {
    upstashRedis = new Redis({ url, token });
    return upstashRedis;
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
  const redis = getUpstashRedis();
  if (!redis) {
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
      redis,
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
    console.warn(
      `[rate-limit] Upstash error, falling back to Firestore: ${formatUpstashErrorForLog(err)}`
    );
    return {
      allowed: true,
      remaining: maxRequests,
      limit: maxRequests,
      degraded: true,
    };
  }
}

/** Error name/message plus nested cause code or message only — never url, token, headers, or env. */
export function formatUpstashErrorForLog(err: unknown): string {
  const name = err instanceof Error ? err.name : "Error";
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err.cause : undefined;
  const causeDetail = formatCauseCodeOrMessage(cause);
  return causeDetail ? `${name}: ${message} cause=${causeDetail}` : `${name}: ${message}`;
}

function formatCauseCodeOrMessage(cause: unknown): string {
  if (cause == null) return "";
  if (typeof cause === "string") return cause;
  if (typeof cause !== "object") return "";
  const rec = cause as { code?: unknown; message?: unknown };
  if (typeof rec.code === "string" && rec.code) return rec.code;
  if (typeof rec.code === "number") return String(rec.code);
  if (typeof rec.message === "string" && rec.message) return rec.message;
  return "";
}
