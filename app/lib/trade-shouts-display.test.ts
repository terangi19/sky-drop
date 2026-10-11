import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRADE_SHOUT_TTL_MS, createShoutListenerErrorHandler, visibleShouts } from "./trade-shouts";

const ts = (ms: number) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });
const NOW = Date.UTC(2026, 9, 12, 0, 0, 0);

describe("visibleShouts (1h display window)", () => {
  it("hides shouts older than 1h, keeps recent and pending ones", () => {
    const shouts = [
      { id: "day-old", createdAt: ts(NOW - 25 * 60 * 60 * 1000) },
      { id: "61m", createdAt: ts(NOW - 61 * 60 * 1000) },
      { id: "exactly-1h", createdAt: ts(NOW - TRADE_SHOUT_TTL_MS) },
      { id: "5m", createdAt: { seconds: Math.floor((NOW - 5 * 60 * 1000) / 1000), nanoseconds: 0 } },
      { id: "pending", createdAt: null },
      { id: "future-skew", createdAt: ts(NOW + 30_000) },
    ];
    expect(visibleShouts(shouts, NOW).map((s) => s.id)).toEqual(["exactly-1h", "5m", "pending", "future-skew"]);
  });

  it("keeps input order and does not mutate", () => {
    const shouts = [{ id: "a", createdAt: ts(NOW - 1000) }, { id: "b", createdAt: ts(NOW - 2000) }];
    const copy = [...shouts];
    expect(visibleShouts(shouts, NOW).map((s) => s.id)).toEqual(["a", "b"]);
    expect(shouts).toEqual(copy);
  });
});

describe("createShoutListenerErrorHandler", () => {
  it("logs once per error code and always reports to onError", () => {
    const log = vi.fn();
    const onError = vi.fn();
    const handler = createShoutListenerErrorHandler(onError, log);
    const idx = { code: "failed-precondition", message: "The query requires an index." };
    handler(idx);
    handler(idx);
    handler({ code: "permission-denied", message: "Missing or insufficient permissions." });
    handler(new Error("boom"));
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls[0][0]).toContain("failed-precondition");
    expect(log.mock.calls[1][0]).toContain("permission-denied");
    expect(onError.mock.calls.map((c) => c[0])).toEqual([
      "failed-precondition",
      "failed-precondition",
      "permission-denied",
      "unknown",
    ]);
  });
});

describe("trade-feed page wiring", () => {
  const src = readFileSync(join(process.cwd(), "app/trade-feed/page.tsx"), "utf8");
  const listener = src.slice(src.indexOf('collection(db, "tradeShouts")'), src.indexOf("}, [selectedWorld]);"));

  it("the shout onSnapshot has an error callback that keeps existing shouts", () => {
    expect(listener).toContain("createShoutListenerErrorHandler(() => setShoutsUnavailable(true))");
    expect(listener).toMatch(/onSnapshot\(\s*q,\s*\(snap\) =>[\s\S]*?,\s*onShoutError\s*\)/);
    // error path must not clear the list
    expect(listener).not.toMatch(/setShoutsUnavailable\(true\)[^;]*setShouts\(\[\]\)/);
    expect(src).not.toMatch(/showToast\([^)]*shout/i);
  });

  it("renders only the 1h window and a quiet empty state on error", () => {
    expect(src).toContain("visibleShouts(shouts, shoutClockMs)");
    expect(src).toContain("displayShouts.map((s) =>");
    expect(src).not.toMatch(/\{shouts\.map\(|\bshouts\.length === 0/);
    expect(src).toContain('shoutsUnavailable ? "Chat is unavailable right now." : "No messages yet..."');
  });
});
