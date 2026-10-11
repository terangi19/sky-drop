import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  isAdminInitialized: vi.fn(() => true),
  enforceProtection: vi.fn(async (..._args: unknown[]) => ({ allowed: true, blocked: false })),
  add: vi.fn(async () => ({ id: "post-1" })),
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }));
vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: h.verifyIdToken,
  isAdminInitialized: h.isAdminInitialized,
  getAdminDb: () => ({ collection: () => ({ add: h.add }) }),
}));
vi.mock("../../lib/enforce-protection", () => ({ enforceProtection: h.enforceProtection }));

import { NextRequest } from "next/server";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/create-trade-post", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });
}

function passedRequestId(call: number): string | undefined {
  return (h.enforceProtection.mock.calls[call]?.[1] as { requestId?: string } | undefined)?.requestId;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isAdminInitialized.mockReturnValue(true);
  h.verifyIdToken.mockResolvedValue({ uid: "seller-1", email: "seller@example.com" });
  h.enforceProtection.mockResolvedValue({ allowed: true, blocked: false });
  h.add.mockResolvedValue({ id: "post-1" });
});

describe("POST /api/create-trade-post requestId", () => {
  it("forwards a trade-offer-shaped requestId and ignores anything else", async () => {
    const ok = await POST(req({ title: "Desk", requestId: "  req-12345678  " }));
    expect(ok.status).toBe(200);
    expect(passedRequestId(0)).toBe("req-12345678");

    const invalid = ["short", "has space", "abcd/../evil", "x".repeat(65), 12345, "", null];
    for (const requestId of invalid) {
      const res = await POST(req({ title: "Desk", requestId }));
      expect(res.status).toBe(200);
    }
    const absent = await POST(req({ title: "Desk" }));
    expect(absent.status).toBe(200);

    expect(h.enforceProtection).toHaveBeenCalledTimes(1 + invalid.length + 1);
    for (let i = 1; i < h.enforceProtection.mock.calls.length; i++) {
      expect(passedRequestId(i)).toBeUndefined();
    }
    expect(h.add).toHaveBeenCalledTimes(1 + invalid.length + 1);
  });
});
