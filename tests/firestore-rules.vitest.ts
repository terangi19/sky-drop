/**
 * Firestore Security Rules Tests
 *
 * Run with Firebase Emulator Suite:
 *   1. npx firebase emulators:start --only firestore
 *   2. npx vitest run tests/firestore-rules.vitest.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, beforeAll, afterAll } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "sky-drop-de459";
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rulesPath = join(process.cwd(), "firestore.rules");
  const rules = readFileSync(rulesPath, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("Firestore Security Rules", () => {
  describe("Listings", () => {
    it("unauthenticated users can read listings", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      const ref = db.collection("listings").doc("test");
      // Should be allowed: public read
      await assertSucceeds(ref.get());
    });

    it("unauthenticated users cannot create listings", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      const ref = db.collection("listings").doc();
      await assertFails(
        ref.set({ title: "test", sellerEmail: "someone@test.com" })
      );
    });

    it("authenticated user can create own listing", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "seller@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("listings").doc();
      await assertSucceeds(
        ref.set({ title: "Item", sellerEmail: "seller@test.com", price: "10" })
      );
    });

    it("cannot create listing with another user's email", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "seller@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("listings").doc();
      await assertFails(
        ref.set({ title: "Item", sellerEmail: "other@test.com", price: "10" })
      );
    });

    it("cannot delete another user's listing", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "seller@test.com" })
        .firestore();
      const ref = db.collection("listings").doc("test");
      await ref.set({ title: "Item", sellerEmail: "seller@test.com" });

      const db2 = testEnv
        .authenticatedContext("user2", { email: "attacker@test.com" })
        .firestore();
      const ref2 = db2.collection("listings").doc("test");
      await assertFails(ref2.delete());
    });
  });

  describe("Messages", () => {
    it("can only read messages where user is participant", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "user1@test.com" })
        .firestore();

      const msgRef = db.collection("messages").doc("msg1");
      await msgRef.set({
        participants: ["user1@test.com", "user2@test.com"],
        text: "Hello",
      });

      const db2 = testEnv
        .authenticatedContext("user3", { email: "user3@test.com" })
        .firestore();
      const msgRef2 = db2.collection("messages").doc("msg1");
      await assertFails(msgRef2.get());
    });
  });

  describe("Purchases", () => {
    it("client cannot create purchases directly", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "buyer@test.com" })
        .firestore();
      const ref = db.collection("purchases").doc("test");
      await assertFails(
        ref.set({ listingId: "listing1", buyerEmail: "buyer@test.com", sellerEmail: "seller@test.com" })
      );
    });

    it("buyer can read own purchase", async () => {
      const admin = testEnv.unauthenticatedContext().firestore();
      const ref = admin.collection("purchases").doc("test");
      await ref.set({
        buyerEmail: "buyer@test.com",
        sellerEmail: "seller@test.com",
        listingId: "test",
        status: "pending",
      });

      const db = testEnv
        .authenticatedContext("buyer", { email: "buyer@test.com" })
        .firestore();
      await assertSucceeds(db.collection("purchases").doc("test").get());
    });

    it("other user cannot read someone else's purchase", async () => {
      const db = testEnv
        .authenticatedContext("attacker", { email: "attacker@test.com" })
        .firestore();
      await assertFails(db.collection("purchases").doc("test").get());
    });

    it("buyer cannot set purchase status to delivered via client", async () => {
      const admin = testEnv.unauthenticatedContext().firestore();
      await admin.collection("purchases").doc("test").set({
        buyerEmail: "buyer@test.com",
        sellerEmail: "seller@test.com",
        listingId: "test",
        status: "shipped",
      });

      const db = testEnv
        .authenticatedContext("buyer", { email: "buyer@test.com" })
        .firestore();
      await assertFails(
        db.collection("purchases").doc("test").update({ status: "delivered" })
      );
    });
  });

  describe("Notifications", () => {
    it("cannot create notification from client (server-only)", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "user1@test.com" })
        .firestore();
      const ref = db.collection("notifications").doc();
      await assertFails(
        ref.set({
          targetEmail: "victim@test.com",
          fromEmail: "user1@test.com",
          type: "test",
          title: "Test",
          message: "Test",
          read: false,
        })
      );
    });
  });

  describe("hustlerClicks", () => {
    it("unauthenticated user cannot create clicks", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      const ref = db.collection("hustlerClicks").doc();
      await assertFails(ref.set({ click: true }));
    });

    it("authenticated user can create clicks", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "user1@test.com" })
        .firestore();
      const ref = db.collection("hustlerClicks").doc();
      await assertSucceeds(ref.set({ click: true }));
    });
  });

  describe("Reviews", () => {
    it("only buyer of completed purchase can review", async () => {
      const admin = testEnv.unauthenticatedContext().firestore();

      const purchaseRef = admin.collection("purchases").doc("purchase1");
      await purchaseRef.set({
        buyerEmail: "buyer@test.com",
        sellerEmail: "seller@test.com",
        status: "completed",
      });

      const db = testEnv
        .authenticatedContext("buyer1", { email: "buyer@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("reviews").doc();
      await assertSucceeds(
        ref.set({
          reviewerEmail: "buyer@test.com",
          sellerEmail: "seller@test.com",
          purchaseId: "purchase1",
          rating: 5,
          text: "Great!",
        })
      );
    });
  });
});
