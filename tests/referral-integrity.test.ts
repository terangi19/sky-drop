import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type DocData = Record<string, unknown>;

type MemoryRef = {
  id: string;
  path: string;
  get: () => Promise<MemorySnap>;
  set: (data: DocData, options?: { merge?: boolean }) => Promise<void>;
  update: (data: DocData) => Promise<void>;
  create: (data: DocData) => Promise<void>;
};

type MemorySnap = {
  id: string;
  ref: MemoryRef;
  exists: boolean;
  data: () => DocData | undefined;
};

const mem = vi.hoisted(() => {
  type User = { uid: string; email: string; creationTime: string };
  const docs = new Map<string, DocData>();
  const users = new Map<string, User>();
  let auto = 0;
  let txTail: Promise<void> = Promise.resolve();

  function key(collection: string, id: string): string {
    return `${collection}/${id}`;
  }

  function transform(current: unknown, value: unknown): unknown {
    if (value && typeof value === "object") {
      const name = value.constructor?.name ?? "";
      const record = value as { operand?: unknown; _value?: unknown };
      if (name.includes("Increment") || Object.prototype.hasOwnProperty.call(value, "operand")) {
        const raw = record.operand ?? record._value;
        const by = typeof raw === "number" ? raw : 1;
        const base = typeof current === "number" ? current : 0;
        return base + by;
      }
      if (name.includes("ServerTimestamp") || name.includes("TimestampTransform")) {
        return new Date();
      }
    }
    return value;
  }

  function apply(base: DocData | undefined, patch: DocData, merge: boolean): DocData {
    const next: DocData = merge && base ? { ...base } : {};
    for (const [field, value] of Object.entries(patch)) {
      next[field] = transform(base?.[field], value);
    }
    return next;
  }

  function ref(collection: string, id: string): MemoryRef {
    return {
      id,
      path: key(collection, id),
      get: async () => snap(collection, id),
      set: async (data, options) => {
        const existing = docs.get(key(collection, id));
        docs.set(key(collection, id), apply(existing, data, options?.merge === true));
      },
      update: async (data) => {
        const existing = docs.get(key(collection, id));
        if (!existing) throw new Error(`No document to update: ${collection}/${id}`);
        docs.set(key(collection, id), apply(existing, data, true));
      },
      create: async (data) => {
        const path = key(collection, id);
        if (docs.has(path)) throw new Error(`Document already exists: ${path}`);
        docs.set(path, apply(undefined, data, false));
      },
    };
  }

  function snap(collection: string, id: string): MemorySnap {
    const path = key(collection, id);
    const data = docs.get(path);
    const docRef = ref(collection, id);
    return {
      id,
      ref: docRef,
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
    };
  }

  function collection(name: string) {
    return {
      doc(id?: string) {
        return ref(name, id ?? `auto_${++auto}`);
      },
      add: async (data: DocData) => {
        const docRef = ref(name, `auto_${++auto}`);
        await docRef.set(data);
        return docRef;
      },
      where(field: string, op: string, value: unknown) {
        if (op !== "==") throw new Error(`Unsupported operator ${op}`);
        const run = (limit: number) => {
          const matches = [...docs.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
            .slice(0, limit)
            .map(([path]) => {
              const id = path.slice(name.length + 1);
              return snap(name, id);
            });
          return {
            empty: matches.length === 0,
            size: matches.length,
            docs: matches,
          };
        };
        return {
          limit(n: number) {
            return { get: async () => run(n) };
          },
          get: async () => run(Number.POSITIVE_INFINITY),
        };
      },
    };
  }

  const db = {
    collection,
    runTransaction: async <T>(fn: (tx: {
      get: (target: MemoryRef) => Promise<MemorySnap>;
      create: (target: MemoryRef, data: DocData) => void;
      update: (target: MemoryRef, data: DocData) => void;
      set: (target: MemoryRef, data: DocData, options?: { merge?: boolean }) => void;
    }) => Promise<T>): Promise<T> => {
      const run = txTail.then(async () => {
        const staged = new Map<string, DocData | null>();
        const tx = {
          get: async (target: MemoryRef) => {
            const pending = staged.get(target.path);
            if (pending === null) {
              return { id: target.id, ref: target, exists: false, data: () => undefined };
            }
            if (pending) {
              return { id: target.id, ref: target, exists: true, data: () => ({ ...pending }) };
            }
            return snapFromPath(target);
          },
          create: (target: MemoryRef, data: DocData) => {
            if (docs.has(target.path) || staged.has(target.path)) {
              throw new Error(`Document already exists: ${target.path}`);
            }
            staged.set(target.path, apply(undefined, data, false));
          },
          update: (target: MemoryRef, data: DocData) => {
            const pending = staged.get(target.path);
            const existing = pending === undefined ? docs.get(target.path) : pending ?? undefined;
            if (!existing) throw new Error(`No document to update: ${target.path}`);
            staged.set(target.path, apply(existing, data, true));
          },
          set: (target: MemoryRef, data: DocData, options?: { merge?: boolean }) => {
            const pending = staged.get(target.path);
            const existing = pending === undefined ? docs.get(target.path) : pending ?? undefined;
            staged.set(target.path, apply(existing, data, options?.merge === true));
          },
        };
        const result = await fn(tx);
        for (const [path, data] of staged) {
          if (data) docs.set(path, data);
          else docs.delete(path);
        }
        return result;
      });
      txTail = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
  };

  function snapFromPath(target: MemoryRef): MemorySnap {
    const slash = target.path.indexOf("/");
    return snap(target.path.slice(0, slash), target.path.slice(slash + 1));
  }

  return {
    docs,
    users,
    db,
    reset() {
      docs.clear();
      users.clear();
      auto = 0;
      txTail = Promise.resolve();
    },
    list(collectionName: string): DocData[] {
      return [...docs.entries()]
        .filter(([path]) => path.startsWith(`${collectionName}/`))
        .map(([, data]) => data);
    },
    get(collectionName: string, id: string): DocData | undefined {
      const data = docs.get(key(collectionName, id));
      return data ? { ...data } : undefined;
    },
  };
});

vi.mock("../app/lib/firebase-admin", () => ({
  isAdminInitialized: () => true,
  verifyIdToken: async (token: string) => {
    const user = mem.users.get(token);
    if (!user) throw new Error("bad token");
    return { uid: user.uid, email: user.email, email_verified: true };
  },
  getAdminAuth: () => ({
    getUser: async (uid: string) => {
      const user = mem.users.get(uid);
      if (!user) throw new Error("user not found");
      return { uid: user.uid, email: user.email, metadata: { creationTime: user.creationTime } };
    },
  }),
  getAdminDb: () => mem.db,
}));

vi.mock("../app/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 3, limit: 3 }),
}));

