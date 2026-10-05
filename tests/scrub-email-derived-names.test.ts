import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  mutationForPlan,
  planScrub,
  scrubCollection,
  type ScrubProfile,
} from "../scripts/scrub-email-derived-names";
import { scrubAdminConfigured } from "../scripts/lib/scrub-admin";

const john: ScrubProfile = {
  uid: "uid-john",
  username: "johnsmith",
  displayName: "",
  email: "john.smith@example.com",
};

describe("planScrub", () => {
  it("plans a byName for a shout that only has an email in by, and does not change by", () => {
    const plan = planScrub({
      collection: "tradeShouts",
      data: { by: "john.smith@example.com", text: "hi" },
      profile: john,
    });
    expect(plan.update).toEqual({ byName: "Sky Drop member", byId: "uid-john" });
    expect(plan.update).not.toHaveProperty("by");
  });

  it("leaves an already-clean shout unchanged", () => {
    const plan = planScrub({
      collection: "tradeShouts",
      data: { by: "seller@example.com", byName: "Wiremu", byId: "uid-aroha" },
      profile: { uid: "uid-aroha", displayName: "Wiremu", username: "wiremu_nz", email: "seller@example.com" },
    });
    expect(plan.update).toBeNull();
  });

  it("adds byName and byId on reply elements without changing by", () => {
    const plan = planScrub({
      collection: "tradePosts",
      data: {
        sellerEmail: "seller@example.com",
        sellerUsername: "KiwiTrader",
        replies: [{ text: "hi", by: "jane@example.com", at: "t1" }],
      },
      profile: { uid: "seller", username: "KiwiTrader", email: "seller@example.com" },
      profilesByEmail: {
        "jane@example.com": { uid: "uid-jane", username: "jane", displayName: "", email: "jane@example.com" },
      },
    });
    expect(plan.update?.sellerUsername).toBeUndefined();
    expect(plan.update?.replies).toEqual([
      {
        text: "hi",
        by: "jane@example.com",
        at: "t1",
        byName: "Sky Drop member",
        byId: "uid-jane",
      },
    ]);
  });

  it("does not rewrite a stored name that equals the profile username", () => {
    const plan = planScrub({
      collection: "listings",
      data: {
        sellerEmail: "john.smith@example.com",
        sellerUsername: "johnsmith",
        sellerId: "uid-john",
      },
      profile: john,
    });
    expect(plan.update).toBeNull();
  });

  it("replaces a dotted email-local sellerUsername with the profile slug", () => {
    const plan = planScrub({
      collection: "listings",
      data: {
        sellerEmail: "john.smith@example.com",
        sellerUsername: "john.smith",
        sellerName: "john.smith@example.com",
      },
      profile: john,
    });
    expect(plan.update).toEqual({
      sellerUsername: "johnsmith",
      sellerName: "johnsmith",
    });
  });

  it("sets a neutral reviewerName and only rewrites reviewer when it contains @", () => {
    const kept = planScrub({
      collection: "reviews",
      data: { reviewer: "johnsmith", reviewerEmail: "johnsmith@example.com" },
      profile: { uid: "u", username: "johnsmith", email: "johnsmith@example.com" },
    });
    expect(kept.update).toEqual({ reviewerName: "Verified Buyer" });

    const emailReviewer = planScrub({
      collection: "reviews",
      data: { reviewer: "john@example.com", reviewerEmail: "john@example.com" },
      profile: null,
    });
    expect(emailReviewer.update).toEqual({
      reviewer: "Verified Buyer",
      reviewerName: "Verified Buyer",
    });
  });

  it("neutralises email-derived reviewerUsername and buyerName unless they are the profile username", () => {
    const keptHandle = planScrub({
      collection: "reviews",
      data: {
        reviewer: "Happy buyer",
        reviewerEmail: "john.smith@example.com",
        reviewerUsername: "johnsmith",
        buyerName: "johnsmith",
      },
      profile: john,
    });
    expect(keptHandle.update).toBeNull();

    const replaced = planScrub({
      collection: "reviews",
      data: {
        reviewer: "Happy buyer",
        reviewerEmail: "john.smith@example.com",
        reviewerUsername: "john.smith",
        buyerName: "john.smith@example.com",
      },
      profile: { ...john, displayName: "Aroha" },
    });
    expect(replaced.update).toEqual({
      reviewerUsername: "johnsmith",
      buyerName: "Aroha",
    });

    const noProfile = planScrub({
      collection: "reviews",
      data: {
        reviewerUsername: "jane@example.com",
        buyerName: "jane",
        reviewerEmail: "jane@example.com",
      },
      profile: null,
    });
    expect(noProfile.update).toEqual({
      reviewerUsername: "",
      buyerName: "Sky Drop member",
    });
  });

  it("starts under tsx without importing the server-only Admin helper", () => {
    const src = readFileSync(path.join(process.cwd(), "scripts/scrub-email-derived-names.ts"), "utf8");
    const importLines = src.split("\n").filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith("import ") || trimmed.includes("await import(");
    });
    const imports = importLines.join("\n");
    expect(imports).not.toMatch(/app\/lib\/firebase-admin/);
    expect(imports).not.toMatch(/["']server-only["']/);
    expect(imports).toContain("./lib/scrub-admin");
    expect(src).toContain("DRY-RUN — no writes");
    expect(src).toContain('argv.includes("--apply")');

    const savedAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    const savedAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    try {
      expect(scrubAdminConfigured()).toBe(false);
    } finally {
      if (savedAccount === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
      else process.env.FIREBASE_SERVICE_ACCOUNT = savedAccount;
      if (savedAdc === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      else process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAdc;
    }
  });

  it("dry-run produces zero writes", () => {
    const plan = planScrub({
      collection: "tradeShouts",
      data: { by: "john.smith@example.com" },
      profile: john,
    });
    expect(plan.update).not.toBeNull();
    expect(mutationForPlan(plan, false)).toBeNull();
    expect(mutationForPlan(plan, true)).toEqual(plan.update);
  });
});

describe("tradePosts replies transaction", () => {
  function memoryDb() {
    const posts: Record<string, Record<string, unknown>> = {
      p1: {
        sellerId: "seller",
        sellerEmail: "seller@example.com",
        sellerUsername: "KiwiTrader",
        replies: [{ text: "hi", by: "jane@example.com", byName: "jane@example.com", at: "t1" }],
      },
    };
    const profiles: Record<string, Record<string, unknown>> = {
      seller: { username: "KiwiTrader", displayName: "Seller", email: "seller@example.com" },
      "uid-jane": { username: "janetrader", displayName: "Wiremu", email: "jane@example.com" },
    };
    const stats = { txnGets: 0, batchUpdates: 0 };
    const db = {
      stats,
      posts,
      collection(name: string) {
        const api = {
          orderBy() {
            return api;
          },
          limit() {
            return api;
          },
          startAfter() {
            return api;
          },
          async get() {
            if (name !== "tradePosts") return { empty: true, size: 0, docs: [] as unknown[] };
            const docs = Object.entries(posts).map(([id, data]) => ({
              id,
              ref: { id },
              data: () => data,
            }));
            return { empty: docs.length === 0, size: docs.length, docs };
          },
          doc(id: string) {
            return {
              async get() {
                const data = name === "profiles" ? profiles[id] : undefined;
                return { exists: !!data, id, data: () => data };
              },
            };
          },
          where(field: string, _op: string, value: string) {
            return {
              limit() {
                return {
                  async get() {
                    if (name !== "profiles" || field !== "email") return { empty: true, docs: [] };
                    const found = Object.entries(profiles).find(([, data]) => data.email === value);
                    if (!found) return { empty: true, docs: [] };
                    const [id, data] = found;
                    return { empty: false, docs: [{ id, data: () => data }] };
                  },
                };
              },
            };
          },
        };
        return api;
      },
      batch() {
        return {
          update() {
            stats.batchUpdates += 1;
            throw new Error("replies rewrite must not batch-update");
          },
          async commit() {},
        };
      },
      async runTransaction<T>(fn: (tx: {
        get: (ref: unknown) => Promise<{ data: () => Record<string, unknown> | undefined }>;
        update: (ref: unknown, data: Record<string, unknown>) => void;
      }) => Promise<T>): Promise<T> {
        return fn({
          async get() {
            stats.txnGets += 1;
            const current = posts.p1.replies as Array<{ at?: string }>;
            if (!current.some((entry) => entry.at === "t2")) {
              posts.p1 = {
                ...posts.p1,
                replies: [...current, { text: "second", by: "bob@example.com", byName: "Aroha", at: "t2" }],
              };
            }
            return { data: () => posts.p1 };
          },
          update(_ref, data) {
            posts.p1 = { ...posts.p1, ...data };
          },
        });
      },
    };
    return db;
  }

  it("keeps a reply that arrives before the transactional read", async () => {
    const db = memoryDb();
    const row = await scrubCollection(db, "tradePosts", { apply: true });
    const replies = db.posts.p1.replies as Array<Record<string, unknown>>;
    expect(row.updated).toBe(1);
    expect(row.wouldUpdate).toBe(1);
    expect(db.stats.txnGets).toBe(1);
    expect(db.stats.batchUpdates).toBe(0);
    expect(replies).toHaveLength(2);
    expect(replies[0]).toMatchObject({
      text: "hi",
      by: "jane@example.com",
      byName: "Wiremu",
      byId: "uid-jane",
    });
    expect(replies[1]).toEqual({ text: "second", by: "bob@example.com", byName: "Aroha", at: "t2" });
  });

  it("does not open a transaction or write replies on dry-run", async () => {
    const db = memoryDb();
    const row = await scrubCollection(db, "tradePosts", { apply: false });
    expect(row.wouldUpdate).toBe(1);
    expect(row.updated).toBe(0);
    expect(db.stats.txnGets).toBe(0);
    expect(db.stats.batchUpdates).toBe(0);
    expect(db.posts.p1.replies).toHaveLength(1);
  });
});
