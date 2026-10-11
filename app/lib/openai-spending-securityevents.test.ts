import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ warnings: [] as Array<{ type: string; message: string }> }));

vi.mock("./security-log", () => ({
  logSecurityWarning: (type: string, message: string) => {
    h.warnings.push({ type, message });
    return Promise.resolve();
  },
}));

import {
  __resetOpenAiSpendingForTests,
  __resetOverCapLogDedupeForTests,
  __setOpenAiSpendingForTests,
  checkGlobalBudgetCaps,
  checkSpendingLimits,
} from "./openai-spending";

const ENV = ["OPENAI_DAILY_LIMIT_USD", "OPENAI_MONTHLY_LIMIT_USD"] as const;
const snap: Record<string, string | undefined> = {};

describe("over-cap securityEvents are deduped (blocking is not)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    for (const k of ENV) snap[k] = process.env[k];
    process.env.OPENAI_DAILY_LIMIT_USD = "10";
    process.env.OPENAI_MONTHLY_LIMIT_USD = "100";
    h.warnings.length = 0;
    __resetOpenAiSpendingForTests();
    __resetOverCapLogDedupeForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const k of ENV) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
    __resetOpenAiSpendingForTests();
    __resetOverCapLogDedupeForTests();
  });

  it("logs the daily-cap event once per 60 s but blocks every request", async () => {
    __setOpenAiSpendingForTests({ dailySpendUSD: 10, monthlySpendUSD: 10 });
    for (let i = 0; i < 6; i++) {
      const r = await checkSpendingLimits("u1", "203.0.113.1");
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe("Daily spend limit exceeded");
    }
    expect(h.warnings.filter((w) => w.type === "openai_daily_limit_exceeded")).toHaveLength(1);

    vi.advanceTimersByTime(59_000);
    expect((await checkGlobalBudgetCaps()).allowed).toBe(false);
    expect(h.warnings).toHaveLength(1);

    vi.advanceTimersByTime(2_000); // 61 s since first log
    expect((await checkGlobalBudgetCaps()).allowed).toBe(false);
    expect(h.warnings.filter((w) => w.type === "openai_daily_limit_exceeded")).toHaveLength(2);
  });

  it("dedupes the monthly-cap event independently of the daily one", async () => {
    __setOpenAiSpendingForTests({ dailySpendUSD: 1, monthlySpendUSD: 100 });
    for (let i = 0; i < 4; i++) {
      const r = await checkSpendingLimits(null, "203.0.113.2");
      expect(r).toMatchObject({ allowed: false, reason: "Monthly spend limit exceeded" });
    }
    expect(h.warnings.map((w) => w.type)).toEqual(["openai_monthly_limit_exceeded"]);

    __setOpenAiSpendingForTests({ dailySpendUSD: 10, monthlySpendUSD: 10 });
    expect((await checkSpendingLimits(null, "203.0.113.2")).allowed).toBe(false);
    expect(h.warnings.map((w) => w.type)).toEqual([
      "openai_monthly_limit_exceeded",
      "openai_daily_limit_exceeded",
    ]);
  });

  it("does not log or block under the caps", async () => {
    __setOpenAiSpendingForTests({ dailySpendUSD: 1, monthlySpendUSD: 1 });
    expect((await checkSpendingLimits("u1", "203.0.113.3")).allowed).toBe(true);
    expect(h.warnings).toEqual([]);
  });
});
