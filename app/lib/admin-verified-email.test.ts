import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** PROMPT-14: server admin decisions only trust a verified email; legacy uid record still counts. */
const legacyAdmins = new Set<string>();
const roleEmails = new Set<string>();

vi.mock("./firebase-admin", () => ({
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (name === "admin-users") {
            return { exists: legacyAdmins.has(id), data: () => ({ role: "admin" }) };
          }
          if (name === "config" && id === "adminRoles") {
            return { exists: true, data: () => ({ admins: [...roleEmails].map((email) => ({ email })) }) };
          }
          return { exists: false, data: () => undefined };
        },
      }),
    }),
  }),
}));

async function load() {
  vi.resetModules();
  return import("./admin-check.server");
}

describe("verified-email admin helpers", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
    legacyAdmins.clear();
    roleEmails.clear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("verifiedTokenEmail returns the email only when email_verified === true", async () => {
    const { verifiedTokenEmail } = await load();
    expect(verifiedTokenEmail({ email: "Boss@Example.com", email_verified: true })).toBe("boss@example.com");
    expect(verifiedTokenEmail({ email: "boss@example.com", email_verified: false })).toBeNull();
    expect(verifiedTokenEmail({ email: "boss@example.com" })).toBeNull();
    expect(verifiedTokenEmail({ email: "", email_verified: true })).toBeNull();
    expect(verifiedTokenEmail(null)).toBeNull();
  });

  it("isAdminEmailToken: ADMIN_EMAILS match needs a verified email", async () => {
    const { isAdminEmailToken } = await load();
    expect(isAdminEmailToken({ uid: "u", email: "boss@example.com", email_verified: true })).toBe(true);
    expect(isAdminEmailToken({ uid: "u", email: "boss@example.com", email_verified: false })).toBe(false);
    expect(isAdminEmailToken({ uid: "u", email: "boss@example.com" })).toBe(false);
    expect(isAdminEmailToken({ uid: "u", email: "user@example.com", email_verified: true })).toBe(false);
  });

  it("isAdminToken: env and config/adminRoles emails need verification", async () => {
    roleEmails.add("support@example.com");
    const { isAdminToken } = await load();
    expect(await isAdminToken({ uid: "a", email: "boss@example.com", email_verified: true })).toBe(true);
    expect(await isAdminToken({ uid: "a", email: "boss@example.com", email_verified: false })).toBe(false);
    expect(await isAdminToken({ uid: "b", email: "support@example.com", email_verified: true })).toBe(true);
    expect(await isAdminToken({ uid: "b", email: "support@example.com", email_verified: false })).toBe(false);
    expect(await isAdminToken({ uid: "c", email: "user@example.com", email_verified: true })).toBe(false);
    expect(await isAdminToken(null)).toBe(false);
  });

  it("isAdminToken: legacy admin-users/{uid} still counts without a verified email", async () => {
    legacyAdmins.add("legacy-uid");
    const { isAdminToken } = await load();
    expect(await isAdminToken({ uid: "legacy-uid", email: "x@example.com", email_verified: false })).toBe(true);
    expect(await isAdminToken({ uid: "legacy-uid" })).toBe(true);
    expect(await isAdminToken({ uid: "other-uid", email_verified: false })).toBe(false);
  });
});
