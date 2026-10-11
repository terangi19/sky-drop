import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** PROMPT-16: a Firestore error code (e.g. 5 NOT_FOUND) is not an HTTP status and its text is not returned. */
const h = vi.hoisted(() => ({ update: vi.fn(), adminErr: null as null | Error }));
vi.mock("../../../lib/admin-request", () => {
  class AdminAuthError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    AdminAuthError,
    requireAdminFromRequest: async () => {
      if (h.adminErr) throw h.adminErr;
      return { uid: "admin" };
    },
  };
});
vi.mock("../../../lib/firebase-admin", () => ({
  getAdminDb: () => ({ collection: () => ({ doc: () => ({ update: (...a: unknown[]) => h.update(...a) }) }) }),
}));

import { POST } from "./route";
import { AdminAuthError } from "../../../lib/admin-request";

const req = () =>
  new NextRequest("http://localhost/api/admin/message-flags", {
    method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: JSON.stringify({ flagId: "f1", action: "reviewed" }),
  });

describe("POST /api/admin/message-flags errors", () => {
  beforeEach(() => {
    h.update.mockReset();
    h.adminErr = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("Firestore NOT_FOUND (code 5) -> 500 generic, not a RangeError or the raw message", async () => {
    h.update.mockRejectedValue(Object.assign(new Error("5 NOT_FOUND: No document to update: projects/sky-drop-de459/..."), { code: 5 }));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update flag" });
  });

  it("admin auth failures keep their status and short message", async () => {
    h.adminErr = new (AdminAuthError as unknown as new (s: number, m: string) => Error)(403, "Admin only");
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
  });
});
