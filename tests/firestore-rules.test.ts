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

  describe("P0 ownership and privilege escalation protections", () => {
    it("blocks a user from creating a profile with privileged trust or KYC fields", async () => {
      const alice = testEnv
        .authenticatedContext("alice", { email: "alice@test.com", email_verified: true })
        .firestore();

      await assertFails(
        alice.collection("profiles").doc("alice").set({
          email: "alice@test.com",
          trustedSeller: true,
          kycApproved: true,
          salesCount: 9999,
          badges: ["verified"],
        })
      );
    });

    it("only permits pending KYC submissions on create", async () => {
      const alice = testEnv
        .authenticatedContext("alice-kyc", { email: "alice-kyc@test.com", email_verified: true })
        .firestore();

      await assertSucceeds(
        alice.collection("kycSubmissions").doc("alice-kyc").set({
          uid: "alice-kyc",
          email: "alice-kyc@test.com",
          status: "pending",
        })
      );
      await assertFails(
        alice.collection("kycSubmissions").doc("alice-kyc-approved").set({
          uid: "alice-kyc",
          email: "alice-kyc@test.com",
          status: "approved",
        })
      );
    });

    it("blocks direct message creation, including a forged sender", async () => {
      const bob = testEnv
        .authenticatedContext("bob-message", { email: "bob@test.com", email_verified: true })
        .firestore();

      await assertFails(
        bob.collection("messages").doc("forged-message").set({
          participants: ["alice@test.com", "bob@test.com"],
          sender: "alice@test.com",
          text: "Forged message",
        })
      );
    });

    it("prevents a listing owner from transferring seller identity", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("listings").doc("alice-listing").set({
          sellerId: "alice-listing",
          sellerEmail: "alice-listing@test.com",
          sellerName: "Alice",
          title: "Camera",
        });
      });
      const alice = testEnv
        .authenticatedContext("alice-listing", { email: "alice-listing@test.com", email_verified: true })
        .firestore();
      const bob = testEnv
        .authenticatedContext("bob-listing", { email: "bob-listing@test.com", email_verified: true })
        .firestore();

      await assertFails(
        alice.collection("listings").doc("alice-listing").update({ sellerEmail: "bob-listing@test.com" })
      );
      await assertFails(bob.collection("listings").doc("alice-listing").update({ title: "Stolen camera" }));
    });

    it("freezes conversation participants and metadata and disallows client deletion", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("conversations").doc("alice-bob").set({
          participants: ["alice-conv@test.com", "bob-conv@test.com"],
          buyerEmail: "alice-conv@test.com",
          sellerEmail: "bob-conv@test.com",
          listingId: "listing-1",
          lastMessage: "Hello",
        });
      });
      const alice = testEnv
        .authenticatedContext("alice-conv", { email: "alice-conv@test.com", email_verified: true })
        .firestore();
      const eve = testEnv
        .authenticatedContext("eve-conv", { email: "eve-conv@test.com", email_verified: true })
        .firestore();

      await assertFails(
        alice.collection("conversations").doc("alice-bob").update({
          participants: ["alice-conv@test.com", "eve-conv@test.com"],
        })
      );
      await assertFails(alice.collection("conversations").doc("alice-bob").delete());
      await assertFails(eve.collection("conversations").doc("alice-bob").update({ lastMessage: "Hijacked" }));
    });

    it("limits review edits and prevents non-reviewers from editing", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("reviews").doc("alice-review").set({
          reviewerEmail: "alice-review@test.com",
          sellerEmail: "seller@test.com",
          rating: 5,
          text: "Great",
          purchaseId: "purchase-1",
        });
      });
      const alice = testEnv
        .authenticatedContext("alice-review", { email: "alice-review@test.com", email_verified: true })
        .firestore();
      const bob = testEnv
        .authenticatedContext("bob-review", { email: "bob-review@test.com", email_verified: true })
        .firestore();

      await assertFails(
        alice.collection("reviews").doc("alice-review").update({ sellerEmail: "attacker@test.com" })
      );
      await assertFails(bob.collection("reviews").doc("alice-review").update({ rating: 1 }));
    });

    it("freezes watchlist ownership and blocks another user from editing it", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("watchlist").doc("alice-watch").set({
          userId: "alice-watch",
          userEmail: "alice-watch@test.com",
          listingId: "listing-1",
        });
      });
      const alice = testEnv
        .authenticatedContext("alice-watch", { email: "alice-watch@test.com", email_verified: true })
        .firestore();
      const bob = testEnv
        .authenticatedContext("bob-watch", { email: "bob-watch@test.com", email_verified: true })
        .firestore();

      await assertFails(
        alice.collection("watchlist").doc("alice-watch").update({ userId: "bob-watch" })
      );
      await assertFails(bob.collection("watchlist").doc("alice-watch").update({ listingId: "listing-2" }));
    });

    it("blocks direct follower writes until they are server-mediated", async () => {
      const alice = testEnv
        .authenticatedContext("alice-follow", { email: "alice-follow@test.com", email_verified: true })
        .firestore();

      await assertFails(
        alice.collection("followers").doc("alice-follows-bob").set({
          followerId: "alice-follow",
          followingId: "bob-follow",
        })
      );
    });
  });

  describe("Cross-account integrity regressions", () => {
    it("profile owner cannot create a pre-verified or privileged profile", async () => {
      const alice = testEnv
        .authenticatedContext("profile-alice", {
          email: "profile-alice@test.com",
          email_verified: true,
        })
        .firestore();

      await assertFails(
        alice.collection("profiles").doc("profile-alice").set({
          email: "profile-alice@test.com",
          verified: true,
          trustedSeller: true,
          riskFlag: false,
          xp: 100000,
        })
      );
    });

    it("profile create permits only a safe initial KYC status", async () => {
      const alice = testEnv
        .authenticatedContext("profile-kyc-alice", {
          email: "profile-kyc-alice@test.com",
          email_verified: true,
        })
        .firestore();

      await assertSucceeds(
        alice.collection("profiles").doc("profile-kyc-alice").set({
          email: "profile-kyc-alice@test.com",
          kycStatus: "pending",
        })
      );

      const attacker = testEnv
        .authenticatedContext("profile-kyc-approved", {
          email: "profile-kyc-approved@test.com",
          email_verified: true,
        })
        .firestore();
      await assertFails(
        attacker.collection("profiles").doc("profile-kyc-approved").set({
          email: "profile-kyc-approved@test.com",
          kycStatus: "approved",
        })
      );
    });

    it("KYC submission owner cannot create an approved submission", async () => {
      const alice = testEnv
        .authenticatedContext("kyc-alice", {
          email: "kyc-alice@test.com",
          email_verified: true,
        })
        .firestore();

      await assertFails(
        alice.collection("kycSubmissions").doc("kyc-alice").set({
          uid: "kyc-alice",
          email: "kyc-alice@test.com",
          status: "approved",
          idImageUrl: "https://example.test/id.jpg",
        })
      );
    });

    it("authenticated clients cannot create messages directly", async () => {
      const alice = testEnv
        .authenticatedContext("message-alice", {
          email: "message-alice@test.com",
          email_verified: true,
        })
        .firestore();

      await assertFails(
        alice.collection("messages").doc("direct-bypass").set({
          participants: ["message-alice@test.com", "victim@test.com"],
          sender: "message-alice@test.com",
          receiver: "victim@test.com",
          text: "bypass",
        })
      );
    });

    it("conversation participants cannot create or take over conversations", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("conversations").doc("locked-conversation").set({
          participants: ["conversation-alice@test.com", "conversation-bob@test.com"],
          buyerEmail: "conversation-alice@test.com",
          sellerEmail: "conversation-bob@test.com",
          listingId: "listing-1",
          lastMessage: "hello",
        });
      });

      const alice = testEnv
        .authenticatedContext("conversation-alice", {
          email: "conversation-alice@test.com",
          email_verified: true,
        })
        .firestore();

      await assertFails(
        alice.collection("conversations").doc("client-created-conversation").set({
          participants: ["conversation-alice@test.com", "victim@test.com"],
          sellerEmail: "victim@test.com",
        })
      );
      await assertFails(
        alice.collection("conversations").doc("locked-conversation").update({
          participants: ["conversation-alice@test.com", "victim@test.com"],
          sellerEmail: "victim@test.com",
        })
      );
    });

    it("listing seller cannot transfer ownership identity", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("listings").doc("owned-listing").set({
          title: "Owned item",
          sellerId: "listing-alice",
          sellerEmail: "listing-alice@test.com",
          sellerName: "Alice",
          ownerId: "listing-alice",
          userId: "listing-alice",
          createdBy: "listing-alice",
        });
      });

      const alice = testEnv
        .authenticatedContext("listing-alice", {
          email: "listing-alice@test.com",
          email_verified: true,
        })
        .firestore();
      await assertFails(
        alice.collection("listings").doc("owned-listing").update({
          ownerId: "listing-bob",
          userId: "listing-bob",
          createdBy: "listing-bob",
        })
      );
    });

    it("reviewer cannot rewrite review identity or purchase linkage", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("reviews").doc("immutable-review").set({
          reviewerEmail: "review-alice@test.com",
          revieweeId: "seller-1",
          purchaseId: "purchase-1",
          rating: 4,
          text: "Good",
        });
      });

      const alice = testEnv
        .authenticatedContext("review-alice", {
          email: "review-alice@test.com",
          email_verified: true,
        })
        .firestore();
      await assertFails(
        alice.collection("reviews").doc("immutable-review").update({
          revieweeId: "victim-seller",
          purchaseId: "purchase-2",
        })
      );
      await assertSucceeds(
        alice.collection("reviews").doc("immutable-review").update({
          rating: 5,
          text: "Excellent",
        })
      );
    });

    it("watchlist owner cannot transfer an entry to another account", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("watchlist").doc("owned-watch").set({
          userId: "watch-alice",
          userEmail: "watch-alice@test.com",
          listingId: "listing-1",
        });
      });

      const alice = testEnv
        .authenticatedContext("watch-alice", {
          email: "watch-alice@test.com",
        })
        .firestore();
      await assertFails(
        alice.collection("watchlist").doc("owned-watch").update({
          userId: "watch-bob",
          userEmail: "watch-bob@test.com",
        })
      );
    });

    it("clients cannot fabricate follower relationships", async () => {
      const alice = testEnv
        .authenticatedContext("follow-alice", {
          email: "follow-alice@test.com",
          email_verified: true,
        })
        .firestore();
      await assertFails(
        alice.collection("followers").doc("victim_follow-alice").set({
          followerId: "follow-alice",
          sellerId: "victim",
          followerEmail: "follow-alice@test.com",
        })
      );
    });

    it("non-admin users cannot read sensitive config documents", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("config").doc("adminEmails").set({
          emails: ["admin@test.com"],
        });
      });

      const alice = testEnv
        .authenticatedContext("config-alice", {
          email: "config-alice@test.com",
        })
        .firestore();
      await assertFails(alice.collection("config").doc("adminEmails").get());
      await assertSucceeds(alice.collection("config").doc("announcement").get());
    });
  });

  describe("Launch-gate adversarial attacks", () => {
    const userA = { uid: "gate-user-a", email: "gate-user-a@example.test" };
    const userB = { uid: "gate-user-b", email: "gate-user-b@example.test" };

    beforeAll(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const listingIds = [
          "gate-direct",
          "gate-merge",
          "gate-transaction",
          "gate-batch",
          "gate-immutable-owner",
        ];
        for (const id of listingIds) {
          await db.collection("listings").doc(id).set({
            title: "User A's camera",
            sellerId: userA.uid,
            sellerEmail: userA.email,
            sellerName: "User A",
            ownerId: userA.uid,
            userId: userA.uid,
            createdBy: userA.uid,
            views: 0,
          });
        }
        await db.collection("messages").doc("gate-message").set({
          participants: [userA.email, userB.email],
          sender: userA.email,
          receiver: userB.email,
          text: "Private message",
        });
        await db.collection("conversations").doc("gate-conversation").set({
          participants: [userA.email, userB.email],
          buyerEmail: userA.email,
          sellerEmail: userB.email,
        });
        await db.collection("profiles").doc(userA.uid).set({
          email: userA.email,
          phone: "+6412345678",
          kycStatus: "approved",
        });
        await db.collection("config").doc("announcement").set({
          message: "Welcome",
        });
        await db.collection("config").doc("adminEmails").set({
          emails: ["admin@example.test"],
        });
        await db.collection("adminAuditLog").doc("gate-entry").set({
          action: "seeded",
        });
      });
    });

    function firestoreFor(user: { uid: string; email: string }) {
      return testEnv
        .authenticatedContext(user.uid, {
          email: user.email,
          email_verified: true,
        })
        .firestore();
    }

    it("denies user B's direct cross-account listing update and delete", async () => {
      const attacker = firestoreFor(userB);
      const ref = attacker.collection("listings").doc("gate-direct");

      await assertFails(ref.update({ title: "Stolen by user B" }));
      await assertFails(ref.delete());
    });

    it("denies user B's merge-set ownership takeover", async () => {
      const attacker = firestoreFor(userB);

      await assertFails(
        attacker.collection("listings").doc("gate-merge").set(
          {
            sellerId: userB.uid,
            sellerEmail: userB.email,
            ownerId: userB.uid,
          },
          { merge: true }
        )
      );
    });

    it("denies user B's transaction and batch listing mutations", async () => {
      const attacker = firestoreFor(userB);

      await assertFails(
        attacker.runTransaction(async (transaction) => {
          transaction.update(
            attacker.collection("listings").doc("gate-transaction"),
            { title: "Transaction takeover" }
          );
        })
      );

      const batch = attacker.batch();
      batch.update(attacker.collection("listings").doc("gate-batch"), {
        title: "Batch takeover",
      });
      await assertFails(batch.commit());
    });

    it("denies the owner from changing any listing ownership identity", async () => {
      const owner = firestoreFor(userA);
      const ref = owner.collection("listings").doc("gate-immutable-owner");

      await assertFails(
        ref.update({
          sellerId: userB.uid,
          sellerEmail: userB.email,
          sellerName: "User B",
          ownerId: userB.uid,
          userId: userB.uid,
          createdBy: userB.uid,
        })
      );
    });

    it("keeps messages and conversations isolated to their participants", async () => {
      const outsider = firestoreFor({
        uid: "gate-outsider",
        email: "gate-outsider@example.test",
      });
      await assertFails(outsider.collection("messages").doc("gate-message").get());
      await assertFails(
        outsider.collection("conversations").doc("gate-conversation").get()
      );
      await assertFails(
        outsider.collection("conversations").doc("gate-conversation").update({
          lastMessage: "Injected",
        })
      );
    });

    it("keeps full profiles private while public config remains narrowly allowlisted", async () => {
      const outsider = firestoreFor(userB);
      await assertFails(outsider.collection("profiles").doc(userA.uid).get());
      await assertSucceeds(outsider.collection("config").doc("announcement").get());
      await assertFails(outsider.collection("config").doc("adminEmails").get());
      await assertFails(
        outsider.collection("config").doc("adminEmails").set({
          emails: [userB.email],
        })
      );
    });

    it("does not grant admin-only reads to a self-asserted non-admin identity", async () => {
      const attacker = firestoreFor(userB);
      await assertFails(attacker.collection("adminAuditLog").doc("gate-entry").get());
      await assertFails(
        attacker.collection("adminAuditLog").doc("attacker-entry").set({
          action: "grant-admin",
          admin: true,
        })
      );
    });

    it("permits an authenticated admin claim without weakening non-admin denial", async () => {
      const admin = testEnv
        .authenticatedContext("gate-admin", {
          email: "admin@example.test",
          email_verified: true,
          admin: true,
        })
        .firestore();

      await assertSucceeds(admin.collection("config").doc("adminEmails").get());
      await assertSucceeds(
        admin.collection("adminAuditLog").doc("gate-admin-entry").set({
          action: "verified-admin-write",
        })
      );
    });
  });
});
