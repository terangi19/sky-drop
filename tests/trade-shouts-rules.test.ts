/**
 * tradeShouts: who may delete, and why the shoutbox auto-clear only touches the signed-in user's own shouts.
 * Needs the Firestore emulator (skipped otherwise):
 *   firebase emulators:exec --only firestore --project demo-sky-drop "npx vitest run tests/trade-shouts-rules.test.ts"
 */
import { readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { Timestamp, collection, deleteDoc, doc, getDocs, limit, query, setDoc, where, writeBatch } from "firebase/firestore";

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let env: RulesTestEnvironment;

describe.skipIf(!emulator)("tradeShouts rules + auto-clear assumptions", () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-sky-drop-trade-shouts",
      firestore: { rules: readFileSync(join(process.cwd(), "firestore.rules"), "utf8") },
    });
  });
  afterAll(async () => {
    await env?.cleanup();
  });

  const me = () => env.authenticatedContext("u-me", { email: "me@example.com", email_verified: true }).firestore();

  async function seed() {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const old = Timestamp.fromMillis(Date.now() - 2 * 3600_000);
      await setDoc(doc(db, "tradeShouts", "mine-old"), { world: "w", text: "a", by: "me@example.com", createdAt: old });
      await setDoc(doc(db, "tradeShouts", "theirs-old"), { world: "w", text: "b", by: "them@example.com", createdAt: old });
      await setDoc(doc(db, "tradeShouts", "mine-new"), { world: "w", text: "c", by: "me@example.com", createdAt: Timestamp.now() });
    });
  }

  it("the OLD cutoff (createdAt < plain number) matches nothing; a Timestamp cutoff matches the expired shouts", async () => {
    await seed();
    const byNumber = await getDocs(query(collection(me(), "tradeShouts"), where("createdAt", "<", Date.now() / 1000 - 3600), limit(50)));
    expect(byNumber.size).toBe(0);
    const byTimestamp = await getDocs(query(collection(me(), "tradeShouts"), where("createdAt", "<", Timestamp.fromMillis(Date.now() - 3600_000)), limit(50)));
    expect(byTimestamp.size).toBe(2);
  });

  it("an author can delete their own shout", async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(me(), "tradeShouts", "mine-new")));
  });

  it("an author cannot delete someone else's shout; signed-out cannot delete", async () => {
    await seed();
    await assertFails(deleteDoc(doc(me(), "tradeShouts", "theirs-old")));
    await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), "tradeShouts", "mine-old")));
  });

  it("a batch that includes one foreign shout is rejected as a whole (why the old client sweep could never work)", async () => {
    await seed();
    const db = me();
    const batch = writeBatch(db);
    batch.delete(doc(db, "tradeShouts", "mine-old"));
    batch.delete(doc(db, "tradeShouts", "theirs-old"));
    await assertFails(batch.commit());
    await env.withSecurityRulesDisabled(async (ctx) => {
      const left = (await getDocs(collection(ctx.firestore(), "tradeShouts"))).docs.map((d) => d.id).sort();
      expect(left).toEqual(["mine-new", "mine-old", "theirs-old"]);
    });
  });

  it("a batch of only the author's own expired shouts succeeds (what the fixed auto-clear sends)", async () => {
    await seed();
    const db = me();
    const batch = writeBatch(db);
    batch.delete(doc(db, "tradeShouts", "mine-old"));
    await assertSucceeds(batch.commit());
  });
});
