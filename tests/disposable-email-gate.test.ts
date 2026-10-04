import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock, getAdminDbMock, getAdminStorageMock, setMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getAdminDbMock: vi.fn(),
  getAdminStorageMock: vi.fn(),
  setMock: vi.fn(async () => undefined),
}));

vi.mock("../app/lib/firebase-admin", () => ({
  isAdminInitialized: () => true,
  verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
  getAdminDb: (...args: unknown[]) => getAdminDbMock(...args),
  getAdminStorage: (...args: unknown[]) => getAdminStorageMock(...args),
  getServerDb: () => {
    throw new Error("getServerDb should not run in this test");
  },
}));

vi.mock("../app/lib/csrf", () => {
  class CsrfError extends Error {
    constructor(message = "CSRF token validation failed") {
      super(message);
      this.name = "CsrfError";
    }
  }
  return {
    CsrfError,
    requireCsrf: async () => {},
  };
});

vi.mock("../app/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 1, limit: 10 }),
}));

vi.mock("../app/lib/abuse-decision-engine", () => ({
  decide: async () => ({
    verdict: "allow",
    delayMs: 0,
    captchaRequired: false,
    shadowRank: "normal",
  }),
  applyDecisionDelay: async () => {},
  persistRiskFlag: async () => {},
  recordTurnstileAttempt: () => {},
}));

import { POST as createListing } from "../app/api/create-listing/route";
import { POST as submitKyc } from "../app/api/submit-kyc/route";
import { POST as sendVerificationEmail } from "../app/api/send-verification-email/route";

const DISPOSABLE_ERROR = "Temporary email addresses aren't allowed. Use a permanent email.";

function token(email: string, emailVerified: boolean) {
  verifyIdTokenMock.mockResolvedValue({
    uid: "user-1",
    email,
    email_verified: emailVerified,
    auth_time: Math.floor(Date.now() / 1000) - 86_400,
  });
}

function listingRequest() {
  return new NextRequest("http://localhost/api/create-listing", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.50",
    },
    body: JSON.stringify({}),
  });
}

function kycRequest() {
  return new NextRequest("http://localhost/api/submit-kyc", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "x-forwarded-for": "203.0.113.51",
    },
    body: new FormData(),
  });
}

function verificationRequest(email: string) {
  return new NextRequest("http://localhost/api/send-verification-email", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.52",
    },
    body: JSON.stringify({ email }),
  });
}

describe("server-side disposable email gate", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    getAdminDbMock.mockReset();
    getAdminStorageMock.mockReset();
    setMock.mockClear();
    getAdminDbMock.mockReturnValue({
      collection: () => ({
        doc: () => ({ set: setMock }),
      }),
    });
  });

  it("T5 create-listing returns 403 for a verified disposable email and still validates gmail", async () => {
    token("x@mailinator.com", true);
    const blocked = await createListing(listingRequest());
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: DISPOSABLE_ERROR });
    expect(getAdminDbMock).not.toHaveBeenCalled();

    token("x@gmail.com", true);
    const allowed = await createListing(listingRequest());
    expect(allowed.status).toBe(400);
    const body = await allowed.json();
    expect(body.error).toBe("Title must be at least 3 characters");
    expect(String(body.error)).not.toMatch(/Temporary email/i);

    token("x@gmail.com", false);
    const unverified = await createListing(listingRequest());
    expect(unverified.status).toBe(403);
    expect(await unverified.json()).toEqual({
      error: "Please verify your email before creating a listing",
    });
  });

  it("T5 submit-kyc returns 403 for a verified disposable email and still asks gmail for a photo", async () => {
    token("x@mailinator.com", true);
    const blocked = await submitKyc(kycRequest());
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: DISPOSABLE_ERROR });
    expect(getAdminDbMock).not.toHaveBeenCalled();
    expect(getAdminStorageMock).not.toHaveBeenCalled();

    token("x@gmail.com", true);
    const allowed = await submitKyc(kycRequest());
    expect(allowed.status).toBe(400);
    expect(await allowed.json()).toEqual({ error: "Choose a photo to upload." });

    token("x@gmail.com", false);
    const unverified = await submitKyc(kycRequest());
    expect(unverified.status).toBe(403);
    const unverifiedBody = await unverified.json();
    expect(unverifiedBody.code).toBe("email_not_verified");
    expect(unverifiedBody.error).toMatch(/Verify your email/);
  });

  it("does not send Sky Drop verification mail to a disposable inbox", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      token("x@mailinator.com", true);
      const blocked = await sendVerificationEmail(verificationRequest("x@mailinator.com"));
      expect(blocked.status).toBe(403);
      expect(await blocked.json()).toEqual({ error: DISPOSABLE_ERROR });
      expect(setMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();

      token("x@gmail.com", true);
      const allowed = await sendVerificationEmail(verificationRequest("x@gmail.com"));
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toEqual({ success: true });
      expect(setMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
