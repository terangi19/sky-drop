import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "./rate-limit";
import {
  UPSTASH_LIMIT_TIMEOUT_MS,
  __resetUpstashAdapterForTests,
  __setUpstashLimitImplForTests,
  formatUpstashErrorForLog,
  rateLimitUpstash,
} from "./rate-limit-upstash";

describe("formatUpstashErrorForLog", () => {
  it("includes nested cause.code without url, token, or headers", () => {
    const err = new TypeError("fetch failed");
    err.cause = {
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND example.upstash.io",
      url: "https://example.upstash.io",
      token: "super-secret-token",
      headers: { Authorization: "Bearer super-secret-token" },
    };

    const logged = formatUpstashErrorForLog(err);

    expect(logged).toBe("TypeError: fetch failed cause=ENOTFOUND");
    expect(logged).not.toMatch(/url|token|Authorization|Bearer|https?:\/\//i);
  });

  it("falls back to cause.message when code is absent", () => {
    const err = new TypeError("fetch failed");
    err.cause = { message: "socket hang up" };

    expect(formatUpstashErrorForLog(err)).toBe(
      "TypeError: fetch failed cause=socket hang up"
    );
  });
});

describe("Upstash timeout and circuit breaker", () => {
  beforeEach(() => {
    __resetUpstashAdapterForTests();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://missing.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  });

  afterEach(() => {
    __resetUpstashAdapterForTests();
    vi.unstubAllEnvs();
  });

  it("does not wait the full hang: a stuck Upstash call degrades within the timeout", async () => {
    let calls = 0;
    __setUpstashLimitImplForTests(async () => {
      calls += 1;
      await new Promise(() => {});
      return { success: true, remaining: 9, limit: 10 };
    });

    const t0 = Date.now();
    const first = await rateLimitUpstash("status-hang", 10, 60_000);
    const elapsed = Date.now() - t0;

    expect(first.degraded).toBe(true);
    expect(first.allowed).toBe(true);
    expect(calls).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(UPSTASH_LIMIT_TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(UPSTASH_LIMIT_TIMEOUT_MS + 250);
  });

  it("skips Upstash entirely on the next call after the circuit opens", async () => {
    let calls = 0;
    __setUpstashLimitImplForTests(async () => {
      calls += 1;
      await new Promise(() => {});
      return { success: true, remaining: 9, limit: 10 };
    });

    await rateLimitUpstash("status-circuit", 10, 60_000);
    expect(calls).toBe(1);

    const t0 = Date.now();
    const second = await rateLimitUpstash("status-circuit", 10, 60_000);
    expect(second.degraded).toBe(true);
    expect(calls).toBe(1);
    expect(Date.now() - t0).toBeLessThan(40);
  });

  it("memory fallback on status does not wait on Upstash after the circuit opens", async () => {
    __setUpstashLimitImplForTests(async () => {
      await new Promise(() => {});
      return { success: true, remaining: 9, limit: 10 };
    });

    const key = `sky-ai-status:test:${Date.now()}:${Math.random()}`;
    await rateLimit(key, 100, 60_000, { fallback: "memory" });

    const t0 = Date.now();
    const second = await rateLimit(key, 100, 60_000, { fallback: "memory" });
    expect(second.allowed).toBe(true);
    expect(Date.now() - t0).toBeLessThan(40);
  });
});
