/**
 * Firestore Security Rules Tests
 *
 * Run with Firebase Emulator Suite:
 *   1. npx firebase emulators:start --only firestore
 *   2. npx vitest run tests/firestore-rules.test.ts
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
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("listings").doc("test").set({
          title: "Item",
          sellerEmail: "seller@test.com",
        });
      });

      const db2 = testEnv
        .authenticatedContext("user2", { email: "attacker@test.com", email_verified: true })
        .firestore();
      await assertFails(db2.collection("listings").doc("test").delete());
    });
  });

  describe("Messages", () => {
    it("can only read messages where user is participant", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("messages").doc("msg1").set({
          participants: ["user1@test.com", "user2@test.com"],
          sender: "user1@test.com",
          receiver: "user2@test.com",
          text: "Hello",
        });
      });

      const db2 = testEnv
        .authenticatedContext("user3", { email: "user3@test.com", email_verified: true })
        .firestore();
      await assertFails(db2.collection("messages").doc("msg1").get());
    });
  });

  describe("Purchases", () => {
    it("client cannot create purchases directly", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "buyer@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("purchases").doc("test");
      await assertFails(
        ref.set({ listingId: "listing1", buyerEmail: "buyer@test.com", sellerEmail: "seller@test.com" })
      );
    });

    it("buyer can read own purchase", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("purchases").doc("purchase-read").set({
          buyerEmail: "buyer@test.com",
          sellerEmail: "seller@test.com",
          listingId: "test",
          status: "pending",
        });
      });

      const db = testEnv
        .authenticatedContext("buyer", { email: "buyer@test.com", email_verified: true })
        .firestore();
      await assertSucceeds(db.collection("purchases").doc("purchase-read").get());
    });

    it("other user cannot read someone else's purchase", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("purchases").doc("purchase-other").set({
          buyerEmail: "buyer@test.com",
          sellerEmail: "seller@test.com",
          listingId: "test",
          status: "pending",
        });
      });

      const db = testEnv
        .authenticatedContext("attacker", { email: "attacker@test.com", email_verified: true })
        .firestore();
      await assertFails(db.collection("purchases").doc("purchase-other").get());
    });

    it("buyer cannot set purchase status to delivered via client", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("purchases").doc("purchase-status").set({
          buyerEmail: "buyer@test.com",
          sellerEmail: "seller@test.com",
          listingId: "test",
          status: "shipped",
        });
      });

      const db = testEnv
        .authenticatedContext("buyer", { email: "buyer@test.com", email_verified: true })
        .firestore();
      await assertFails(
        db.collection("purchases").doc("purchase-status").update({ status: "delivered" })
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

  describe("Watchlist", () => {
    it("user can create own watchlist entry", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "user1@test.com" })
        .firestore();
      const ref = db.collection("watchlist").doc("save1");
      await assertSucceeds(
        ref.set({ userId: "user1", userEmail: "user1@test.com", listingId: "listing1", createdAt: new Date() })
      );
    });

    it("cannot create watchlist entry for another user", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "user1@test.com" })
        .firestore();
      const ref = db.collection("watchlist").doc("save2");
      await assertFails(
        ref.set({ userId: "user2", userEmail: "user2@test.com", listingId: "listing1", createdAt: new Date() })
      );
    });
  });

  describe("SavedSearches", () => {
    it("user can create own saved search", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "user1@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("savedSearches").doc(`search-own-${Date.now()}`);
      await assertSucceeds(
        ref.set({ userId: "user1", userEmail: "user1@test.com", query: "ps5", createdAt: new Date() })
      );
    });

    it("cannot create saved search for another user", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "user1@test.com" })
        .firestore();
      const ref = db.collection("savedSearches").doc("search2");
      await assertFails(
        ref.set({ userId: "user2", userEmail: "user2@test.com", query: "ps5", createdAt: new Date() })
      );
    });
  });

  describe("Reviews", () => {
    it("client cannot create reviews directly (server-mediated)", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("purchases").doc("purchase1").set({
          buyerEmail: "buyer@test.com",
          sellerEmail: "seller@test.com",
          status: "completed",
        });
      });

      const db = testEnv
        .authenticatedContext("buyer1", { email: "buyer@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("reviews").doc();
      // Reviews are Admin SDK only (allow create: if false)
      await assertFails(
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

  describe("Typing indicators", () => {
    it("authenticated user can write own typing doc", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "alice@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("typing").doc("alice@test.com_bob@test.com_general");
      await assertSucceeds(
        ref.set({ typing: true, user: "alice@test.com", at: new Date() })
      );
    });

    it("cannot write typing doc as another user", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "alice@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("typing").doc("bob@test.com_alice@test.com_general");
      await assertFails(
        ref.set({ typing: true, user: "bob@test.com", at: new Date() })
      );
    });

    it("cannot spoof user field on own doc id", async () => {
      const db = testEnv
        .authenticatedContext("user1", { email: "alice@test.com", email_verified: true })
        .firestore();
      const ref = db.collection("typing").doc("alice@test.com_bob@test.com_general");
      await assertFails(
        ref.set({ typing: true, user: "bob@test.com", at: new Date() })
      );
    });

    it("peer can read typing doc addressed to them", async () => {
      const alice = testEnv
        .authenticatedContext("user1", { email: "alice@test.com", email_verified: true })
        .firestore();
      const ref = alice.collection("typing").doc("alice@test.com_bob@test.com_general");
      await assertSucceeds(
        ref.set({ typing: true, user: "alice@test.com", at: new Date() })
      );

      const bob = testEnv
        .authenticatedContext("user2", { email: "bob@test.com", email_verified: true })
        .firestore();
      await assertSucceeds(
        bob.collection("typing").doc("alice@test.com_bob@test.com_general").get()
      );
    });

    it("unrelated user cannot read typing doc", async () => {
      const alice = testEnv
        .authenticatedContext("user1", { email: "alice@test.com", email_verified: true })
        .firestore();
      await assertSucceeds(
        alice
          .collection("typing")
          .doc("alice@test.com_bob@test.com_general")
          .set({ typing: true, user: "alice@test.com", at: new Date() })
      );

      const eve = testEnv
        .authenticatedContext("user3", { email: "eve@test.com", email_verified: true })
        .firestore();
      await assertFails(
        eve.collection("typing").doc("alice@test.com_bob@test.com_general").get()
      );
    });

    it("anonymous cannot write typing", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(
        db
          .collection("typing")
          .doc("anon@test.com_bob@test.com_general")
          .set({ typing: true, user: "anon@test.com", at: new Date() })
      );
    });

    it("anonymous cannot read typing", async () => {
      const alice = testEnv
        .authenticatedContext("user1", { email: "alice@test.com", email_verified: true })
        .firestore();
      await assertSucceeds(
        alice
          .collection("typing")
          .doc("alice@test.com_bob@test.com_general")
          .set({ typing: true, user: "alice@test.com", at: new Date() })
      );

      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(
        anon.collection("typing").doc("alice@test.com_bob@test.com_general").get()
      );
    });
  });

  describe("Conversations", () => {
    it("participant can read conversation", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("conversations").doc("conv1").set({
          participants: ["alice@test.com", "bob@test.com"],
          lastMessage: "hi",
        });
      });

      const alice = testEnv
        .authenticatedContext("user1", { email: "alice@test.com", email_verified: true })
        .firestore();
      await assertSucceeds(alice.collection("conversations").doc("conv1").get());
    });

    it("unrelated auth user cannot read conversation", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("conversations").doc("conv2").set({
          participants: ["alice@test.com", "bob@test.com"],
          lastMessage: "hi",
        });
      });

      const eve = testEnv
        .authenticatedContext("user3", { email: "eve@test.com", email_verified: true })
        .firestore();
      await assertFails(eve.collection("conversations").doc("conv2").get());
    });

    it("anonymous cannot read or write conversations", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("conversations").doc("conv3").set({
          participants: ["alice@test.com", "bob@test.com"],
          lastMessage: "hi",
        });
      });

      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(anon.collection("conversations").doc("conv3").get());
      await assertFails(
        anon.collection("conversations").doc("conv4").set({
          participants: ["anon@test.com", "bob@test.com"],
          lastMessage: "hi",
        })
      );
    });
  });
});
