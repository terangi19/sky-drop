import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioural tests for createSkyDropAccount's Turnstile handling (M7 signup
 * follow-up). The Turnstile token is single-use, so:
 *  - local checks (password strength, username, disposable email) must run BEFORE
 *    the token is sent for verification, and must NOT report it as spent;
 *  - once the token is sent, onTurnstileSpent must have fired, so the page can
 *    remount the widget when a later step (email-already-in-use, etc.) fails.
 * Firebase is mocked; no network.
 */
const createUser = vi.fn();
vi.mock("./firebase", () => ({ auth: {}, db: {} }));
vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: (...args: unknown[]) => createUser(...args),
  deleteUser: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  runTransaction: vi.fn(async () => "user_name"),
  serverTimestamp: vi.fn(),
  Timestamp: { now: vi.fn() },
}));

import { createSkyDropAccount } from "./create-account.client";

const fetchMock = vi.fn();
const GOOD = { email: "person@example.com", password: "Str0ngPass!word", turnstileToken: "tok" };

function routeFetch(opts: { disposable?: boolean; turnstileOk?: boolean } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    const body = (data: unknown, ok = true, status = 200) => ({
      ok,
      status,
      json: async () => data,
    });
    if (url === "/api/check-email-temp") return body({ disposable: !!opts.disposable });
    if (url === "/api/verify-turnstile") return body({ success: opts.turnstileOk !== false });
    return body({});
  });
}

const urlsCalled = () => fetchMock.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  createUser.mockReset();
  routeFetch();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createSkyDropAccount Turnstile token handling", () => {
  it("rejects a weak password without verifying or spending the token", async () => {
    const spent = vi.fn();
    await expect(
      createSkyDropAccount({ ...GOOD, password: "abc", onTurnstileSpent: spent })
    ).rejects.toThrow("Password must be at least 8 characters");
    expect(spent).not.toHaveBeenCalled();
    expect(urlsCalled()).not.toContain("/api/verify-turnstile");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects a disposable email without verifying or spending the token", async () => {
    routeFetch({ disposable: true });
    const spent = vi.fn();
    await expect(createSkyDropAccount({ ...GOOD, onTurnstileSpent: spent })).rejects.toThrow(
      "Temporary email addresses aren't allowed. Use a permanent email."
    );
    expect(spent).not.toHaveBeenCalled();
    expect(urlsCalled()).not.toContain("/api/verify-turnstile");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid username without verifying or spending the token", async () => {
    const spent = vi.fn();
    await expect(
      createSkyDropAccount({ ...GOOD, username: "1bad name!", onTurnstileSpent: spent })
    ).rejects.toThrow();
    expect(spent).not.toHaveBeenCalled();
    expect(urlsCalled()).not.toContain("/api/verify-turnstile");
  });

  it("marks the token spent BEFORE sending it, and still blocks account creation when verify fails", async () => {
    routeFetch({ turnstileOk: false });
    const order: string[] = [];
    const spent = vi.fn(() => order.push("spent"));
    fetchMock.mockImplementation(async (url: string) => {
      order.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () =>
          url === "/api/verify-turnstile" ? { success: false } : { disposable: false },
      };
    });
    await expect(createSkyDropAccount({ ...GOOD, onTurnstileSpent: spent })).rejects.toThrow(
      "Security check failed. Please try again."
    );
    expect(order.indexOf("spent")).toBeGreaterThan(-1);
    expect(order.indexOf("spent")).toBeLessThan(order.indexOf("/api/verify-turnstile"));
    expect(createUser).not.toHaveBeenCalled();
  });

  it("email-already-in-use after verify: token reported spent, error propagates for signupAuthError", async () => {
    createUser.mockRejectedValue(Object.assign(new Error("exists"), { code: "auth/email-already-in-use" }));
    const spent = vi.fn();
    await expect(createSkyDropAccount({ ...GOOD, onTurnstileSpent: spent })).rejects.toMatchObject({
      code: "auth/email-already-in-use",
    });
    expect(spent).toHaveBeenCalledTimes(1);
    expect(urlsCalled()).toContain("/api/verify-turnstile");
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it("every attempt still verifies the token it is given (no caching / skipping)", async () => {
    createUser.mockRejectedValue(Object.assign(new Error("exists"), { code: "auth/email-already-in-use" }));
    await createSkyDropAccount({ ...GOOD, turnstileToken: "first" }).catch(() => {});
    await createSkyDropAccount({ ...GOOD, turnstileToken: "second" }).catch(() => {});
    const bodies = fetchMock.mock.calls
      .filter((c) => c[0] === "/api/verify-turnstile")
      .map((c) => JSON.parse((c[1] as { body: string }).body).token);
    expect(bodies).toEqual(["first", "second"]);
  });

  it("without a site key (dev) nothing is fetched for Turnstile and signup proceeds", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    createUser.mockRejectedValue(Object.assign(new Error("exists"), { code: "auth/email-already-in-use" }));
    await createSkyDropAccount({ ...GOOD, turnstileToken: "" }).catch(() => {});
    expect(urlsCalled()).not.toContain("/api/verify-turnstile");
    expect(createUser).toHaveBeenCalledTimes(1);
  });
});
