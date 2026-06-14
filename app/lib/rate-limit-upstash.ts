import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let upstashRatelimit: Ratelimit | null = null;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL;
}

function failClosed(maxRequests: number): { allowed: boolean; remaining: number; limit: number } {
  return { allowed: false, remaining: 0, limit: maxRequests };
}

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
  return !!(url && token);
}

export async function rateLimitUpstash(
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const rl = getUpstashRatelimit();
  if (!rl) {
    return isProduction()
      ? failClosed(maxRequests)
      : { allowed: true, remaining: maxRequests, limit: maxRequests };
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
  } catch {
    return isProduction()
      ? failClosed(maxRequests)
      : { allowed: true, remaining: maxRequests, limit: maxRequests };
  }
}
