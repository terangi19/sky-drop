import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Shout = { id: string; createdAtMs: number; text: string; by: string };

const h = vi.hoisted(() => ({
  isAdminInitialized: vi.fn(() => true),
  shouts: [] as Shout[],
  queries: [] as { field: string; op: string; cutoffMs: number; orderBy: string; limit: number }[],
  commits: 0,
  failGet: false,
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ __ms: ms, toMillis: () => ms }) },
}));

vi.mock("../../../lib/firebase-admin", () => ({
  isAdminInitialized: h.isAdminInitialized,
  getAdminDb: () => ({
    collection: (name: string) => {
      expect(name).toBe("tradeShouts");
      return {
        where: (field: string, op: string, cutoff: { __ms: number }) => ({
          orderBy: (ob: string) => ({
            limit: (n: number) => ({
              get: async () => {
                if (h.failGet) throw new Error("boom secret-text ts-alice@test.com");
                h.queries.push({ field, op, cutoffMs: cutoff.__ms, orderBy: ob, limit: n });
                const docs = h.shouts
                  .filter((s) => s.createdAtMs < cutoff.__ms)
                  .sort((a, b) => a.createdAtMs - b.createdAtMs)
                  .slice(0, n)
                  .map((s) => ({ id: s.id, ref: { id: s.id } }));
                return { empty: docs.length === 0, size: docs.length, docs };
              },
            }),
          }),
        }),
      };
    },
    batch: () => {
      const ids: string[] = [];
      return {
        delete: (ref: { id: string }) => ids.push(ref.id),
        commit: async () => {
          h.commits += 1;
          h.shouts = h.shouts.filter((s) => !ids.includes(s.id));
        },
      };
    },
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

const SECRET = "test-cron-secret-value";
const HOUR = 60 * 60 * 1000;

function req(auth?: string, url = "http://localhost/api/cron/cleanup-trade-shouts") {
  return new NextRequest(url, { method: "GET", headers: auth === undefined ? {} : { authorization: auth } });
}

function seed(n: number, ageMs: number, prefix: string) {
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    h.shouts.push({ id: `${prefix}-${i}`, createdAtMs: now - ageMs - i, text: "secret-text", by: "ts-alice@test.com" });
  }
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  h.isAdminInitialized.mockReturnValue(true);
  h.shouts = [];
  h.queries = [];
  h.commits = 0;
  h.failGet = false;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  logSpy.mockRestore();
  errSpy.mockRestore();
  infoSpy.mockRestore();
});

function allLogs(): string {
  return JSON.stringify([...logSpy.mock.calls, ...errSpy.mock.calls, ...infoSpy.mock.calls]);
}

describe("GET /api/cron/cleanup-trade-shouts authz", () => {
  it("500 (fail closed) when CRON_SECRET is unset or empty; nothing is read", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(h.queries).toHaveLength(0);
  });

  it.each([
    ["missing", undefined],
    ["wrong token same length", `Bearer ${"x".repeat(SECRET.length)}`],
    ["shorter token", "Bearer short"],
    ["longer token", `Bearer ${SECRET}x`],
    ["no Bearer prefix", SECRET],
    ["lowercase scheme", `bearer ${SECRET}`],
  ])("401 for %s; nothing is read or deleted", async (_label, auth) => {
    seed(3, 3 * HOUR, "old");
    const res = await GET(req(auth));
    expect(res.status).toBe(401);
    expect(h.queries).toHaveLength(0);
    expect(h.shouts).toHaveLength(3);
  });

  it("200 with the correct token; query string is ignored", async () => {
    const res = await GET(req(`Bearer ${SECRET}`, "http://localhost/api/cron/cleanup-trade-shouts?limit=999999&cutoff=0"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 0, rounds: 0, more: false });
    expect(h.queries[0]).toMatchObject({ field: "createdAt", op: "<", orderBy: "createdAt", limit: 400 });
  });
});

describe("GET /api/cron/cleanup-trade-shouts deletion", () => {
  it("deletes only shouts older than 2 h (TTL 1 h + 1 h grace)", async () => {
    seed(5, 3 * HOUR, "old");
    seed(4, 90 * 60 * 1000, "recent"); // 1.5 h: past display TTL but inside grace -> kept
    seed(2, 60 * 1000, "fresh");
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(await res.json()).toEqual({ deleted: 5, rounds: 1, more: false });
    expect(h.shouts.map((s) => s.id).sort()).toEqual(
      ["fresh-0", "fresh-1", "recent-0", "recent-1", "recent-2", "recent-3"].sort()
    );
    const cutoffAge = Date.now() - h.queries[0].cutoffMs;
    expect(cutoffAge).toBeGreaterThanOrEqual(2 * HOUR);
    expect(cutoffAge).toBeLessThan(2 * HOUR + 5_000);
  });

  it("batches of 400, at most 5 rounds (2000 docs) per run, then reports more:true", async () => {
    seed(2100, 3 * HOUR, "bulk");
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(await res.json()).toEqual({ deleted: 2000, rounds: 5, more: true });
    expect(h.commits).toBe(5);
    expect(h.shouts).toHaveLength(100);
  });

  it("stops after a short final page with more:false", async () => {
    seed(401, 3 * HOUR, "edge");
    expect(await (await GET(req(`Bearer ${SECRET}`))).json()).toEqual({ deleted: 401, rounds: 2, more: false });
  });

  it("logs counts only, never shout text/authors; 500 body is generic", async () => {
    seed(3, 3 * HOUR, "old");
    await GET(req(`Bearer ${SECRET}`));
    expect(allLogs()).not.toMatch(/secret-text|ts-alice@test\.com/);
    h.failGet = true;
    seed(1, 3 * HOUR, "x");
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Cleanup failed");
    expect(JSON.stringify(body)).not.toMatch(/boom|secret-text|@/);
    expect(allLogs()).not.toContain(SECRET);
    expect(allLogs()).not.toMatch(/boom|secret-text|ts-alice@test\.com/);
  });

  it("500 when Admin SDK is not initialised (after authz)", async () => {
    h.isAdminInitialized.mockReturnValue(false);
    expect((await GET(req(`Bearer ${SECRET}`))).status).toBe(500);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });
});
