/**
 * Emulator rules suite (PROMPT-8): `reviews` are server-only for writes.
 * /api/submit-review (Admin SDK) is the only creator and validates rating (integer 1-5) + comment cap.
 * A reviewer used to be able to edit rating/text/comment or delete their own review from the client:
 * 5★ -> 1★ after the seller ships (extortion), a 1 MB comment past the route cap, and with #117 those
 * edits feed profiles.averageRating. Moderation stays on Admin SDK routes (ban-user, report-action).
 *
 * Run: firebase emulators:exec --only firestore --project demo-sky-drop \
 *        "npx vitest run tests/reviews-client-write-lockdown.test.ts"
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

const PROJECT_ID = "demo-sky-drop-reviews-lockdown";
const SKIP = !process.env.FIRESTORE_EMULATOR_HOST && !process.env.CI;
let testEnv: RulesTestEnvironment;

const REVIEWER = { uid: "rv-buyer", email: "rv-buyer@test.com" };
const SELLER = { uid: "rv-seller", email: "rv-seller@test.com" };
const OTHER = { uid: "rv-other", email: "rv-other@test.com" };
const ADMIN = { uid: "rv-admin", email: "rv-admin@test.com" };

const as = (u: { uid: string; email: string }, extra: Record<string, unknown> = {}) =>
  testEnv.authenticatedContext(u.uid, { email: u.email, email_verified: true, ...extra }).firestore();

const REVIEW = {
  purchaseId: "p1",
  reviewerId: REVIEWER.uid,
  reviewerEmail: REVIEWER.email,
  revieweeId: SELLER.uid,
  revieweeEmail: SELLER.email,
  sellerEmail: SELLER.email,
  buyerEmail: REVIEWER.email,
  role: "buyer",
  rating: 5,
  comment: "Great",
  reviewText: "Great",
};

describe.skipIf(SKIP)("reviews: client write lockdown", () => {
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
      await db.doc("reviews/r1").set(REVIEW);
      await db.doc(`admins/${ADMIN.uid}`).set({ email: ADMIN.email, role: "admin" });
    });
  });

  // Positive controls: public reads keep working (profile/listing/reviews pages).
  it("anyone (even signed out) can read a review", async () => {
    await assertSucceeds(testEnv.unauthenticatedContext().firestore().doc("reviews/r1").get());
    await assertSucceeds(as(OTHER).doc("reviews/r1").get());
  });
  it("list query by revieweeId still works", async () => {
    await assertSucceeds(as(OTHER).collection("reviews").where("revieweeId", "==", SELLER.uid).get());
  });

  it("reviewer cannot change the rating (5 -> 1 after shipping)", async () => {
    await assertFails(as(REVIEWER).doc("reviews/r1").update({ rating: 1 }));
  });
  it("reviewer cannot write an out-of-range / non-integer / non-number rating", async () => {
    for (const rating of [0, 6, 999, 4.5, "5", null]) {
      await assertFails(as(REVIEWER).doc("reviews/r1").update({ rating }));
    }
  });
  it("reviewer cannot rewrite text, comment or reviewText (incl. a huge blob)", async () => {
    await assertFails(as(REVIEWER).doc("reviews/r1").update({ text: "Call 021 555 0000" }));
    await assertFails(as(REVIEWER).doc("reviews/r1").update({ comment: "x".repeat(200_000) }));
    await assertFails(as(REVIEWER).doc("reviews/r1").update({ reviewText: "edited" }));
    await assertFails(as(REVIEWER).doc("reviews/r1").update({ updatedAt: new Date() }));
  });
  it("reviewer cannot overwrite the doc with set / set merge", async () => {
    await assertFails(as(REVIEWER).doc("reviews/r1").set({ ...REVIEW, rating: 1 }));
    await assertFails(as(REVIEWER).doc("reviews/r1").set({ rating: 1 }, { merge: true }));
  });
  it("reviewer cannot delete their review", async () => {
    await assertFails(as(REVIEWER).doc("reviews/r1").delete());
  });
  it("reviewee (seller) cannot edit or delete a review about them", async () => {
    await assertFails(as(SELLER).doc("reviews/r1").update({ rating: 5, hidden: true }));
    await assertFails(as(SELLER).doc("reviews/r1").delete());
  });
  it("third parties and signed-out users cannot write", async () => {
    await assertFails(as(OTHER).doc("reviews/r1").update({ rating: 1 }));
    await assertFails(as(OTHER).doc("reviews/r1").delete());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc("reviews/r1").delete());
  });
  it("no client create (with any id, including the deterministic one)", async () => {
    await assertFails(as(REVIEWER).doc("reviews/p2_rv-buyer").set({ ...REVIEW, purchaseId: "p2" }));
    await assertFails(as(REVIEWER).collection("reviews").add({ ...REVIEW, purchaseId: "p3" }));
  });
  it("no client admin path either (moderation is Admin SDK only)", async () => {
    await assertFails(as(ADMIN, { admin: true }).doc("reviews/r1").update({ hidden: true }));
    await assertFails(as(ADMIN, { admin: true }).doc("reviews/r1").delete());
  });
});
