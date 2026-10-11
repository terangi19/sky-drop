import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetOpenAiSpendingForTests,
  __setOpenAiSpendingForTests,
  calculateCost,
  checkSpendingLimits,
  getCurrentSpending,
  resolveModelPricing,
  WHISPER_TOKENS_PER_SECOND,
} from "./openai-spending";
import {
  WHISPER_ASSUMED_BYTES_PER_SECOND,
  WHISPER_UNKNOWN_SIZE_SECONDS,
  createGatedOpenAI,
  estimateTranscriptionUsage,
  withOpenAiSpendContext,
} from "./openai-spend-guard";

const ENV_KEYS = [
  "OPENAI_ENABLED",
  "OPENAI_DAILY_LIMIT_USD",
  "OPENAI_MONTHLY_LIMIT_USD",
  "OPENAI_PER_USER_DAILY_TOKENS",
  "OPENAI_PER_USER_MONTHLY_TOKENS",
  "OPENAI_PER_IP_DAILY_REQUESTS",
] as const;
const snap: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  __resetOpenAiSpendingForTests();
  delete process.env.OPENAI_ENABLED;
  process.env.OPENAI_DAILY_LIMIT_USD = "50";
  process.env.OPENAI_MONTHLY_LIMIT_USD = "1000";
  process.env.OPENAI_PER_USER_DAILY_TOKENS = "100000";
  process.env.OPENAI_PER_USER_MONTHLY_TOKENS = "1000000";
  process.env.OPENAI_PER_IP_DAILY_REQUESTS = "50";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
  __resetOpenAiSpendingForTests();
});

describe("model pricing (ESTIMATE list prices)", () => {
  it("keeps the explicit prices of the default models unchanged", () => {
    expect(calculateCost("gpt-4o-mini", 1_000_000, 1_000_000)).toBeCloseTo(0.15 + 0.6, 10);
    expect(calculateCost("gpt-4o", 1_000_000, 1_000_000)).toBeCloseTo(2.5 + 10, 10);
    expect(resolveModelPricing("gpt-4o-mini").known).toBe(true);
    expect(resolveModelPricing("gpt-4o").known).toBe(true);
    expect(resolveModelPricing("whisper-1").known).toBe(true);
  });

  it("prices unknown models at the highest known chat rate, never cheaper than gpt-4o", () => {
    const unknown = resolveModelPricing("gpt-99-turbo-ultra");
    expect(unknown.known).toBe(false);
    expect(calculateCost("gpt-99-turbo-ultra", 1_000_000, 1_000_000)).toBeCloseTo(12.5, 10);
    expect(calculateCost("gpt-99-turbo-ultra", 1000, 1000)).toBeGreaterThanOrEqual(
      calculateCost("gpt-4o", 1000, 1000)
    );
    expect(calculateCost("gpt-99-turbo-ultra", 1000, 1000)).toBeGreaterThan(
      calculateCost("gpt-4o-mini", 1000, 1000)
    );
    // Empty / missing model is unknown too (conservative), not the cheap model.
    expect(calculateCost("", 1000, 0)).toBe(calculateCost("gpt-4o", 1000, 0));
    expect(resolveModelPricing(undefined).known).toBe(false);
  });

  it("treats dated snapshots and case variants of known models as that model", () => {
    expect(resolveModelPricing("gpt-4o-2024-08-06")).toMatchObject({ known: true, input: 0.0000025 });
    expect(resolveModelPricing("gpt-4o-mini-2024-07-18")).toMatchObject({
      known: true,
      input: 0.00000015,
    });
    expect(resolveModelPricing("GPT-4o-Mini")).toMatchObject({ known: true, input: 0.00000015 });
    // Not a "-" boundary: must not be mistaken for a known model.
    expect(resolveModelPricing("gpt-4oo").known).toBe(false);
    expect(resolveModelPricing("gpt-4o-minimal-x")).toMatchObject({ known: true, input: 0.0000025 });
  });
});

