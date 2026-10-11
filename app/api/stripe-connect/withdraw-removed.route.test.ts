/**
 * PROMPT-12: the earningsBalance withdraw is gone. 410 whether or not Stripe checkout is enabled,
 * with no profile read, no Stripe transfer and no balance write. 500s no longer echo Stripe/env text.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  flag: true,
  dbTouched: [] as string[],
  transfers: vi.fn(async () => ({ id: "tr_1" })),
  accountsCreate: vi.fn(async () => {
    throw new Error("STRIPE_SECRET_KEY sk_live_xxx invalid for acct_123");
  }),
}));

vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: async () => ({ uid: "u1", email: "u1@example.com", email_verified: true }),
  getServerDb: () => ({
    collection: (n: string) => {
      h.dbTouched.push(n);
      return {
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ stripeAccountId: "acct_1", earningsBalance: 1e9 }) }),
          set: async () => {},
          update: async () => {},
        }),
      };
    },
    runTransaction: async () => {
      h.dbTouched.push("tx");
    },
  }),
}));
vi.mock("../../lib/stripe-server", () => ({
  getStripe: () => ({ transfers: { create: h.transfers }, accounts: { create: h.accountsCreate } }),
}));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("../../lib/stripe-checkout-flags", () => ({
  isStripeCheckoutEnabledServer: () => h.flag,
  listingCheckoutUnavailableBody: () => ({ error: "Checkout unavailable" }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/stripe-connect", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  h.flag = true;
  h.dbTouched = [];
  h.transfers.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("stripe-connect withdraw removed", () => {
  for (const flag of [true, false]) {
    it(`410 with Stripe checkout ${flag ? "enabled" : "disabled"}; no transfer, no db`, async () => {
      h.flag = flag;
      const res = await post({ action: "withdraw", accountId: "acct_1", amount: 99999 });
      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ error: "Withdrawals are not available.", code: "withdraw_removed" });
      expect(h.transfers).not.toHaveBeenCalled();
      expect(h.dbTouched).toEqual([]);
    });
  }
  it("concurrent withdraw attempts never reach Stripe", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => post({ action: "withdraw", accountId: "acct_1", amount: 10 })));
    expect(results.map((r) => r.status)).toEqual([410, 410, 410, 410, 410]);
    expect(h.transfers).not.toHaveBeenCalled();
  });
  it("other actions unchanged: create still fail-closed (503) while the flag is off", async () => {
    h.flag = false;
    expect((await post({ action: "create" })).status).toBe(503);
    expect((await post({ action: "nonsense" })).status).toBe(400);
  });
  it("500 body is generic (no Stripe key / account text)", async () => {
    const res = await post({ action: "create" });
    expect(res.status).toBe(500);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/sk_live|STRIPE_SECRET_KEY|acct_123/);
    expect(body).toContain("Stripe Connect request failed");
  });
});

describe("source guard", () => {
  it("no Stripe transfers.create and no server read of earningsBalance anywhere in app/", () => {
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) {
          const src = readFileSync(p, "utf8");
          if (/transfers\.create\s*\(/.test(src) || /earningsBalance/.test(src)) offenders.push(relative(process.cwd(), p));
        }
      }
    };
    walk(join(process.cwd(), "app"));
    expect(offenders).toEqual([]);
  });
});
