import { describe, expect, it } from "vitest";
import { openaiErrorResponse } from "./openai-errors";
import {
  OPENAI_BUDGET_EXCEEDED_CODE,
  OPENAI_BUDGET_UNAVAILABLE_CODE,
  OPENAI_DISABLED_CODE,
  OpenAiSpendBlockedError,
} from "./openai-spend-guard";

describe("openaiErrorResponse spend-gate codes", () => {
  it("maps openai_budget_unavailable (tracker error, fail-closed) to 503 with its own code", () => {
    const err = new OpenAiSpendBlockedError({
      allowed: false,
      code: OPENAI_BUDGET_UNAVAILABLE_CODE,
      reason: "OpenAI spend tracker unavailable",
      userMessage:
        "Āwhina AI is in limited mode because spend tracking is unavailable. You can keep using the app without AI.",
    });
    const mapped = openaiErrorResponse(err);
    expect(mapped.status).toBe(503);
    expect(mapped.code).toBe("openai_budget_unavailable");
    expect(mapped.error).toMatch(/spend tracking is unavailable/i);
  });

  it("uses a safe default message for a duck-typed unavailable error without leaking internals", () => {
    const mapped = openaiErrorResponse({
      code: "openai_budget_unavailable",
      message: undefined,
      reason: "Firestore admin not initialized: projects/secret-project",
    });
    expect(mapped.status).toBe(503);
    expect(mapped.code).toBe("openai_budget_unavailable");
    expect(JSON.stringify(mapped)).not.toMatch(/firestore|secret-project|admin/i);
  });

  it("never returns the internal reason for any spend-gate code", () => {
    for (const code of [
      OPENAI_BUDGET_EXCEEDED_CODE,
      OPENAI_BUDGET_UNAVAILABLE_CODE,
      OPENAI_DISABLED_CODE,
    ]) {
      const mapped = openaiErrorResponse({ code, reason: "INTERNAL-REASON-XYZ" });
      expect(mapped.status).toBe(503);
      expect(mapped.code).toBe(code);
      expect(JSON.stringify(mapped)).not.toContain("INTERNAL-REASON-XYZ");
    }
  });

  it("leaves exceeded/disabled mappings and generic errors unchanged", () => {
    expect(openaiErrorResponse({ code: "openai_budget_exceeded" })).toMatchObject({
      status: 503,
      code: "openai_budget_exceeded",
    });
    expect(openaiErrorResponse({ code: "openai_disabled" })).toMatchObject({
      status: 503,
      code: "openai_disabled",
    });
    expect(openaiErrorResponse(new Error("boom"))).toMatchObject({
      status: 500,
      code: "openai_error",
    });
    expect(openaiErrorResponse({ status: 429, message: "slow down" })).toMatchObject({
      status: 429,
      code: "openai_rate_limit",
    });
  });
});
