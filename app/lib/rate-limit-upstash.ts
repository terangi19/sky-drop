import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let upstashRedis: Redis | null = null;
let statusLogged = false;
let circuitOpenUntil = 0;
const limiterCache = new Map<string, Ratelimit>();
const ephemeralCache = new Map<string, number>();

/** Abort a hung Upstash REST call so DNS/fetch failures cannot stall the request ~5s. */
export const UPSTASH_LIMIT_TIMEOUT_MS = 500;
/** After Upstash fails, skip Redis for this long (stale hostname / ENOTFOUND). */
export const UPSTASH_CIRCUIT_COOLDOWN_MS = 30_000;

type LimitOutcome = { success: boolean; remaining: number; limit: number };
type LimitImpl = (identifier: string) => Promise<LimitOutcome>;

let testLimitImpl: LimitImpl | null = null;

function logStatus() {
  if (statusLogged) return;
  statusLogged = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    console.log("[rate-limit] Upstash Redis ACTIVE — distributed rate limiting across all Vercel instances");
  } else {
    const env = process.env.NODE_ENV || "development";
    console.log(`[rate-limit] WARNING: running in fallback mode (per-instance in-memory only) — ${env}`);
    console.log("[rate-limit] Upstash Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production.");
    console.log("[rate-limit] Covered endpoints: signup, login, create-listing, messaging, reports, disputes, KYC, payments, offers, reviews");
  }
}

export type UpstashRateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Upstash unreachable — caller should fall back to in-memory (never Firestore). */
  degraded?: boolean;
};

function degradedResult(maxRequests: number): UpstashRateLimitResult {
  return {
    allowed: true,
    remaining: maxRequests,
    limit: maxRequests,
    degraded: true,
  };
}

function getUpstashRedis(): Redis | null {
  if (upstashRedis) return upstashRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  try {
    upstashRedis = new Redis({
      url,
      token,
      // Default is 5 retries with exponential backoff — a dead hostname then costs ~5s+.
      retry: { retries: 0, backoff: () => 0 },
      enableTelemetry: false,
      signal: () => AbortSignal.timeout(UPSTASH_LIMIT_TIMEOUT_MS),
    });
    return upstashRedis;
  } catch {
    return null;
  }
}

function getLimiter(redis: Redis, maxRequests: number, windowMs: number): Ratelimit {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const cacheKey = `${maxRequests}:${windowSeconds}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
    analytics: false,
    prefix: "sd",
    ephemeralCache,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

export function isUpstashEnabled(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const enabled = !!(url && token);
  logStatus();
  return enabled;
}

export function isUpstashCircuitOpen(now = Date.now()): boolean {
  return now < circuitOpenUntil;
}

function openCircuit(now = Date.now()): void {
  circuitOpenUntil = now + UPSTASH_CIRCUIT_COOLDOWN_MS;
}

export function __resetUpstashAdapterForTests(): void {
  upstashRedis = null;
  circuitOpenUntil = 0;
  testLimitImpl = null;
  limiterCache.clear();
  ephemeralCache.clear();
}

export function __setUpstashLimitImplForTests(impl: LimitImpl | null): void {
  testLimitImpl = impl;
  circuitOpenUntil = 0;
}

async function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  void promise.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runLimit(
  limit: LimitImpl,
  identifier: string,
  maxRequests: number
): Promise<UpstashRateLimitResult> {
  try {
    const result = await withDeadline(
      limit(identifier),
      UPSTASH_LIMIT_TIMEOUT_MS,
      "upstash-timeout"
    );
    return {
      allowed: result.success,
      remaining: result.remaining,
      limit: result.limit,
    };
  } catch (err) {
    openCircuit();
    console.warn(
      `[rate-limit] Upstash error, falling back to in-memory: ${formatUpstashErrorForLog(err)}`
    );
    return degradedResult(maxRequests);
  }
}

export async function rateLimitUpstash(
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<UpstashRateLimitResult> {
  if (isUpstashCircuitOpen()) {
    return degradedResult(maxRequests);
  }

  if (testLimitImpl) {
    return runLimit(testLimitImpl, identifier, maxRequests);
  }

  const redis = getUpstashRedis();
  if (!redis) {
    // Fall back to in-memory — do not block user-facing routes when Redis is misconfigured.
    return degradedResult(maxRequests);
  }

  const limiter = getLimiter(redis, maxRequests, windowMs);
  return runLimit(
    async (id) => {
      const result = await limiter.limit(id);
      return {
        success: result.success,
        remaining: result.remaining,
        limit: result.limit,
      };
    },
    identifier,
    maxRequests
  );
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
