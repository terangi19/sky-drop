import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  isAdminInitialized: vi.fn(() => true),
  isAdminUser: vi.fn(async (..._args: unknown[]) => false),
  queries: [] as Array<{ field: string; value: string }>,
  sellerIdDocs: [] as Array<Record<string, unknown>>,
  emailDocs: [] as Array<Record<string, unknown>>,
  throwOn: "" as "" | "sellerId" | "sellerEmail",
}));

vi.mock("../app/lib/firebase-admin", () => ({
  verifyIdToken: (...args: unknown[]) => h.verifyIdToken(...args),
  isAdminInitialized: () => h.isAdminInitialized(),
  getAdminDb: () => ({
    collection: (name: string) => {
      if (name !== "purchases") throw new Error(`unexpected collection ${name}`);
      return {
        where(field: string, _op: string, value: unknown) {
          return {
            where(field2: string, _op2: string, value2: unknown) {
              return {
                get: async () => {
                  const idField = field === "status" ? field2 : field;
                  const idValue = field === "status" ? value2 : value;
                  h.queries.push({ field: String(idField), value: String(idValue) });
                  if (h.throwOn === idField) throw new Error("FAILED_PRECONDITION: index missing");
                  const docs = idField === "sellerId" ? h.sellerIdDocs : h.emailDocs;
                  return {
                    empty: docs.length === 0,
                    docs: docs.map((data) => ({ data: () => data })),
                  };
                },
              };
            },
          };
        },
      };
    },
  }),
}));

vi.mock("../app/lib/admin-check.server", () => ({
  isAdminUser: (...args: unknown[]) => h.isAdminUser(...args),
}));

import { GET } from "../app/api/seller-earnings/route";

function getEarnings(search = "") {
  return GET(
    new NextRequest(`http://localhost/api/seller-earnings${search}`, {
      headers: { authorization: "Bearer test-token" },
    })
  );
}

describe("GET /api/seller-earnings uid bind", () => {
  beforeEach(() => {
    h.queries = [];
    h.sellerIdDocs = [];
    h.emailDocs = [];
    h.throwOn = "";
    h.isAdminInitialized.mockReturnValue(true);
    h.isAdminUser.mockReset();
    h.isAdminUser.mockResolvedValue(false);
    h.verifyIdToken.mockReset();
    h.verifyIdToken.mockResolvedValue({ uid: "seller-1", email: "Seller@Example.test" });
  });

  it("rejects a non-admin querying another uid", async () => {
    const res = await getEarnings("?uid=other");
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    expect(h.queries).toHaveLength(0);
  });

  it("rejects a non-admin querying another email", async () => {
    const res = await getEarnings("?email=other@x");
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    expect(h.queries).toHaveLength(0);
  });

  it("uses token.uid when a non-admin omits params, then falls back to sellerEmail", async () => {
    h.emailDocs = [{ total: 40 }, { price: 10 }, { total: 5 }, { total: 999 }];
    const res = await getEarnings();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ total: 55 });
    expect(h.queries).toEqual([
      { field: "sellerId", value: "seller-1" },
      { field: "sellerEmail", value: "Seller@Example.test" },
    ]);
  });

  it("does not require email when uid is present", async () => {
    h.sellerIdDocs = [{ total: 12 }];
    const res = await getEarnings("?uid=seller-1");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ total: 12 });
    expect(h.queries).toEqual([{ field: "sellerId", value: "seller-1" }]);
  });

  it("allows an admin to query another uid", async () => {
    h.isAdminUser.mockResolvedValue(true);
    h.sellerIdDocs = [{ total: 80 }];
    const res = await getEarnings("?uid=victim");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ total: 80 });
    expect(h.isAdminUser).toHaveBeenCalledWith("seller@example.test", "seller-1");
    expect(h.queries).toEqual([{ field: "sellerId", value: "victim" }]);
  });

  it("falls back to sellerEmail when the sellerId query throws", async () => {
    h.throwOn = "sellerId";
    h.emailDocs = [{ total: 7 }];
    const res = await getEarnings();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ total: 7 });
    expect(h.queries.map((q) => q.field)).toEqual(["sellerId", "sellerEmail"]);
  });

  it("does not hard-require email in source when a uid can be resolved", () => {
    const src = readFileSync(path.join(process.cwd(), "app/api/seller-earnings/route.ts"), "utf8");
    expect(src).toContain('searchParams.get("uid")');
    expect(src).not.toMatch(/if\s*\(\s*!email\s*\)/);
    expect(src).toContain('.where("sellerId", "==", targetUid)');
    expect(src).toContain('.where("sellerEmail", "==", queryEmail)');
  });
});
