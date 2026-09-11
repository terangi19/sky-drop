import { describe, expect, it } from "vitest";
import { formatUpstashErrorForLog } from "./rate-limit-upstash";

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
