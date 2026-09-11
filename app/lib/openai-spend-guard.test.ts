import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __failOpenAiSpendingForTests,
  __resetOpenAiSpendingForTests,
  __setOpenAiSpendingForTests,
  getConfigLimits,
} from "./openai-spending";
import {
  OPENAI_BUDGET_EXCEEDED_CODE,
  OPENAI_BUDGET_UNAVAILABLE_CODE,
  OPENAI_DISABLED_CODE,
  checkOpenAiSpendGate,
  gateOpenAiCall,
  isOpenAiEnabled,
  withOpenAiSpendContext,
} from "./openai-spend-guard";
import {
  __resetOpenAiHealthCacheForTests,
  checkOpenAiHealth,
} from "./openai-health";

const ENV_KEYS = [
  "OPENAI_ENABLED",
  "OPENAI_DAILY_LIMIT_USD",
  "OPENAI_MONTHLY_LIMIT_USD",
  "OPENAI_PER_USER_DAILY_TOKENS",
  "OPENAI_PER_USER_MONTHLY_TOKENS",
  "OPENAI_PER_IP_DAILY_REQUESTS",
  "OPENAI_API_KEY",
] as const;

const envSnapshot: Record<string, string | undefined> = {};

describe("OpenAI spend guards", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      envSnapshot[key] = process.env[key];
    }
    __resetOpenAiSpendingForTests();
    __resetOpenAiHealthCacheForTests();
    delete process.env.OPENAI_ENABLED;
    process.env.OPENAI_DAILY_LIMIT_USD = "50";
    process.env.OPENAI_MONTHLY_LIMIT_USD = "1000";
    process.env.OPENAI_PER_USER_DAILY_TOKENS = "100000";
    process.env.OPENAI_PER_USER_MONTHLY_TOKENS = "1000000";
    process.env.OPENAI_PER_IP_DAILY_REQUESTS = "50";
    process.env.OPENAI_API_KEY = "sk-test-not-real";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = envSnapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetOpenAiSpendingForTests();
    __resetOpenAiHealthCacheForTests();
  });

  it("treats OPENAI_DAILY_LIMIT_USD=0 as a hard cap (not the $50 default)", () => {
    process.env.OPENAI_DAILY_LIMIT_USD = "0";
    expect(getConfigLimits().dailyLimitUSD).toBe(0);
  });

  it("honors OPENAI_ENABLED=false kill switch without calling OpenAI", async () => {
    process.env.OPENAI_ENABLED = "false";
    expect(isOpenAiEnabled()).toBe(false);

    let billed = false;
    await expect(
      withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
        gateOpenAiCall(async () => {
          billed = true;
          return { ok: true };
        })
      )
    ).rejects.toMatchObject({ code: OPENAI_DISABLED_CODE });
    expect(billed).toBe(false);
  });

  it("keeps OPENAI_ENABLED=false ahead of a tracker error", async () => {
    process.env.OPENAI_ENABLED = "false";
    __failOpenAiSpendingForTests(new Error("Firestore unavailable"));

    let billed = false;
    await expect(
      withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
        gateOpenAiCall(async () => {
          billed = true;
          return { ok: true };
        })
      )
    ).rejects.toMatchObject({ code: OPENAI_DISABLED_CODE });
    expect(billed).toBe(false);
  });

  it("blocks an over-limit request before any billed OpenAI call", async () => {
    __setOpenAiSpendingForTests({ dailySpendUSD: 50 });
    process.env.OPENAI_DAILY_LIMIT_USD = "50";

    const gate = await withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
      checkOpenAiSpendGate()
    );
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe(OPENAI_BUDGET_EXCEEDED_CODE);

    let billed = false;
    await expect(
      withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
        gateOpenAiCall(async () => {
          billed = true;
          return { text: "should never run" };
        })
      )
    ).rejects.toMatchObject({
      code: OPENAI_BUDGET_EXCEEDED_CODE,
      status: 503,
    });
    expect(billed).toBe(false);
  });

  it("blocks when OPENAI_DAILY_LIMIT_USD=0 even with zero recorded spend", async () => {
    process.env.OPENAI_DAILY_LIMIT_USD = "0";
    __setOpenAiSpendingForTests({ dailySpendUSD: 0 });

    let billed = false;
    await expect(
      withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
        gateOpenAiCall(async () => {
          billed = true;
          return { ok: true };
        })
      )
    ).rejects.toMatchObject({ code: OPENAI_BUDGET_EXCEEDED_CODE });
    expect(billed).toBe(false);
  });

  it("blocks per-user token caps and per-IP request caps", async () => {
    process.env.OPENAI_PER_USER_DAILY_TOKENS = "10";
    __setOpenAiSpendingForTests({
      dailySpendUSD: 0,
      userDailyTokens: { "user-1": 10 },
    });
    let billed = false;
    await expect(
      withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
        gateOpenAiCall(async () => {
          billed = true;
          return { ok: true };
        })
      )
    ).rejects.toMatchObject({ code: OPENAI_BUDGET_EXCEEDED_CODE });
    expect(billed).toBe(false);

    process.env.OPENAI_PER_USER_DAILY_TOKENS = "100000";
    process.env.OPENAI_PER_IP_DAILY_REQUESTS = "2";
    __setOpenAiSpendingForTests({
      dailySpendUSD: 0,
      ipDailyRequests: { "203.0.113.10": 2 },
    });
    billed = false;
    await expect(
      withOpenAiSpendContext({ uid: "user-2", ip: "203.0.113.10" }, () =>
        gateOpenAiCall(async () => {
          billed = true;
          return { ok: true };
        })
      )
    ).rejects.toMatchObject({ code: OPENAI_BUDGET_EXCEEDED_CODE });
    expect(billed).toBe(false);
  });

  it("allows under-budget calls and records usage for the next check", async () => {
    __setOpenAiSpendingForTests({ dailySpendUSD: 0 });
    process.env.OPENAI_DAILY_LIMIT_USD = "50";

    let billed = false;
    const result = await withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
      gateOpenAiCall(
        async () => {
          billed = true;
          return { ok: true };
        },
        () => ({ model: "gpt-4o-mini", inputTokens: 100, outputTokens: 50 })
      )
    );
    expect(result).toEqual({ ok: true });
    expect(billed).toBe(true);

    const after = await withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
      checkOpenAiSpendGate()
    );
    expect(after.allowed).toBe(true);
  });

  it("soft-fails record usage after a successful billed call; next gate fail-closes", async () => {
    __setOpenAiSpendingForTests({ dailySpendUSD: 0 });

    let billed = false;
    const result = await withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
      gateOpenAiCall(
        async () => {
          billed = true;
          __failOpenAiSpendingForTests(new Error("Firestore write failed"));
          return { ok: true };
        },
        () => ({ model: "gpt-4o-mini", inputTokens: 10, outputTokens: 5 })
      )
    );
    expect(result).toEqual({ ok: true });
    expect(billed).toBe(true);

    const next = await withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
      checkOpenAiSpendGate()
    );
    expect(next.allowed).toBe(false);
    expect(next.code).toBe(OPENAI_BUDGET_UNAVAILABLE_CODE);
  });

  it("blocks billed OpenAI when the spend tracker errors (fail-closed)", async () => {
    __failOpenAiSpendingForTests(new Error("Firestore unavailable"));

    const gate = await withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
      checkOpenAiSpendGate()
    );
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe(OPENAI_BUDGET_UNAVAILABLE_CODE);
    expect(gate.reason).toMatch(/tracker unavailable/i);

    let billed = false;
    await expect(
      withOpenAiSpendContext({ uid: "user-1", ip: "203.0.113.10" }, () =>
        gateOpenAiCall(async () => {
          billed = true;
          return { text: "should never run" };
        })
      )
    ).rejects.toMatchObject({
      code: OPENAI_BUDGET_UNAVAILABLE_CODE,
      status: 503,
    });
    expect(billed).toBe(false);
  });

  it("skips billed OpenAI health pings when the spend tracker errors", async () => {
    __failOpenAiSpendingForTests(new Error("admin read failed"));
    const health = await withOpenAiSpendContext({ uid: null, ip: "203.0.113.10" }, () =>
      checkOpenAiHealth()
    );
    expect(health.configured).toBe(true);
    expect(health.ready).toBe(false);
    expect(health.issue).toBe("budget_exceeded");
  });

  it("skips billed OpenAI health pings when the budget is exceeded", async () => {
    process.env.OPENAI_DAILY_LIMIT_USD = "1";
    __setOpenAiSpendingForTests({ dailySpendUSD: 1 });
    const health = await withOpenAiSpendContext({ uid: null, ip: "203.0.113.10" }, () =>
      checkOpenAiHealth()
    );
    expect(health.configured).toBe(true);
    expect(health.ready).toBe(false);
    expect(health.issue).toBe("budget_exceeded");
  });
});
