/**
 * Emulator rules suite (PROMPT-13): follow edges are readable only by the follower.
 * The seller used to be able to list `followers where sellerId == me` and read every follower's
 * email (followerEmail). Sellers now see only profiles.followers (count) via the public profile API.
 *
 * Run: firebase emulators:exec --only firestore --project demo-sky-drop \
 *        "npx vitest run tests/followers-uid-only-rules.test.ts"
 * Own projectId; skips locally without an emulator, always runs in CI.
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

const PROJECT_ID = "demo-sky-drop-followers-uid";
const SKIP = !process.env.FIRESTORE_EMULATOR_HOST && !process.env.CI;
let testEnv: RulesTestEnvironment;

const SELLER = { uid: "fsSeller1", email: "fs-seller@test.com" };
const FAN = { uid: "fsFan1", email: "fs-fan@test.com" };
const OTHER = { uid: "fsOther1", email: "fs-other@test.com" };
const EDGE = `${SELLER.uid}_${FAN.uid}`;

const as = (u: { uid: string; email: string }) =>
  testEnv.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();

describe.skipIf(SKIP)("followers: uid-only edges, follower-only reads", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync(join(process.cwd(), "firestore.rules"), "utf8") },
    });
  });
  afterAll(async () => {
    await testEnv?.cleanup();
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // legacy doc shape (pre-scrub) to prove the seller can't read the email off it
      await db.doc(`followers/${EDGE}`).set({
        sellerId: SELLER.uid,
        followerId: FAN.uid,
        followerEmail: FAN.email,
        sellerEmail: SELLER.email,
      });
      await db.doc(`followers/${SELLER.uid}_${OTHER.uid}`).set({ sellerId: SELLER.uid, followerId: OTHER.uid });
    });
  });

  // Positive controls (app paths).
  it("follower can get their own edge (seller page 'Following' state)", async () => {
    await assertSucceeds(as(FAN).doc(`followers/${EDGE}`).get());
  });
  it("follower can list their own edges (profile Following tab)", async () => {
    await assertSucceeds(as(FAN).collection("followers").where("followerId", "==", FAN.uid).limit(100).get());
  });
  it("non-follower can check their own (missing) edge without a permission error", async () => {
    await assertSucceeds(as(OTHER).doc(`followers/someSeller_${OTHER.uid}`).get());
  });

  // The leak.
  it("seller cannot get a follower's edge (no followerEmail)", async () => {
    await assertFails(as(SELLER).doc(`followers/${EDGE}`).get());
  });
  it("seller cannot list who follows them", async () => {
    await assertFails(as(SELLER).collection("followers").where("sellerId", "==", SELLER.uid).get());
  });
  it("third parties and signed-out users cannot read edges", async () => {
    await assertFails(as(OTHER).doc(`followers/${EDGE}`).get());
    await assertFails(as(OTHER).collection("followers").where("followerId", "==", FAN.uid).get());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(`followers/${EDGE}`).get());
  });
  it("missing-edge get only for ids ending in the caller's uid", async () => {
    await assertFails(as(OTHER).doc(`followers/someSeller_${FAN.uid}`).get());
    await assertFails(as(OTHER).doc(`followers/a_${OTHER.uid}_b`).get());
    await assertFails(as(OTHER).doc(`followers/${OTHER.uid}`).get());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(`followers/x_${OTHER.uid}`).get());
  });
  it("legacy followingId field grants nothing", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("followers/legacy1").set({ followingId: OTHER.uid, followerEmail: FAN.email });
    });
    await assertFails(as(OTHER).doc("followers/legacy1").get());
  });
  it("no client writes, even to your own edge", async () => {
    await assertFails(as(FAN).doc(`followers/x_${FAN.uid}`).set({ sellerId: "x", followerId: FAN.uid }));
    await assertFails(as(FAN).doc(`followers/${EDGE}`).update({ followerEmail: null }));
    await assertFails(as(FAN).doc(`followers/${EDGE}`).delete());
    await assertFails(as(SELLER).doc(`followers/${EDGE}`).delete());
  });
});