vi.mock("../app/lib/admin-request", () => ({
  AdminAuthError: class AdminAuthError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "AdminAuthError";
    }
  },
  requireAdminFromRequest: async () => ({ uid: "admin-1", email: "admin@example.test" }),
}));

vi.mock("../app/lib/admin-utils", () => ({
  writeAuditLog: async () => {},
}));

vi.mock("../app/lib/email-transport", () => ({
  sendEmail: async () => ({ id: "test" }),
}));

import { POST as trackReferral } from "../app/api/track-referral/route";
import { POST as kycReview } from "../app/api/admin/kyc-review/route";

function freshTime(ageMs = 0): string {
  return new Date(Date.now() - ageMs).toUTCString();
}

function seedUser(uid: string, email: string, ageMs = 0) {
  mem.users.set(uid, { uid, email, creationTime: freshTime(ageMs) });
}

function seedProfile(id: string, data: DocData) {
  mem.docs.set(`profiles/${id}`, { ...data });
}

function trackRequest(uid: string, referralCode: string) {
  return new NextRequest("http://localhost/api/track-referral", {
    method: "POST",
    headers: {
      authorization: `Bearer ${uid}`,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify({ referralCode }),
  });
}

function approveRequest(uid: string) {
  return new NextRequest("http://localhost/api/admin/kyc-review", {
    method: "POST",
    headers: {
      authorization: "Bearer admin",
      "content-type": "application/json",
    },
    body: JSON.stringify({ uid, action: "approve" }),
  });
}

beforeEach(() => {
  mem.reset();
});

describe("POST /api/track-referral", () => {
  it("T1 first call tracks once, writes signup_{uid}, and sets referredBy", async () => {
    seedUser("referrer", "owner@example.test");
    seedUser("referee", "new@example.test");
    seedProfile("referrer", {
      email: "owner@example.test",
      referralCode: "CODE1",
      referralSignups: 0,
      createdAt: 1_000,
    });
    seedProfile("referee", { email: "new@example.test" });

    const res = await trackReferral(trackRequest("referee", "code1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tracked: true, referredBy: "CODE1" });
    expect(mem.get("profiles", "referrer")?.referralSignups).toBe(1);
    expect(mem.get("referralEvents", "signup_referee")).toMatchObject({
      type: "signup",
      referrerUid: "referrer",
      refereeUid: "referee",
      code: "CODE1",
      rewardedAt: null,
    });
    expect(mem.get("profiles", "referee")).toMatchObject({
      referredBy: "CODE1",
      referredByUid: "referrer",
    });
  });

  it("T2 second call is not tracked and does not increment or notify again", async () => {
    seedUser("referrer", "owner@example.test");
    seedUser("referee", "new@example.test");
    seedProfile("referrer", {
      email: "owner@example.test",
      referralCode: "CODE1",
      referralSignups: 0,
      createdAt: 1_000,
    });
    seedProfile("referee", { email: "new@example.test" });

    expect((await trackReferral(trackRequest("referee", "CODE1"))).status).toBe(200);
    const second = await trackReferral(trackRequest("referee", "CODE1"));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ tracked: false });
    expect(mem.get("profiles", "referrer")?.referralSignups).toBe(1);
    expect(mem.list("notifications")).toHaveLength(1);
    expect(mem.list("referralEvents")).toHaveLength(1);
  });

  it("T3 concurrent calls yield exactly one increment", async () => {
    seedUser("referrer", "owner@example.test");
    seedUser("referee", "new@example.test");
    seedProfile("referrer", {
      email: "owner@example.test",
      referralCode: "CODE1",
      referralSignups: 0,
      createdAt: 1_000,
    });
    seedProfile("referee", { email: "new@example.test" });

    const [first, second] = await Promise.all([
      trackReferral(trackRequest("referee", "CODE1")),
      trackReferral(trackRequest("referee", "CODE1")),
    ]);
    const bodies = await Promise.all([first.json(), second.json()]);
    expect(bodies.filter((body) => body.tracked === true)).toHaveLength(1);
    expect(bodies.filter((body) => body.tracked === false)).toHaveLength(1);
    expect(mem.get("profiles", "referrer")?.referralSignups).toBe(1);
    expect(mem.list("referralEvents")).toHaveLength(1);
    expect(mem.list("notifications")).toHaveLength(1);
  });

  it("T4 uid self-referral is not tracked", async () => {
    seedUser("same", "other-inbox@example.test");
    seedProfile("same", {
      email: "owner@example.test",
      referralCode: "CODE1",
      referralSignups: 0,
      createdAt: 1_000,
    });

    const res = await trackReferral(trackRequest("same", "CODE1"));
    expect(await res.json()).toEqual({ tracked: false });
    expect(mem.get("profiles", "same")?.referralSignups).toBe(0);
    expect(mem.list("referralEvents")).toHaveLength(0);
  });

  it("T5 an account older than 24h is not tracked", async () => {
    seedUser("referrer", "owner@example.test");
    seedUser("referee", "old@example.test", 48 * 60 * 60 * 1000);
    seedProfile("referrer", {
      email: "owner@example.test",
      referralCode: "CODE1",
      referralSignups: 0,
      createdAt: 1_000,
    });

    const res = await trackReferral(trackRequest("referee", "CODE1"));
    expect(await res.json()).toEqual({ tracked: false });
    expect(mem.get("profiles", "referrer")?.referralSignups).toBe(0);
    expect(mem.list("notifications")).toHaveLength(0);
  });

  it("T6 duplicate codes credit the older profile", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seedUser("older", "older@example.test");
    seedUser("newer", "newer@example.test");
    seedUser("referee", "new@example.test");
    seedProfile("newer", {
      email: "newer@example.test",
      referralCode: "CODE1",
      referralSignups: 0,
      createdAt: 5_000,
    });
    seedProfile("older", {
      email: "older@example.test",
      referralCode: "CODE1",
      referralSignups: 0,
      createdAt: 1_000,
    });

    const res = await trackReferral(trackRequest("referee", "CODE1"));
    expect(await res.json()).toEqual({ tracked: true, referredBy: "CODE1" });
    expect(mem.get("profiles", "older")?.referralSignups).toBe(1);
    expect(mem.get("profiles", "newer")?.referralSignups).toBe(0);
    expect(mem.get("referralEvents", "signup_referee")?.referrerUid).toBe("older");
    const warning = warn.mock.calls.map((args) => JSON.stringify(args)).join("\n");
    expect(warning).toContain("2");
    expect(warning).not.toContain("CODE1");
    expect(warning).not.toContain("@");
    warn.mockRestore();
  });

  it("T7 notification message does not contain an email", async () => {
    seedUser("referrer", "owner@example.test");
    seedUser("referee", "new@example.test");
    seedProfile("referrer", {
      email: "owner@example.test",
      referralCode: "CODE1",
      referralSignups: 0,
      createdAt: 1_000,
    });

    await trackReferral(trackRequest("referee", "CODE1"));
    const note = mem.list("notifications")[0];
    expect(note?.message).toBe("Someone signed up using your referral code!");
    expect(String(note?.message)).not.toContain("@");
    expect(JSON.stringify(note)).not.toContain("new@example.test");
    expect(note?.fromEmail).toBeUndefined();
  });
});

