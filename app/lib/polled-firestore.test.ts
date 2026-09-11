import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BROWSE_SWR_TTL_MS,
  VISIBILITY_REFETCH_MIN_MS,
  dedupeAsync,
  resetDedupeForTests,
  startVisibilityPolledFetch,
} from "./polled-firestore";

describe("dedupeAsync", () => {
  afterEach(() => {
    resetDedupeForTests();
    vi.useRealTimers();
  });

  it("shares one in-flight promise for the same key", async () => {
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve("ok"), 20);
      });
    };

    const [a, b] = await Promise.all([
      dedupeAsync("k", 10_000, fetcher),
      dedupeAsync("k", 10_000, fetcher),
    ]);

    expect(a).toBe("ok");
    expect(b).toBe("ok");
    expect(calls).toBe(1);
  });

  it("returns cached data within TTL without calling fetcher again", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return calls;
    };

    expect(await dedupeAsync("ttl", BROWSE_SWR_TTL_MS, fetcher)).toBe(1);
    expect(await dedupeAsync("ttl", BROWSE_SWR_TTL_MS, fetcher)).toBe(1);
    expect(calls).toBe(1);
  });

  it("refetches after TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return calls;
    };

    expect(await dedupeAsync("exp", 1_000, fetcher)).toBe(1);
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(await dedupeAsync("exp", 1_000, fetcher)).toBe(2);
    expect(calls).toBe(2);
  });

  it("force bypasses TTL but still joins an in-flight request", async () => {
    let calls = 0;
    let resolveFirst!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });

    const p1 = dedupeAsync("force", 60_000, async () => {
      calls += 1;
      return first;
    });
    const p2 = dedupeAsync(
      "force",
      60_000,
      async () => {
        calls += 1;
        return "nope";
      },
      true
    );

    resolveFirst("a");
    expect(await p1).toBe("a");
    expect(await p2).toBe("a");
    expect(calls).toBe(1);
  });
});

describe("startVisibilityPolledFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips visibility refetch when the last fetch started recently", () => {
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: (event: string, fn: () => void) => {
        listeners[event] = fn;
      },
      removeEventListener: () => {},
    });

    let calls = 0;
    const stop = startVisibilityPolledFetch(() => {
      calls += 1;
    }, 60_000);

    expect(calls).toBe(1);
    listeners.visibilitychange?.();
    expect(calls).toBe(1);
    expect(VISIBILITY_REFETCH_MIN_MS).toBe(15_000);
    stop();
  });
});
