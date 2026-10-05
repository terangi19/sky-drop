/**
 * Emulator-backed proof that the messages page purchases listener is allowed by
 * firestore.rules (rules are not filters: list queries must be provably within
 * the rule). Skipped unless FIRESTORE_EMULATOR_HOST is set, e.g.
 *   firebase emulators:exec --only firestore --project demo-sky-drop \
 *     "npx vitest run tests/purchases-conversation-query-rules.test.ts"
 */
import { readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  getDocs,
  getFirestore,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { buildConversationPurchasesQuery } from "../app/lib/conversation-purchase-query";

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "demo-purchases-conv-query";
const BUYER = "buyer@test.com";
const SELLER = "seller@test.com";
const OTHER = "other@test.com";

describe.skipIf(!emulator)("messages purchases listener vs firestore.rules", () => {
  let env: RulesTestEnvironment;
  const apps: FirebaseApp[] = [];

  function dbFor(name: string, email: string): Firestore {
    const [host, port] = emulator!.split(":");
    const app = initializeApp({ projectId: PROJECT_ID }, `${name}-${apps.length}`);
    apps.push(app);
    const db = getFirestore(app);
    connectFirestoreEmulator(db, host, Number(port), {
      mockUserToken: { sub: name, email, email_verified: true } as never,
    });
    return db;
  }

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync(join(process.cwd(), "firestore.rules"), "utf8") },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection("purchases").doc("mine").set({ listingId: "L1", buyerEmail: BUYER, sellerEmail: SELLER, status: "paid" });
      await db.collection("purchases").doc("someone-else").set({ listingId: "L1", buyerEmail: OTHER, sellerEmail: SELLER, status: "paid" });
    });
  });

  afterAll(async () => {
    await Promise.all(apps.map((a) => deleteApp(a)));
    await env?.cleanup();
  });

  it("the OLD bare listingId query is denied for a participant (documents the bug)", async () => {
    const db = dbFor("buyer", BUYER);
    await expect(getDocs(query(collection(db, "purchases"), where("listingId", "==", "L1")))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("buyer can run the conversation query and sees only their purchase", async () => {
    const snap = await getDocs(buildConversationPurchasesQuery(dbFor("buyer", BUYER), "L1", BUYER, SELLER));
    expect(snap.docs.map((d) => d.id)).toEqual(["mine"]);
  });

  it("seller can run the conversation query for the same pair", async () => {
    const snap = await getDocs(buildConversationPurchasesQuery(dbFor("seller", SELLER), "L1", SELLER, BUYER));
    expect(snap.docs.map((d) => d.id)).toEqual(["mine"]);
  });

  it("seller querying another buyer's pair gets only that pair's purchase", async () => {
    const snap = await getDocs(buildConversationPurchasesQuery(dbFor("seller", SELLER), "L1", SELLER, OTHER));
    expect(snap.docs.map((d) => d.id)).toEqual(["someone-else"]);
  });

  it("a non-party gets no documents for a pair they are not in (no leak)", async () => {
    const snap = await getDocs(buildConversationPurchasesQuery(dbFor("other", OTHER), "L1", OTHER, BUYER));
    expect(snap.empty).toBe(true);
  });
});
