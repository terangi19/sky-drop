/**
 * Emulator rules suite: purchases client update split by role.
 * Buyer: shippingAddress (+updatedAt) only, and only before the order ships.
 * Seller: tracking/trackingNumber (+updatedAt) only.
 * Nobody: reviewed / buyerReviewed / sellerReviewed / status (server-only via API routes).
 *
 * Run: npm run test:rules:emulator   (or: firebase emulators:exec --only firestore --project demo-sky-drop
 *      "npx vitest run tests/purchases-update-rules.test.ts")
 * Own projectId so it never shares emulator state with tests/firestore-rules.test.ts.
 * Skips locally without an emulator; in CI (CI set) it always runs and fails loudly if the emulator is missing.
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

const PROJECT_ID = "demo-sky-drop-purchases-update";
const SKIP = !process.env.FIRESTORE_EMULATOR_HOST && !process.env.CI;
let testEnv: RulesTestEnvironment;

const BUYER = { uid: "pu-buyer", email: "pu-buyer@test.com" };
const SELLER = { uid: "pu-seller", email: "pu-seller@test.com" };
const STRANGER = { uid: "pu-stranger", email: "pu-stranger@test.com" };

function as(user: { uid: string; email: string }) {
  return testEnv
    .authenticatedContext(user.uid, { email: user.email, email_verified: true })
    .firestore();
}

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

const base = {
  buyerEmail: BUYER.email,
  sellerEmail: SELLER.email,
  listingId: "l1",
  status: "seller_confirming",
  shippingAddress: "1 Old St, Auckland",
  // isDisputeActive() reads resource.data.disputeStatus directly, so a doc WITHOUT the
  // field errors and every client update is denied (unchanged; see the last test).
  // Seed a closed-dispute value so the role split itself is exercised.
  disputeStatus: "resolved_seller",
};

describe.skipIf(SKIP)("purchases update rule (role split)", () => {
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
    await seed("purchases/p1", base);
    await seed("purchases/p-shipped", { ...base, status: "shipped", tracking: "NZ123" });
    await seed("purchases/p-disputed", { ...base, disputeStatus: "open" });
    await seed("purchases/p-nostatus", { buyerEmail: BUYER.email, sellerEmail: SELLER.email, disputeStatus: "" });
    await seed("purchases/p-nodispute-field", { buyerEmail: BUYER.email, sellerEmail: SELLER.email, status: "pending" });
  });

  const ref = (db: ReturnType<typeof as>, id = "p1") => db.collection("purchases").doc(id);

  it("buyer may update shippingAddress (and updatedAt) before shipment", async () => {
    await assertSucceeds(ref(as(BUYER)).update({ shippingAddress: "2 New Rd, Wellington" }));
    await assertSucceeds(ref(as(BUYER)).update({ shippingAddress: "3 Rd", updatedAt: new Date() }));
    await assertSucceeds(ref(as(BUYER), "p-nostatus").update({ shippingAddress: "4 Rd" }));
  });

  it("buyer may not change shippingAddress once the order has shipped or closed", async () => {
    await assertFails(ref(as(BUYER), "p-shipped").update({ shippingAddress: "late change" }));
    for (const status of ["delivered", "completed", "cancelled", "refunded"]) {
      await seed(`purchases/p-${status}`, { ...base, status });
      await assertFails(ref(as(BUYER), `p-${status}`).update({ shippingAddress: "x" }));
    }
  });

  it("buyer may not write tracking / trackingNumber", async () => {
    await assertFails(ref(as(BUYER)).update({ tracking: "FAKE" }));
    await assertFails(ref(as(BUYER)).update({ trackingNumber: "FAKE" }));
    await assertFails(ref(as(BUYER)).update({ shippingAddress: "x", tracking: "FAKE" }));
  });

  it("buyer may not write reviewed / buyerReviewed / sellerReviewed / status", async () => {
    await assertFails(ref(as(BUYER)).update({ reviewed: false }));
    await assertFails(ref(as(BUYER)).update({ reviewed: true }));
    await assertFails(ref(as(BUYER)).update({ buyerReviewed: false }));
    await assertFails(ref(as(BUYER)).update({ sellerReviewed: true }));
    await assertFails(ref(as(BUYER)).update({ status: "delivered" }));
    await assertFails(ref(as(BUYER)).update({ shippingAddress: "x", reviewed: false }));
  });

  it("seller may update tracking / trackingNumber (and updatedAt), including after shipment", async () => {
    await assertSucceeds(ref(as(SELLER)).update({ tracking: "NZ999" }));
    await assertSucceeds(ref(as(SELLER)).update({ trackingNumber: "NZ999", updatedAt: new Date() }));
    await assertSucceeds(ref(as(SELLER), "p-shipped").update({ tracking: "NZ124", trackingNumber: "NZ124" }));
  });

  it("seller may not write the buyer's shippingAddress", async () => {
    await assertFails(ref(as(SELLER)).update({ shippingAddress: "seller-chosen address" }));
    await assertFails(ref(as(SELLER)).update({ tracking: "NZ1", shippingAddress: "x" }));
  });

  it("seller may not write reviewed (cannot block the buyer's review) or other review flags", async () => {
    await assertFails(ref(as(SELLER)).update({ reviewed: true }));
    await assertFails(ref(as(SELLER)).update({ buyerReviewed: true }));
    await assertFails(ref(as(SELLER)).update({ sellerReviewed: false }));
    await assertFails(ref(as(SELLER)).update({ tracking: "NZ1", reviewed: true }));
    await assertFails(ref(as(SELLER)).update({ status: "delivered" }));
  });

  it("non-party and signed-out users cannot update any field", async () => {
    await assertFails(ref(as(STRANGER)).update({ shippingAddress: "x" }));
    await assertFails(ref(as(STRANGER)).update({ tracking: "x" }));
    await assertFails(ref(as(STRANGER)).update({ reviewed: true }));
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.collection("purchases").doc("p1").update({ tracking: "x" }));
  });

  it("no client update while a dispute is active (either role)", async () => {
    await assertFails(ref(as(BUYER), "p-disputed").update({ shippingAddress: "x" }));
    await assertFails(ref(as(SELLER), "p-disputed").update({ tracking: "x" }));
  });

  it("unchanged: a purchase with no disputeStatus field denies every client update", async () => {
    await assertFails(ref(as(BUYER), "p-nodispute-field").update({ shippingAddress: "x" }));
    await assertFails(ref(as(SELLER), "p-nodispute-field").update({ tracking: "x" }));
    await assertFails(ref(as(SELLER), "p-nodispute-field").update({ reviewed: true }));
  });

  it("client create and delete stay denied", async () => {
    await assertFails(ref(as(BUYER), "p-new").set({ ...base }));
    await assertFails(ref(as(SELLER), "p-new2").set({ ...base }));
    await assertFails(ref(as(BUYER)).delete());
    await assertFails(ref(as(SELLER)).delete());
  });

  it("parties can still read their own purchase; strangers cannot", async () => {
    await assertSucceeds(ref(as(BUYER)).get());
    await assertSucceeds(ref(as(SELLER)).get());
    await assertFails(ref(as(STRANGER)).get());
  });
});
