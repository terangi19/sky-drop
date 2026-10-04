import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminDb, getAdminAuth, verifyIdToken } = vi.hoisted(() => ({
  getAdminDb: vi.fn(),
  getAdminAuth: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("../app/lib/firebase-admin", () => ({
  getAdminDb,
  getAdminAuth,
  verifyIdToken,
  isAdminInitialized: () => false,
}));

import { POST } from "../app/api/check-email-temp/route";

function checkEmail(email: unknown, ip: string, rawBody?: string) {
  const body = rawBody ?? JSON.stringify({ email });
  return POST(
    new NextRequest("http://localhost/api/check-email-temp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body,
    })
  );
}

describe("check-email-temp", () => {
  beforeAll(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", "");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
  });

  beforeEach(() => {
    getAdminDb.mockClear();
    getAdminAuth.mockClear();
    verifyIdToken.mockClear();
  });

  it("T1 returns the same body and status for any local-part on a domain and never calls Auth or Firestore", async () => {
    const registered = await checkEmail("registered.user@gmail.com", "198.51.100.1");
    const unregistered = await checkEmail("nobody.else@gmail.com", "198.51.100.1");

    const registeredBody = await registered.json();
    const unregisteredBody = await unregistered.json();
    expect(registered.status).toBe(unregistered.status);
    expect(registered.status).toBe(200);
    expect(registeredBody).toEqual(unregisteredBody);
    expect(registeredBody).toEqual({ disposable: false });

    const disposableA = await checkEmail("registered.user@mailinator.com", "198.51.100.3");
    const disposableB = await checkEmail("nobody.else@mailinator.com", "198.51.100.3");
    const disposableBody = await disposableA.json();
    expect(disposableA.status).toBe(disposableB.status);
    expect(disposableBody).toEqual(await disposableB.json());
    expect(disposableBody).toEqual({ disposable: true });

    expect(getAdminDb).not.toHaveBeenCalled();
    expect(getAdminAuth).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();

    const src = readFileSync(
      path.resolve(__dirname, "../app/api/check-email-temp/route.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/firebase-admin|getAdminDb|getAdminAuth|verifyIdToken|collection\(/);
  });

  it("T3 rejects non-JSON, missing, overlong, and local-part-less emails with 400 and no error text", async () => {
    const cases = [
      { ip: "198.51.100.31", rawBody: "not-json" },
      { ip: "198.51.100.32", rawBody: "{" },
      { ip: "198.51.100.33", body: {} },
      { ip: "198.51.100.34", body: { email: "" } },
      { ip: "198.51.100.35", body: { email: `${"a".repeat(300)}@x.com` } },
      { ip: "198.51.100.36", body: { email: "@x.com" } },
    ];

    for (const item of cases) {
      const res =
        "rawBody" in item
          ? await checkEmail(undefined, item.ip, item.rawBody)
          : await checkEmail(item.body.email, item.ip);
      const text = await res.text();
      expect(res.status, text).toBe(400);
      expect(text).toBe(JSON.stringify({ error: "Email is required" }));
      expect(text).not.toMatch(/stack|SyntaxError|Unexpected|at\s+\//i);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("T4 returns 429 on the 16th request from the same IP within 60s", async () => {
    const ip = "198.51.100.40";
    for (let n = 1; n <= 15; n++) {
      const res = await checkEmail(`user${n}@gmail.com`, ip);
      expect(res.status, `request ${n}`).toBe(200);
      expect(await res.json()).toEqual({ disposable: false });
    }
    const blocked = await checkEmail("user16@gmail.com", ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.text()).toBe(JSON.stringify({ error: "Too many requests" }));
    expect(blocked.headers.get("cache-control")).toBe("no-store");
  });
});
