/**
 * Emulator rules suite: listings and unused public collections are server-only for writes, and
 * profile owners cannot write server-trusted fields.
 *
 * Why: /api/create-listing and /api/update-listing (Admin SDK) enforce the restricted/suspended ban,
 * abuse engine, Turnstile, disposable-email gate, sanitizer, price checks, digital pending_review
 * and the Stripe publish check. The old rules let any verified user create/update listings directly,
 * so a banned user could relist and a seller could self-approve pending_review or set promotedUntil.
 *
 * Run: npm run test:rules:emulator   (or: firebase emulators:exec --only firestore --project demo-sky-drop
 *      "npx vitest run tests/listings-client-write-lockdown.test.ts")
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

const PROJECT_ID = "demo-sky-drop-listings-lockdown";
const SKIP = !process.env.FIRESTORE_EMULATOR_HOST && !process.env.CI;
let testEnv: RulesTestEnvironment;

const SELLER = { uid: "ll-seller", email: "ll-seller@test.com" };
const BANNED = { uid: "ll-banned", email: "ll-banned@test.com" };
const OTHER = { uid: "ll-other", email: "ll-other@test.com" };

function as(user: { uid: string; email: string }, verified = true) {
  return testEnv
    .authenticatedContext(user.uid, { email: user.email, email_verified: verified })
    .firestore();
}

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

describe.skipIf(SKIP)("listings + unused collections + profile server fields (client write lockdown)", () => {
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
    await seed(`profiles/${BANNED.uid}`, { email: BANNED.email, restricted: true, bannedAt: new Date() });
    await seed(`profiles/${SELLER.uid}`, {
      email: SELLER.email,
      username: "llseller",
      averageRating: 3.2,
      reviewCount: 4,
      salesCount: 2,
      xp: 10,
    });
    await seed("listings/pending", {
      title: "Digital pack",
      sellerEmail: SELLER.email,
      sellerId: SELLER.uid,
      sellerUsername: "llseller",
      status: "pending_review",
      price: "10",
    });
    await seed("listings/live", {
      title: "Camera",
      sellerEmail: SELLER.email,
      sellerId: SELLER.uid,
      status: "live",
      price: "100",
    });
    await seed("drops/d1", { sellerEmail: SELLER.email, title: "Drop" });
    await seed("promotions/p1", { sellerEmail: SELLER.email, status: "pending" });
  });

  describe("listings", () => {
    it("anyone can still read listings", async () => {
      await assertSucceeds(testEnv.unauthenticatedContext().firestore().doc("listings/live").get());
    });

    it("a banned (restricted) verified user cannot relist by writing Firestore directly", async () => {
      await assertFails(
        as(BANNED).collection("listings").doc("relist").set({
          title: "Back again",
          sellerEmail: BANNED.email,
          sellerId: BANNED.uid,
          status: "live",
          price: "5",
        })
      );
    });

    it("a normal verified seller cannot create a listing directly, even with honest fields", async () => {
      await assertFails(
        as(SELLER).collection("listings").doc("direct").set({
          title: "Honest item",
          sellerEmail: SELLER.email,
          sellerId: SELLER.uid,
          price: "10",
        })
      );
    });

    it("direct create cannot mint badges, promotion or a live status", async () => {
      await assertFails(
        as(SELLER).collection("listings").doc("badged").set({
          title: "Badged",
          sellerEmail: SELLER.email,
          sellerId: SELLER.uid,
          verified: true,
          adminVerified: true,
          featured: true,
          promotedUntil: new Date(Date.now() + 30 * 86400000),
          visibilityRank: "boosted",
          status: "live",
        })
      );
    });

    it("seller cannot self-approve pending_review", async () => {
      await assertFails(as(SELLER).doc("listings/pending").update({ status: "live" }));
    });

    it("seller cannot set promotedUntil (paid promotion stays server-side)", async () => {
      await assertFails(
        as(SELLER).doc("listings/live").update({ promotedUntil: new Date(Date.now() + 7 * 86400000) })
      );
    });

    it("seller cannot rename the public seller handle or edit title/description directly", async () => {
      await assertFails(as(SELLER).doc("listings/live").update({ sellerUsername: "SkyDropOfficial" }));
      await assertFails(as(SELLER).doc("listings/live").update({ title: "Camera (edited)" }));
      await assertFails(as(SELLER).doc("listings/live").update({ description: "call 021 000 000" }));
    });

    it("seller can still delete their own listing; others cannot", async () => {
      await assertFails(as(OTHER).doc("listings/live").delete());
      await assertSucceeds(as(SELLER).doc("listings/live").delete());
    });
  });

  describe("unused public collections are server-only", () => {
    it("drops: no client create/update/delete; read stays public", async () => {
      await assertFails(
        as(SELLER).collection("drops").doc("d2").set({ sellerEmail: SELLER.email, featured: true })
      );
      await assertFails(as(SELLER).doc("drops/d1").update({ title: "x" }));
      await assertFails(as(SELLER).doc("drops/d1").delete());
      await assertSucceeds(testEnv.unauthenticatedContext().firestore().doc("drops/d1").get());
    });

    it("promotions: no client create/update/delete", async () => {
      await assertFails(
        as(SELLER).collection("promotions").doc("p2").set({ sellerEmail: SELLER.email, status: "active" })
      );
      await assertFails(as(SELLER).doc("promotions/p1").update({ status: "active" }));
      await assertFails(as(SELLER).doc("promotions/p1").delete());
    });

    it("hustlerLinks / hustlerEvents / hustlerClicks: no client create", async () => {
      await assertFails(as(SELLER).collection("hustlerLinks").doc("h1").set({ promoterId: SELLER.uid }));
      await assertFails(as(SELLER).collection("hustlerEvents").doc("e1").set({ creatorId: SELLER.uid }));
      await assertFails(as(SELLER).collection("hustlerClicks").doc("c1").set({ click: true }));
    });
  });

  describe("profiles: server-trusted fields", () => {
    const serverOnly: Array<[string, unknown]> = [
      ["earningsBalance", 1_000_000],
      ["reportsCount", 0],
      ["warningCount", 0],
      ["suspended", false],
      ["suspendedAt", null],
      ["restrictionReason", ""],
      ["responseTime", 1],
      ["profileViews", 99999],
      // Regression: already denied before this change; keep them denied.
      ["averageRating", 5],
      ["reviewCount", 500],
      ["salesCount", 500],
      ["xp", 1_000_000],
      ["level", 99],
    ];

    it.each(serverOnly)("owner cannot update %s", async (field, value) => {
      await assertFails(as(SELLER).doc(`profiles/${SELLER.uid}`).update({ [field]: value }));
    });

    it.each(serverOnly)("owner cannot create a profile carrying %s", async (field, value) => {
      await assertFails(
        as(OTHER).doc(`profiles/${OTHER.uid}`).set({ email: OTHER.email, username: "llother", [field]: value })
      );
    });

    it("owner can still edit ordinary profile fields (positive control)", async () => {
      await assertSucceeds(
        as(SELLER).doc(`profiles/${SELLER.uid}`).update({ bio: "Hi", phone: "", lastActive: new Date() })
      );
    });

    it("the signup profile shape still creates (positive control)", async () => {
      await assertSucceeds(
        as(OTHER, false).doc(`profiles/${OTHER.uid}`).set({
          email: OTHER.email,
          username: "llother",
          phone: "",
          referralCode: "ABC123",
          memberSince: new Date(),
          lastActive: new Date(),
          createdAt: new Date(),
        })
      );
    });
  });
});
