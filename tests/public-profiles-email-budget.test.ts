import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  clearSellerProfileBatchCache,
  fetchPublicProfiles,
  fetchSellerProfilesByListing,
} from "../app/lib/fetch-seller-profiles";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  verifyIdToken: vi.fn(),
  getAll: vi.fn(),
  emailGets: [] as string[][],
}));

vi.mock("../app/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mocks.rateLimit(...args),
}));

vi.mock("../app/lib/firebase-admin", () => ({
  isAdminInitialized: () => true,
  verifyIdToken: (...args: unknown[]) => mocks.verifyIdToken(...args),
  getAdminDb: () => ({
    getAll: (...args: unknown[]) => mocks.getAll(...args),
    collection: () => ({
      doc: (id: string) => ({ id }),
      where: (_field: string, _op: string, values: string[]) => ({
        limit: () => ({
          get: async () => {
            mocks.emailGets.push(values);
            return { docs: [] };
          },
        }),
      }),
    }),
  }),
}));

import { POST } from "../app/api/public-profiles/route";

function call(body: unknown, authorization?: string) {
  return POST(
    new NextRequest("http://localhost/api/public-profiles", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify(body),
    })
  );
}

describe("public-profiles email budget", () => {
  beforeEach(() => {
    mocks.emailGets.length = 0;
    mocks.rateLimit.mockReset();
    mocks.verifyIdToken.mockReset();
    mocks.getAll.mockReset();
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 1, limit: 30 });
    mocks.verifyIdToken.mockResolvedValue({ uid: "uid-from-token" });
    mocks.getAll.mockImplementation(async (...refs: Array<{ id: string }>) =>
      refs.map((ref) => ({
        id: ref.id,
        exists: true,
        data: () => ({ username: "sky" }),
      }))
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns UID profiles and an empty email map when the uid budget is exhausted", async () => {
    mocks.rateLimit.mockImplementation(async (key: string) => {
      if (String(key).startsWith("public-profiles-email")) {
        return { allowed: false, remaining: 0, limit: 20 };
      }
      return { allowed: true, remaining: 1, limit: 30 };
    });

    const res = await call(
      { uids: ["uid-a"], emails: ["hidden@example.com"] },
      "Bearer token"
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.emailToUid).toEqual({});
    expect(json.profiles["uid-a"]?.username).toBe("sky");
    expect(mocks.emailGets).toEqual([]);
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      "public-profiles-email:uid-from-token",
      20,
      60_000
    );
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      "public-profiles-email-day:uid-from-token",
      300,
      86_400_000
    );
  });

  it("ignores the 21st email server-side", async () => {
    const emails = Array.from({ length: 21 }, (_, i) => `user${i}@example.com`);
    const res = await call({ uids: [], emails }, "Bearer token");
    expect(res.status).toBe(200);
    const queried = mocks.emailGets.flat();
    expect(queried).toHaveLength(20);
    expect(queried).toContain("user0@example.com");
    expect(queried).toContain("user19@example.com");
    expect(queried).not.toContain("user20@example.com");
    const json = await res.json();
    expect(json.emailToUid).toEqual({});
  });

  it("logs an enumeration warning when the daily budget is exceeded, without raw emails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.rateLimit.mockImplementation(async (key: string) => {
      if (String(key).includes("public-profiles-email-day")) {
        return { allowed: false, remaining: 0, limit: 300 };
      }
      return { allowed: true, remaining: 1, limit: 30 };
    });

    const res = await call(
      { uids: ["uid-a"], emails: ["hidden@example.com"] },
      "Bearer token"
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.emailToUid).toEqual({});
    expect(json.profiles["uid-a"]?.username).toBe("sky");
    const text = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(text).toContain("public_profiles_email_enumeration");
    expect(text).toContain("uid-from-token");
    expect(text).not.toContain("hidden@example.com");
    expect(text).not.toContain("@");
  });

  it("logs an enumeration warning when requested minus resolved exceeds 50", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emails = Array.from({ length: 51 }, (_, i) => `probe${i}@example.com`);
    await call({ emails }, "Bearer token");
    const text = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(text).toContain("public_profiles_email_enumeration");
    expect(text).toContain('"requested":51');
    expect(text).toContain('"resolved":0');
    expect(text).not.toContain("probe0@example.com");
    expect(mocks.emailGets.flat()).toHaveLength(20);
  });

  it("does not emit the enumeration event for a gap of 50", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emails = Array.from({ length: 50 }, (_, i) => `probe${i}@example.com`);
    await call({ emails }, "Bearer token");
    const text = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(text).not.toContain("public_profiles_email_enumeration");
    expect(text).toContain('"requested":50');
    expect(text).toContain('"resolved":0');
    expect(text).not.toContain("@");
  });

  it("keeps unauthenticated callers on UID lookups only", async () => {
    const res = await call({
      uids: ["uid-a"],
      emails: ["hidden@example.com"],
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.emailToUid).toEqual({});
    expect(json.profiles["uid-a"]?.username).toBe("sky");
    expect(mocks.emailGets).toEqual([]);
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
    const emailLimits = mocks.rateLimit.mock.calls.filter((c) =>
      String(c[0]).startsWith("public-profiles-email")
    );
    expect(emailLimits).toHaveLength(0);
  });

  it("does not put raw emails in the log helper", () => {
    const file = readFileSync(
      path.join(process.cwd(), "app/api/public-profiles/route.ts"),
      "utf8"
    );
    const start = file.indexOf("function warnEmailLookupStats");
    const end = file.indexOf("export async function POST");
    const fn = file.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(fn).toContain("public_profiles_email_enumeration");
    expect(fn).toContain("requested - resolved > 50");
    expect(fn).not.toMatch(/emails|emailToUid|@/);
    expect(file.replace(fn, "")).not.toContain("console.warn");
    expect(file).toContain("const decoded = await verifyIdToken");
    expect(file).toContain("decoded.uid");
    expect(file).toContain("const MAX_EMAILS = 20");
    expect(file).toContain("public-profiles-email:${callerUid}");
    expect(file).toContain("public-profiles-email-day:${callerUid}");
  });
});

