import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, limit: 1 })),
  isAdminEmail: vi.fn((e?: string) => e === "admin@test.com"),
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("../../lib/firebase-admin", () => ({ verifyIdToken: h.verifyIdToken }));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: h.rateLimit }));
vi.mock("../../lib/admin-check", () => ({ isAdminEmail: h.isAdminEmail }));
vi.mock("../../lib/email-transport", () => ({ sendEmail: h.sendEmail }));

import { POST as notifPOST } from "./route";
import { POST as sendEmailPOST } from "../send-email/route";

function req(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const HOSTILE = "a@" + ".".repeat(1_000_000) + "@";

beforeEach(() => {
  vi.clearAllMocks();
  h.verifyIdToken.mockResolvedValue({ uid: "u1", email: "user@test.com" });
});

describe("send-notification-email: recipient format check is bounded", () => {
  it("rejects a 1M-char hostile recipient with 400 in < 50 ms and sends nothing", async () => {
    const t = performance.now();
    const res = await notifPOST(req("http://x/api/send-notification-email", { to: HOSTILE, subject: "s", text: "t" }));
    const ms = performance.now() - t;
    expect(res.status).toBe(400);
    // Validator itself is < 50 ms (app/lib/email-format.test.ts); 250 ms covers parsing the 1 MB body.
    // The old regex took minutes on this input.
    expect(ms).toBeLessThan(250);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("still accepts a normal self-addressed notification", async () => {
    const res = await notifPOST(
      req("http://x/api/send-notification-email", { to: "user@test.com", subject: "s", text: "hello" })
    );
    expect(res.status).toBe(200);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("still forbids a non-admin sending to someone else", async () => {
    const res = await notifPOST(
      req("http://x/api/send-notification-email", { to: "other@test.com", subject: "s", text: "hello" })
    );
    expect(res.status).toBe(403);
  });
});

describe("send-email: admin gate runs before the body is validated", () => {
  it("a non-admin gets 403 even with a hostile recipient", async () => {
    const res = await sendEmailPOST(req("http://x/api/send-email", { to: HOSTILE, subject: "s", html: "<p>x</p>" }));
    expect(res.status).toBe(403);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("an admin with a hostile recipient gets 400 quickly", async () => {
    h.verifyIdToken.mockResolvedValue({ uid: "a1", email: "admin@test.com" });
    const res = await sendEmailPOST(req("http://x/api/send-email", { to: HOSTILE, subject: "s", html: "<p>x</p>" }));
    expect(res.status).toBe(400);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("an admin with a valid recipient still sends", async () => {
    h.verifyIdToken.mockResolvedValue({ uid: "a1", email: "admin@test.com" });
    const res = await sendEmailPOST(req("http://x/api/send-email", { to: "x@y.co", subject: "s", html: "<p>x</p>" }));
    expect(res.status).toBe(200);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });
});
