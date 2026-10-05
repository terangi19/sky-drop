import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./abuse-decision-engine", () => ({
  decide: vi.fn(),
  applyDecisionDelay: vi.fn(),
  persistRiskFlag: vi.fn(),
  recordTurnstileAttempt: vi.fn(),
  isEngineDegraded: vi.fn(() => false),
}));
vi.mock("./turnstile", () => ({ verifyTurnstileToken: vi.fn(), isTurnstileConfigured: () => false }));
vi.mock("./firebase-admin", () => ({ getAdminDb: vi.fn(), isAdminInitialized: () => false }));
vi.mock("./account-graph", () => ({ registerAction: vi.fn() }));

import { checkIdempotency } from "./enforce-protection";
import {
  UPSTASH_LIMIT_TIMEOUT_MS,
  __resetUpstashAdapterForTests,
  isUpstashCircuitOpen,
} from "./rate-limit-upstash";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** @upstash/redis auto-pipelines: POST /pipeline with [[cmd...]] -> [{result}]; single -> {result}. */
const redisReply = (result: unknown) => (url: string) =>
  String(url).endsWith("/pipeline") ? json([{ result }]) : json({ result });
const cmdOf = (init: RequestInit): unknown[] => {
  const body = JSON.parse(String(init.body));
  return Array.isArray(body[0]) ? body[0] : body;
};
let n = 0;
const id = () => `req-${Date.now()}-${n++}`;

describe("enforceProtection idempotency over Upstash", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetUpstashAdapterForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://idem.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    __resetUpstashAdapterForTests();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("success: SET NX OK = first request, null = duplicate; requestId is not placed in the URL", async () => {
    fetchMock
      .mockImplementationOnce(async (u: string) => redisReply("OK")(u))
      .mockImplementationOnce(async (u: string) => redisReply(null)(u));
    const rid = `${id()}/../evil`;
    expect(await checkIdempotency(rid)).toBe(true);
    expect(await checkIdempotency(rid)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).not.toContain("evil");
    expect(cmdOf(init)).toEqual(["set", `sd:idem:${rid}`, "1", "nx", "ex", 90]);
    expect(isUpstashCircuitOpen()).toBe(false);
  });

  it("timeout: a hung fetch fails open at the 500 ms deadline and opens the breaker", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const rid = id();
    const t0 = Date.now();
    expect(await checkIdempotency(rid)).toBe(true); // memory: first sighting
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(UPSTASH_LIMIT_TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(UPSTASH_LIMIT_TIMEOUT_MS + 250);
    expect(isUpstashCircuitOpen()).toBe(true);
    expect(await checkIdempotency(rid)).toBe(false); // memory still de-dupes on this instance
  });

  it("non-2xx: error response falls back to memory (not treated as a duplicate) and opens the breaker", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "ERR boom" }, 500));
    expect(await checkIdempotency(id())).toBe(true);
    expect(isUpstashCircuitOpen()).toBe(true);
  });

  it("network error: falls back to memory and opens the breaker", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }));
    const rid = id();
    expect(await checkIdempotency(rid)).toBe(true);
    expect(isUpstashCircuitOpen()).toBe(true);
    expect(await checkIdempotency(rid)).toBe(false);
  });

  it("circuit open: skips the fetch entirely and uses memory", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await checkIdempotency(id());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const rid = id();
    const t0 = Date.now();
    expect(await checkIdempotency(rid)).toBe(true);
    expect(await checkIdempotency(rid)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - t0).toBeLessThan(40);
  });

  it("Upstash not configured: never fetches, memory only", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const rid = id();
    expect(await checkIdempotency(rid)).toBe(true);
    expect(await checkIdempotency(rid)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scopes the Redis key by uid and falls back to the bare requestId when uid is absent", async () => {
    fetchMock
      .mockImplementationOnce(async (u: string) => redisReply("OK")(u))
      .mockImplementationOnce(async (u: string) => redisReply("OK")(u))
      .mockImplementationOnce(async (u: string) => redisReply("OK")(u))
      .mockImplementationOnce(async (u: string) => redisReply(null)(u));
    const rid = id();
    expect(await checkIdempotency(rid, "user-a")).toBe(true);
    expect(await checkIdempotency(rid, "user-b")).toBe(true);
    expect(await checkIdempotency(rid)).toBe(true);
    expect(await checkIdempotency(rid, "")).toBe(false); // empty uid is absent → same bare key, NX miss
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const keyAt = (i: number) => cmdOf(fetchMock.mock.calls[i][1] as RequestInit);
    expect(keyAt(0)).toEqual(["set", `sd:idem:user-a:${rid}`, "1", "nx", "ex", 90]);
    expect(keyAt(1)).toEqual(["set", `sd:idem:user-b:${rid}`, "1", "nx", "ex", 90]);
    expect(keyAt(2)).toEqual(["set", `sd:idem:${rid}`, "1", "nx", "ex", 90]);
    expect(keyAt(3)).toEqual(["set", `sd:idem:${rid}`, "1", "nx", "ex", 90]);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(rid);
  });

  it("in-memory fallback is scoped by uid and uses the bare requestId when uid is absent", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const rid = id();
    expect(await checkIdempotency(rid, "user-a")).toBe(true);
    expect(await checkIdempotency(rid, "user-b")).toBe(true);
    expect(await checkIdempotency(rid, "user-a")).toBe(false);
    expect(await checkIdempotency(rid)).toBe(true);
    expect(await checkIdempotency(rid)).toBe(false);
    expect(await checkIdempotency(rid, "")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