describe("POST /api/admin/kyc-review referral reward", () => {
  it("T8 approve twice pays 3 tokens once, and no signup event means no reward", async () => {
    seedProfile("referrer", { email: "owner@example.test", referralCode: "CODE1" });
    seedProfile("referee", {
      email: "new@example.test",
      phoneVerified: true,
      emailVerified: true,
      kycStatus: "pending",
      referredBy: "CODE1",
    });
    mem.docs.set("referralEvents/signup_referee", {
      type: "signup",
      referrerUid: "referrer",
      referrerEmail: "owner@example.test",
      refereeUid: "referee",
      code: "CODE1",
      rewardedAt: null,
    });

    const first = await kycReview(approveRequest("referee"));
    expect(first.status).toBe(200);
    expect(mem.list("dropTokens")).toHaveLength(3);
    expect(mem.list("dropTokens").every((token) => token.referralEventId === "signup_referee")).toBe(true);
    expect(mem.list("dropTokens").every((token) => token.ownerId === "referrer")).toBe(true);
    expect(mem.get("referralEvents", "signup_referee")?.rewardedBy).toBe("admin-1");
    expect(mem.get("referralEvents", "signup_referee")?.rewardedAt).toBeTruthy();
    expect(mem.list("notifications").filter((note) => note.type === "referral_reward")).toHaveLength(1);

    mem.docs.set("profiles/referee", {
      ...mem.get("profiles", "referee"),
      kycStatus: "pending",
    });
    const second = await kycReview(approveRequest("referee"));
    expect(second.status).toBe(200);
    expect(mem.list("dropTokens")).toHaveLength(3);
    expect(mem.list("notifications").filter((note) => note.type === "referral_reward")).toHaveLength(1);

    seedProfile("legacy", {
      email: "legacy@example.test",
      phoneVerified: true,
      emailVerified: true,
      kycStatus: "pending",
      referredBy: "CODE1",
    });
    const legacy = await kycReview(approveRequest("legacy"));
    expect(legacy.status).toBe(200);
    expect(mem.list("dropTokens")).toHaveLength(3);
  });
});
