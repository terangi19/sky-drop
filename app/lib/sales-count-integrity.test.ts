import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as sc from "../../functions/src/sales-count";
import { handlePurchaseWritten } from "../../functions/src/sales-count-trigger";

// ---- in-memory Firestore (Admin SDK surface used by the trigger) ----
type Data = Record<string, unknown>;
const db = { docs: new Map<string, Data>(), txCount: 0 };
const key = (col: string, id: string) => `${col}/${id}`;
const ref = (col: string, id: string) => ({ kind: "doc" as const, col, id, path: key(col, id) });

function makeFakeDb() {
  return {
    collection: (col: string) => ({
      doc: (id: string) => ref(col, id),
      where: (field: string, _op: string, value: unknown) => ({
        limit: (n: number) => ({ kind: "query" as const, col, field, value, n }),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      db.txCount++;
      let wrote = false;
      const staged: Array<() => void> = [];
      const snapOf = (r: { col: string; id: string }) => {
        const d = db.docs.get(key(r.col, r.id));
        return { exists: !!d, id: r.id, ref: ref(r.col, r.id), data: () => d, get: (k: string) => d?.[k] };
      };
      const tx = {
        get: async (q: { kind: string; col: string; id?: string; field?: string; value?: unknown; n?: number }) => {
          if (wrote) throw new Error("Firestore transactions require all reads before writes");
          if (q.kind === "doc") return snapOf(q as { col: string; id: string });
          const docs = [...db.docs.entries()]
            .filter(([k, d]) => k.startsWith(`${q.col}/`) && d[q.field!] === q.value)
            .slice(0, q.n)
            .map(([k]) => snapOf({ col: q.col, id: k.slice(q.col.length + 1) }));
          return { empty: docs.length === 0, docs };
        },
        set: (r: { col: string; id: string }, data: Data) => { wrote = true; staged.push(() => db.docs.set(key(r.col, r.id), { ...data })); },
        update: (r: { col: string; id: string }, data: Data) => {
          wrote = true;
          staged.push(() => {
            const cur = db.docs.get(key(r.col, r.id));
            if (!cur) throw new Error("update on missing doc");
            db.docs.set(key(r.col, r.id), { ...cur, ...data });
          });
        },
      };
      const out = await fn(tx);
      staged.forEach((s) => s());
      return out;
    },
  };
}

const SELLER_EMAIL = "seller@x.test";
const SELLER = "seller-uid";
const P = "purchase-1";
const profile = () => db.docs.get(key("profiles", SELLER))!;
const ledger = () => db.docs.get(key("salesCountLedger", P));

async function write(next: Data | null) {
  const before = db.docs.get(key("purchases", P)) ?? null;
  if (next) db.docs.set(key("purchases", P), next);
  else db.docs.delete(key("purchases", P));
  const snap = (d: Data | null) => ({ exists: !!d, data: () => d });
  const event = { params: { purchaseId: P }, data: { before: snap(before), after: snap(next) } };
  await handlePurchaseWritten(makeFakeDb() as never, event);
  return event;
}
/** Redeliver the same event (trigger retry / Stripe webhook retry re-writing the same state). */
async function redeliver(event: unknown) {
  await handlePurchaseWritten(makeFakeDb() as never, event as never);
}

beforeEach(() => {
  db.docs = new Map([[key("profiles", SELLER), { email: SELLER_EMAIL, salesCount: 0 }]]);
  db.txCount = 0;
});

describe("purchaseCountsAsSale", () => {
  it("counts paid/confirmed/fulfilment states, not requests, unpaid, cancelled, failed, refunded or lost disputes", () => {
    for (const s of ["paid", "confirmed", "pending", "seller_confirming", "preparing", "ready_for_pickup", "shipped", "delivered", "completed", "in_progress", "rented", "returned"]) {
      expect(sc.purchaseCountsAsSale({ status: s }), s).toBe(true);
    }
    for (const s of ["arrange_requested", "awaiting_payment", "offer_accepted", "cancelled", "failed", "payment_failed", "refunded", "unpaid", "expired", "", undefined]) {
      expect(sc.purchaseCountsAsSale({ status: s }), String(s)).toBe(false);
    }
    expect(sc.purchaseCountsAsSale({ status: "completed", disputeStatus: "dispute_lost" })).toBe(false);
    expect(sc.purchaseCountsAsSale({ status: "cancelled", disputeStatus: "refunded" })).toBe(false);
    expect(sc.purchaseCountsAsSale({ status: "delivered", disputeStatus: "disputed" })).toBe(true); // open dispute: still a sale
    expect(sc.purchaseCountsAsSale({ status: "completed", disputeStatus: "dispute_won" })).toBe(true);
    expect(sc.purchaseCountsAsSale(null)).toBe(false);
  });

  it("nextSalesCount never goes below 0 and treats junk as 0", () => {
    expect(sc.nextSalesCount(0, { kind: "decrement" })).toBe(0);
    expect(sc.nextSalesCount("7", { kind: "increment" })).toBe(1);
    expect(sc.nextSalesCount(3.9, { kind: "decrement" })).toBe(2);
  });
});

describe("onPurchaseWrittenSalesCount (single idempotent writer)", () => {
  const paid = { status: "paid", sellerEmail: SELLER_EMAIL, buyerEmail: "b@x" };

  it("Stripe/create path: +1 once; webhook/trigger retries don't double-count", async () => {
    const ev = await write(paid);
    expect(profile().salesCount).toBe(1);
    expect(ledger()).toMatchObject({ counted: true, sellerProfileId: SELLER });
    await redeliver(ev);
    await redeliver(ev);
    expect(profile().salesCount).toBe(1);
  });

  it("refund (charge.refunded -> status refunded) decrements once, retries don't double-decrement", async () => {
    await write(paid);
    const ev = await write({ ...paid, status: "refunded" });
    expect(profile().salesCount).toBe(0);
    await redeliver(ev);
    expect(profile().salesCount).toBe(0);
    expect(ledger()).toMatchObject({ counted: false });
  });

  it("admin dispute refund (status cancelled + disputeStatus refunded) and lost Stripe dispute decrement", async () => {
    await write(paid);
    await write({ ...paid, status: "cancelled", disputeStatus: "refunded" });
    expect(profile().salesCount).toBe(0);
    db.docs.delete(key("salesCountLedger", P));
    db.docs.delete(key("purchases", P));
    profile().salesCount = 0;
    await write({ ...paid, status: "delivered" });
    await write({ ...paid, status: "delivered", disputeStatus: "disputed" });
    expect(profile().salesCount).toBe(1);
    await write({ ...paid, status: "delivered", disputeStatus: "dispute_lost" });
    expect(profile().salesCount).toBe(0);
  });

  it("arrange purchase: request doesn't count, seller confirm counts, cancel (FSM / listing detach) uncounts", async () => {
    const req = { status: "arrange_requested", sellerEmail: SELLER_EMAIL, paymentType: "arrange" };
    await write(req);
    expect(profile().salesCount).toBe(0);
    expect(ledger()).toMatchObject({ counted: false });
    await write({ ...req, status: "seller_confirming" });
    expect(profile().salesCount).toBe(1);
    await write({ ...req, status: "preparing" });
    expect(profile().salesCount).toBe(1);
    await write({ ...req, status: "cancelled" });
    expect(profile().salesCount).toBe(0);
  });

  it("payment_failed never counts; never below 0 even if the stored count is already 0", async () => {
    await write({ ...paid, status: "payment_failed" });
    expect(profile().salesCount).toBe(0);
    await write(paid);
    profile().salesCount = 0; // drifted store
    await write({ ...paid, status: "refunded" });
    expect(profile().salesCount).toBe(0);
  });

  it("legacy purchase (counted inline before deploy, no ledger) is not counted twice and is uncounted on refund", async () => {
    db.docs.set(key("purchases", P), { ...paid, status: "shipped" }); // pre-deploy doc
    profile().salesCount = 5; // legacy inline +1 already in here
    await write({ ...paid, status: "delivered" }); // count-neutral write: skipped
    expect(profile().salesCount).toBe(5);
    await write({ ...paid, status: "refunded" });
    expect(profile().salesCount).toBe(4);
    expect(ledger()).toMatchObject({ counted: false });
  });

  it("decrements the profile that was credited even if sellerEmail is later changed on the doc", async () => {
    await write(paid);
    db.docs.set(key("profiles", "other"), { email: "other@x", salesCount: 3 });
    await write({ ...paid, sellerEmail: "other@x", status: "cancelled" });
    expect(profile().salesCount).toBe(0);
    expect(db.docs.get(key("profiles", "other"))!.salesCount).toBe(3);
  });

  it("deleting a counted purchase uncounts it; missing seller profile never writes a count", async () => {
    await write(paid);
    await write(null);
    expect(profile().salesCount).toBe(0);
    db.docs.delete(key("salesCountLedger", P));
    await write({ ...paid, sellerEmail: "ghost@x" });
    expect(ledger()).toMatchObject({ counted: false });
    expect(profile().salesCount).toBe(0);
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("inline increments are gone (they double-counted with the trigger and never undid)", () => {
    expect(existsSync(join(process.cwd(), "app/lib/seller-sales-admin.ts"))).toBe(false);
    expect(read("app/lib/purchase-service.ts")).not.toMatch(/salesCount: FieldValue\.increment|incrementProfileSalesCount/);
    expect(read("app/api/confirm-arrange-sale/route.ts")).not.toContain("incrementProfileSalesCount");
  });
  it("trigger is exported from functions and listens to every purchase write", () => {
    expect(read("functions/src/index.ts")).toContain('export { onPurchaseWrittenSalesCount } from "./sales-count-trigger";');
    expect(read("functions/src/sales-count-trigger.ts")).toContain('onDocumentWritten("purchases/{purchaseId}"');
  });
  it("ledger collection is server-only under the existing default-deny rule (rules unchanged)", () => {
    const rules = read("firestore.rules");
    expect(rules).not.toContain("salesCountLedger");
    expect(rules).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });
});