describe("whisper-1 spend estimate (ESTIMATE, conservative)", () => {
  it("maps file size to seconds at about 64 kbps and to synthetic tokens", () => {
    const usage = estimateTranscriptionUsage({
      file: { size: WHISPER_ASSUMED_BYTES_PER_SECOND * 20 },
    });
    expect(usage).toEqual({
      model: "whisper-1",
      inputTokens: 20 * WHISPER_TOKENS_PER_SECOND,
      outputTokens: 0,
    });
    // $0.006 / minute => 20 s = $0.002
    expect(calculateCost("whisper-1", usage.inputTokens, 0)).toBeCloseTo(0.002, 8);
  });

  it("charges at least 1 s and a 60 s default when size is unknown", () => {
    expect(estimateTranscriptionUsage({ file: { size: 10 } }).inputTokens).toBe(
      WHISPER_TOKENS_PER_SECOND
    );
    for (const body of [undefined, null, {}, { file: {} }, { file: { size: "x" } }, { file: { size: 0 } }]) {
      expect(estimateTranscriptionUsage(body).inputTokens).toBe(
        WHISPER_UNKNOWN_SIZE_SECONDS * WHISPER_TOKENS_PER_SECOND
      );
    }
    expect(calculateCost("whisper-1", WHISPER_UNKNOWN_SIZE_SECONDS * WHISPER_TOKENS_PER_SECOND, 0)).toBeCloseTo(
      0.006,
      8
    );
  });

  it("createGatedOpenAI records a transcription against the dollar budget and the per-user cap", async () => {
    __setOpenAiSpendingForTests({ dailySpendUSD: 0, monthlySpendUSD: 0 });
    const fetchStub = (async () =>
      new Response(JSON.stringify({ text: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const client = createGatedOpenAI({ apiKey: "sk-test-not-real", fetch: fetchStub, maxRetries: 0 });
    const file = new File([new Uint8Array(WHISPER_ASSUMED_BYTES_PER_SECOND * 30)], "a.webm", {
      type: "audio/webm",
    });

    const result = await withOpenAiSpendContext({ uid: "u1", ip: "203.0.113.9" }, () =>
      client.audio.transcriptions.create({ file, model: "whisper-1" })
    );
    expect(result.text).toBe("hello");

    const spent = await getCurrentSpending();
    expect(spent.dailySpendUSD).toBeCloseTo(0.003, 8); // 30 s * $0.0001
    expect(spent.monthlySpendUSD).toBeCloseTo(0.003, 8);

    const used = 30 * WHISPER_TOKENS_PER_SECOND;
    // Per-user token cap sees exactly the estimate: cap == used blocks, cap == used + 1 allows.
    process.env.OPENAI_PER_USER_DAILY_TOKENS = String(used);
    expect((await checkSpendingLimits("u1", "198.51.100.1")).allowed).toBe(false);
    process.env.OPENAI_PER_USER_DAILY_TOKENS = String(used + 1);
    expect((await checkSpendingLimits("u1", "198.51.100.1")).allowed).toBe(true);
    // Per-IP request counter incremented once.
    process.env.OPENAI_PER_IP_DAILY_REQUESTS = "1";
    expect((await checkSpendingLimits("other", "203.0.113.9")).allowed).toBe(false);
  });

  it("eventually blocks a user whose transcriptions exhaust the per-user token cap", async () => {
    process.env.OPENAI_PER_USER_DAILY_TOKENS = String(100 * WHISPER_TOKENS_PER_SECOND);
    __setOpenAiSpendingForTests({
      dailySpendUSD: 0,
      monthlySpendUSD: 0,
      userDailyTokens: { u2: 100 * WHISPER_TOKENS_PER_SECOND },
    });
    const gate = await checkSpendingLimits("u2", "203.0.113.10");
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/token limit/i);
  });
});
