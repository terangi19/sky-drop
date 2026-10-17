import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** PROMPT-16: Sky AI conversation GET/DELETE do not echo internal errors (and DELETE failures are not 404s). */
const h = vi.hoisted(() => ({ load: vi.fn(), del: vi.fn() }));
vi.mock("../../../../lib/firebase-admin", () => ({ verifyIdToken: async () => ({ uid: "u1" }) }));
vi.mock("../../../../lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true, remaining: 1, limit: 40 }) }));
vi.mock("../../../../lib/sky-ai-firestore", () => ({
  loadSkyAiMessages: (...a: unknown[]) => h.load(...a),
  deleteSkyAiConversation: (...a: unknown[]) => h.del(...a),
}));
vi.mock("../../../../lib/sky-ai-listing-fill", () => ({ stripSkyAiMachineTags: (s: string) => s }));

import { DELETE, GET } from "./route";

const params = { params: Promise.resolve({ id: "c1" }) };
const req = (m: string) => new NextRequest("http://localhost/api/sky-ai/conversations/c1", { method: m, headers: { authorization: "Bearer t" } });
const INTERNAL = "9 FAILED_PRECONDITION: The query requires an index. https://console.firebase.google.com/project/sky-drop-de459/...";

describe("sky-ai conversation route errors", () => {
  beforeEach(() => {
    h.load.mockReset();
    h.del.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("GET: not found stays 404", async () => {
    h.load.mockRejectedValue(new Error("Conversation not found"));
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
  });

  it("GET: internal error is generic 500", async () => {
    h.load.mockRejectedValue(new Error(INTERNAL));
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/FAILED_PRECONDITION|console\.firebase|sky-drop-de459/);
  });

  it("DELETE: not found 404, internal error generic 500", async () => {
    h.del.mockRejectedValueOnce(new Error("Conversation not found"));
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
    h.del.mockRejectedValueOnce(new Error(INTERNAL));
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete" });
  });
});
