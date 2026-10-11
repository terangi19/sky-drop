import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** PROMPT-14: requireAdminFromRequest (every /api/admin/* route) rejects an unverified listed email. */
const verifyIdToken = vi.fn();
vi.mock("./firebase-admin", () => ({
  verifyIdToken: (t: string) => verifyIdToken(t),
  getAdminDb: () => ({
    collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) }),
  }),
}));
vi.mock("./rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, limit: 10 })) }));
vi.mock("./security-log", () => ({ logSecurityWarning: vi.fn(async () => {}) }));

function req() {
  return new NextRequest("http://localhost/api/admin/users", { headers: { authorization: "Bearer tok" } });
}

describe("requireAdminFromRequest with verified-email admin", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
    verifyIdToken.mockReset();
  });

  it("verified listed email passes", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1", email: "boss@example.com", email_verified: true });
    const { requireAdminFromRequest } = await import("./admin-request");
    await expect(requireAdminFromRequest(req())).resolves.toMatchObject({ uid: "u1" });
  });

  it("unverified listed email gets 403", async () => {
    verifyIdToken.mockResolvedValue({ uid: "squatter", email: "boss@example.com", email_verified: false });
    const { requireAdminFromRequest, AdminAuthError } = await import("./admin-request");
    const err = await requireAdminFromRequest(req()).catch((e) => e);
    expect(err).toBeInstanceOf(AdminAuthError);
    expect(err.status).toBe(403);
  });

  it("token without email_verified gets 403", async () => {
    verifyIdToken.mockResolvedValue({ uid: "squatter", email: "boss@example.com" });
    const { requireAdminFromRequest } = await import("./admin-request");
    const err = await requireAdminFromRequest(req()).catch((e) => e);
    expect(err.status).toBe(403);
  });

  it("missing bearer token stays 401", async () => {
    const { requireAdminFromRequest } = await import("./admin-request");
    const err = await requireAdminFromRequest(new NextRequest("http://localhost/api/admin/users")).catch((e) => e);
    expect(err.status).toBe(401);
  });
});
