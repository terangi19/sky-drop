import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `isAdminEmail` is imported by client components (Navbar, profile, assistant), so its
 * "ADMIN_EMAILS is not set" warning used to print in every visitor's browser console on every
 * call. Authorization result must not change; the warning is server-only and once-only.
 */
async function load() {
  vi.resetModules();
  return (await import("./admin-check")).isAdminEmail;
}

describe("isAdminEmail", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  it("authorization is unchanged: env list match is case-insensitive, others are not admin", async () => {
    vi.stubEnv("ADMIN_EMAILS", "Boss@Example.com, second@example.com");
    const isAdminEmail = await load();
    expect(isAdminEmail("boss@example.com")).toBe(true);
    expect(isAdminEmail("SECOND@example.com")).toBe(true);
    expect(isAdminEmail("user@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("server: unset ADMIN_EMAILS -> false, warns exactly once", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    const isAdminEmail = await load();
    expect(isAdminEmail("boss@example.com")).toBe(false);
    expect(isAdminEmail("boss@example.com")).toBe(false);
    expect(isAdminEmail("other@example.com")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("ADMIN_EMAILS is not set");
  });

  it("browser (window defined): unset ADMIN_EMAILS -> false and never logs", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubGlobal("window", {});
    const isAdminEmail = await load();
    for (let i = 0; i < 5; i++) expect(isAdminEmail("boss@example.com")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("non-production: no warning", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_EMAILS", "");
    const isAdminEmail = await load();
    expect(isAdminEmail("boss@example.com")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
