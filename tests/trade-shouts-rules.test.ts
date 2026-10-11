/**
 * Emulator rules suite: tradeShouts (server-only create/update, uid-or-legacy-email delete, admin delete)
 * and the tradePosts owner-update allow-list (status, updatedAt).
 *
 * Run: npm run test:rules:emulator   (or: firebase emulators:exec --only firestore --project demo-sky-drop
 *      "npx vitest run tests/trade-shouts-rules.test.ts")
 * Own projectId so it never shares emulator state with tests/firestore-rules.test.ts.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-sky-drop-trade-shouts";
let testEnv: RulesTestEnvironment;

const ALICE = { uid: "ts-alice", email: "ts-alice@test.com" };
const BOB = { uid: "ts-bob", email: "ts-bob@test.com" };
const ADMIN = { uid: "ts-admin", email: "ts-admin@test.com" };
const LISTED_ADMIN = { uid: "ts-listed-admin", email: "ts-listed-admin@test.com" };

function as(user: { uid: string; email: string }, claims: Record<string, unknown> = {}) {
  return testEnv
    .authenticatedContext(user.uid, { email: user.email, email_verified: true, ...claims })
    .firestore();
}

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(join(process.cwd(), "firestore.rules"), "utf8") },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed("config/adminEmails", { emails: [LISTED_ADMIN.email] });
  // New-style shout (route writes byId/byName once #83 is merged) and a legacy email-only shout.
  await seed("tradeShouts/new-alice", {
    world: "__general__", text: "hi", by: ALICE.email, byId: ALICE.uid, byName: "alice", createdAt: new Date(),
  });
  await seed("tradeShouts/legacy-alice", {
    world: "__general__", text: "old", by: ALICE.email, createdAt: new Date(),
  });
  // Same email as Alice but a different uid in byId: uid must win.
  await seed("tradeShouts/new-other-uid", {
    world: "__general__", text: "x", by: ALICE.email, byId: "someone-else", createdAt: new Date(),
  });
  await seed("tradePosts/post-1", {
    title: "Post", sellerId: ALICE.uid, sellerEmail: ALICE.email, status: "live",
    replies: [], offers: 0, world: "w1", createdAt: new Date(), expiresAt: new Date(),
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const goodShout = (by: string, byId: string, extra: Record<string, unknown> = {}) => ({
  world: "__general__", text: "hello", by, byId, byName: "alice", createdAt: new Date(), ...extra,
});

describe("tradeShouts read", () => {
  it("signed-out and signed-in can read", async () => {
    await assertSucceeds(testEnv.unauthenticatedContext().firestore().doc("tradeShouts/new-alice").get());
    await assertSucceeds(as(BOB).doc("tradeShouts/new-alice").get());
  });
});

describe("tradeShouts create is server-only", () => {
  it("verified user cannot create even a well-formed own shout", async () => {
    await assertFails(as(ALICE).collection("tradeShouts").add(goodShout(ALICE.email, ALICE.uid)));
    await assertFails(as(ALICE).doc("tradeShouts/client-set").set(goodShout(ALICE.email, ALICE.uid)));
  });

  it("unverified user cannot create", async () => {
    const db = testEnv
      .authenticatedContext(ALICE.uid, { email: ALICE.email, email_verified: false })
      .firestore();
    await assertFails(db.collection("tradeShouts").add(goodShout(ALICE.email, ALICE.uid)));
  });

  it("signed-out cannot create", async () => {
    await assertFails(
      testEnv.unauthenticatedContext().firestore().collection("tradeShouts").add(goodShout(ALICE.email, ALICE.uid))
    );
  });

  it("spoofed byName / byId of another member is denied", async () => {
    await assertFails(
      as(ALICE).collection("tradeShouts").add(goodShout(ALICE.email, ALICE.uid, { byName: "bob" }))
    );
    await assertFails(as(ALICE).collection("tradeShouts").add(goodShout(ALICE.email, BOB.uid)));
  });

  it("admin cannot create from the client either", async () => {
    await assertFails(as(ADMIN, { admin: true }).collection("tradeShouts").add(goodShout(ADMIN.email, ADMIN.uid)));
  });
});

describe("tradeShouts update is denied", () => {
  it("owner, other user and admin cannot update", async () => {
    await assertFails(as(ALICE).doc("tradeShouts/new-alice").update({ text: "edited" }));
    await assertFails(as(ALICE).doc("tradeShouts/legacy-alice").update({ text: "edited" }));
    await assertFails(as(BOB).doc("tradeShouts/new-alice").update({ text: "edited" }));
    await assertFails(as(ADMIN, { admin: true }).doc("tradeShouts/new-alice").update({ text: "edited" }));
  });
});

describe("tradeShouts delete", () => {
  it("byId owner can delete", async () => {
    await assertSucceeds(as(ALICE).doc("tradeShouts/new-alice").delete());
  });

  it("legacy doc (no byId): email owner can delete", async () => {
    await assertSucceeds(as(ALICE).doc("tradeShouts/legacy-alice").delete());
  });

  it("same email but different uid is denied when the doc has byId (uid beats email)", async () => {
    await assertFails(as(ALICE).doc("tradeShouts/new-other-uid").delete());
  });

  it("other user is denied (new and legacy docs)", async () => {
    await assertFails(as(BOB).doc("tradeShouts/new-alice").delete());
    await assertFails(as(BOB).doc("tradeShouts/legacy-alice").delete());
  });

  it("signed-out is denied", async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc("tradeShouts/new-alice").delete());
  });

  it("admin (custom claim) and admin (config/adminEmails) can delete", async () => {
    await assertSucceeds(as(ADMIN, { admin: true }).doc("tradeShouts/new-alice").delete());
    await assertSucceeds(as(LISTED_ADMIN).doc("tradeShouts/legacy-alice").delete());
  });

  it("batch of own shouts succeeds; a batch with a foreign shout fails as a whole", async () => {
    const alice = as(ALICE);
    const ok = alice.batch();
    ok.delete(alice.doc("tradeShouts/new-alice"));
    ok.delete(alice.doc("tradeShouts/legacy-alice"));
    await assertSucceeds(ok.commit());

    await seed("tradeShouts/legacy-alice-2", { world: "__general__", text: "x", by: ALICE.email, createdAt: new Date() });
    await seed("tradeShouts/bob-1", { world: "__general__", text: "x", by: BOB.email, byId: BOB.uid, createdAt: new Date() });
    const mixed = alice.batch();
    mixed.delete(alice.doc("tradeShouts/legacy-alice-2"));
    mixed.delete(alice.doc("tradeShouts/bob-1"));
    await assertFails(mixed.commit());
  });
});

describe("tradePosts owner update allow-list", () => {
  it("owner can update status (and updatedAt)", async () => {
    await assertSucceeds(as(ALICE).doc("tradePosts/post-1").update({ status: "sold" }));
    await assertSucceeds(as(ALICE).doc("tradePosts/post-1").update({ status: "live", updatedAt: new Date() }));
  });

  it.each([
    ["replies", [{ by: "ts-bob@test.com", byName: "bob", text: "forged" }]],
    ["offers", 999999],
    ["createdAt", new Date("2099-01-01T00:00:00.000Z")],
    ["world", "other-world"],
    ["expiresAt", new Date("2099-01-01T00:00:00.000Z")],
    ["title", "renamed"],
    ["promotedUntil", new Date("2099-01-01T00:00:00.000Z")],
  ])("owner cannot update %s", async (field, value) => {
    await assertFails(as(ALICE).doc("tradePosts/post-1").update({ [field]: value }));
    await assertFails(as(ALICE).doc("tradePosts/post-1").update({ status: "sold", [field]: value }));
  });

  it("non-owner and signed-out cannot update, even status", async () => {
    await assertFails(as(BOB).doc("tradePosts/post-1").update({ status: "sold" }));
    await assertFails(testEnv.unauthenticatedContext().firestore().doc("tradePosts/post-1").update({ status: "sold" }));
  });

  it("owner delete is unchanged (still allowed); non-owner delete denied", async () => {
    await assertFails(as(BOB).doc("tradePosts/post-1").delete());
    await assertSucceeds(as(ALICE).doc("tradePosts/post-1").delete());
  });
});
