import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Metrics collect auth helpers are inline in the route; we mirror the fail-closed contract here.
 */
function authorizeMetrics(authHeader: string | null, envKey: string | undefined): { status: number; error: string } | null {
  const key = envKey?.trim();
  if (!key) {
    return { status: 503, error: "Metrics unavailable" };
  }
  if (!authHeader || authHeader !== `Bearer ${key}`) {
    return { status: 401, error: "Unauthorized" };
  }
  return null;
}

describe("metrics collect fail-closed", () => {
  it("returns 503 when METRICS_API_KEY is unset", () => {
    const result = authorizeMetrics("Bearer undefined", undefined);
    expect(result?.status).toBe(503);
  });

  it("returns 503 when METRICS_API_KEY is empty", () => {
    const result = authorizeMetrics("Bearer secret", "  ");
    expect(result?.status).toBe(503);
  });

  it("rejects Bearer undefined when key is set", () => {
    const result = authorizeMetrics("Bearer undefined", "real-secret");
    expect(result?.status).toBe(401);
  });

  it("allows matching bearer token", () => {
    expect(authorizeMetrics("Bearer real-secret", "real-secret")).toBeNull();
  });
});
