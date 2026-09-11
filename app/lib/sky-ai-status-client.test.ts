import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSkyAiStatus,
  resetSkyAiStatusClientCache,
  SKY_AI_STATUS_TTL_MS,
} from "./sky-ai-status-client";

afterEach(() => {
  resetSkyAiStatusClientCache();
});

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("fetchSkyAiStatus", () => {
  it("shares one in-flight GET across concurrent callers", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return jsonOk({ openaiReady: true });
    });

    const [a, b] = await Promise.all([
      fetchSkyAiStatus({ fetchImpl }),
      fetchSkyAiStatus({ fetchImpl }),
    ]);

    expect(calls).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/sky-ai/status");
    expect(a).toEqual({ openaiReady: true });
    expect(b).toEqual({ openaiReady: true });
  });

  it("serves a short TTL cache instead of refetching", async () => {
    const fetchImpl = vi.fn(async () => jsonOk({ openaiReady: false }));
    let now = 1_000;
    const first = await fetchSkyAiStatus({ fetchImpl, now: () => now });
    now += SKY_AI_STATUS_TTL_MS - 1;
    const second = await fetchSkyAiStatus({ fetchImpl, now: () => now });

    expect(first).toEqual({ openaiReady: false });
    expect(second).toEqual({ openaiReady: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expires", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonOk({ openaiReady: false }))
      .mockResolvedValueOnce(jsonOk({ openaiReady: true }));
    let now = 1_000;
    await fetchSkyAiStatus({ fetchImpl, now: () => now });
    now += SKY_AI_STATUS_TTL_MS + 1;
    const next = await fetchSkyAiStatus({ fetchImpl, now: () => now });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(next).toEqual({ openaiReady: true });
  });
});