describe("public profile client email chunker", () => {
  beforeEach(() => {
    clearSellerProfileBatchCache();
  });

  afterEach(() => {
    clearSellerProfileBatchCache();
    vi.unstubAllGlobals();
  });

  it("sends 45 emails as 3 requests and merges the responses", async () => {
    const emails = Array.from({ length: 45 }, (_, i) => `user${i}@example.com`);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as {
        emails?: string[];
        uids?: string[];
      };
      const profiles: Record<string, { uid: string; username: string }> = {};
      const emailToUid: Record<string, string> = {};
      for (const email of body.emails || []) {
        const uid = `uid-${email}`;
        emailToUid[email] = uid;
        profiles[uid] = { uid, username: email.split("@")[0] };
      }
      return {
        ok: true,
        json: async () => ({ profiles, emailToUid }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const map = await fetchPublicProfiles(emails);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls
      .map((call) => {
        const body = JSON.parse(String(call[1]?.body || "{}")) as { emails?: string[] };
        return (body.emails || []).length;
      })
      .sort((a, b) => a - b);
    expect(sizes).toEqual([5, 20, 20]);
    for (const email of emails) {
      expect(map.get(email)?.uid).toBe(`uid-${email}`);
    }
  });

  it("attaches UIDs to the first email chunk only", async () => {
    const emails = Array.from({ length: 45 }, (_, i) => `user${i}@example.com`);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ profiles: {}, emailToUid: {} }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSellerProfilesByListing([
      { sellerId: "uid-keep" },
      ...emails.map((sellerEmail) => ({ sellerEmail })),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map(
      (call) => JSON.parse(String(call[1]?.body || "{}")) as { uids?: string[]; emails?: string[] }
    );
    const withUid = bodies.filter((body) => (body.uids || []).includes("uid-keep"));
    expect(withUid).toHaveLength(1);
    expect(bodies.reduce((sum, body) => sum + (body.emails || []).length, 0)).toBe(45);
  });
});
