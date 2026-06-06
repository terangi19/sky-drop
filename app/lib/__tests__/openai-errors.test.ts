import { describe, it, expect } from "vitest";
import { openaiErrorResponse } from "../openai-errors";

describe("openaiErrorResponse", () => {
  it("returns 401 for auth errors", () => {
    const result = openaiErrorResponse({ status: 401, message: "Invalid API key" });
    expect(result.status).toBe(401);
    expect(result.code).toBe("openai_auth_failed");
    expect(result.error).toContain("API key");
  });

  it("returns 429 with quota code for billing errors", () => {
    const result = openaiErrorResponse({
      status: 429,
      message: "You exceeded your current quota",
    });
    expect(result.status).toBe(429);
    expect(result.code).toBe("openai_quota_exceeded");
    expect(result.error).toContain("billing");
  });

  it("returns 429 with quota code for insufficient funds", () => {
    const result = openaiErrorResponse({
      status: 429,
      message: "insufficient credits",
    });
    expect(result.status).toBe(429);
    expect(result.code).toBe("openai_quota_exceeded");
  });

  it("returns 429 with rate_limit code for generic rate limits", () => {
    const result = openaiErrorResponse({
      status: 429,
      message: "Rate limit reached",
    });
    expect(result.status).toBe(429);
    expect(result.code).toBe("openai_rate_limit");
    expect(result.error).toContain("rate limit");
  });

  it("returns generic error for other status codes", () => {
    const result = openaiErrorResponse({ status: 500, message: "Internal error" });
    expect(result.status).toBe(500);
    expect(result.code).toBe("openai_error");
    expect(result.error).toBe("Internal error");
  });

  it("defaults to 500 for unknown/missing status", () => {
    const result = openaiErrorResponse({ message: "something went wrong" });
    expect(result.status).toBe(500);
    expect(result.code).toBe("openai_error");
  });

  it("defaults to 500 for non-error status codes", () => {
    const result = openaiErrorResponse({ status: 200, message: "ok" });
    expect(result.status).toBe(500);
  });

  it("handles completely unknown error objects", () => {
    const result = openaiErrorResponse("string error");
    expect(result.status).toBe(500);
    expect(result.code).toBe("openai_error");
  });

  it("falls back to default message when message is empty", () => {
    const result = openaiErrorResponse({ status: 503 });
    expect(result.error).toBe("OpenAI request failed");
  });
});
