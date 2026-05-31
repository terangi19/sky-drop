// Delete all listings, purchases, messages, notifications, reviews, conversations, and related data
// Run: node scripts/cleanup.cjs

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

try { require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") }); } catch {}

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    initializeApp({ credential: cert(JSON.parse(sa)) });
  } else {
    initializeApp({ projectId: "sky-drop-de459" });
  }
}

const db = getFirestore();

const COLLECTIONS = [
  "listings",
  "purchases",
  "orders",
  "messages",
  "notifications",
  "conversations",
  "reviews",
  "reports",
  "disputes",
  "tradePosts",
  "tradeShouts",
  "drops",
  "sponsoredDrops",
  "dropTokens",
  "dailyChallenges",
  "adminNotifications",
  "listingQuestions",
  "jobApplications",
  "promotions",
  "webhookFailures",
  "paymentReleaseFailures",
  "referralEvents",
  "commissions",
  "hustlerLinks",
  "hustlerClicks",
  "hustlerCommissions",
  "hustlerEvents",
  "pendingXp",
  "ratingEvents",
];

async function deleteCollection(name) {
  const batchSize = 200;
  let total = 0;

  while (true) {
    const snap = await db.collection(name).limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    console.log(`  ${name}: deleted ${total} so far...`);
  }

  if (total > 0) console.log(`  ${name}: done (${total} total)`);
  return total;
}

async function deleteSubcollections() {
  // Delete watchlist subcollections for all users
  const users = await db.collection("profiles").get();
  let watchlistCount = 0;
  for (const user of users.docs) {
    const watchlistSnap = await db.collection("users").doc(user.id).collection("watchlist").limit(200).get();
    if (!watchlistSnap.empty) {
      const batch = db.batch();
      watchlistSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      watchlistCount += watchlistSnap.size;
    }
  }
  if (watchlistCount > 0) console.log(`  users/{uid}/watchlist: ${watchlistCount} deleted`);

  // Delete favorites subcollections
  let favCount = 0;
  for (const user of users.docs) {
    const favSnap = await db.collection("users").doc(user.id).collection("favorites").limit(200).get();
    if (!favSnap.empty) {
      const batch = db.batch();
      favSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      favCount += favSnap.size;
    }
  }
  if (favCount > 0) console.log(`  users/{uid}/favorites: ${favCount} deleted`);

  // Delete blocked subcollections
  let blockCount = 0;
  for (const user of users.docs) {
    const blockSnap = await db.collection("users").doc(user.id).collection("blocked").limit(200).get();
    if (!blockSnap.empty) {
      const batch = db.batch();
      blockSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      blockCount += blockSnap.size;
    }
  }
  if (blockCount > 0) console.log(`  users/{uid}/blocked: ${blockCount} deleted`);
}

async function clearUserProfiles() {
  // Reset profile fields but keep user accounts
  const users = await db.collection("profiles").get();
  let count = 0;
  for (const user of users.docs) {
    await user.ref.update({
      earningsBalance: 0,
      salesCount: 0,
      reportsCount: 0,
      restricted: false,
      restrictionReason: null,
      restrictedAt: null,
      strikes: 0,
      xp: 0,
      profileBadge: null,
      badges: [],
      referralSignups: 0,
      dropTokens: 0,
      digitalListingsCreated: 0,
      proofOfAddress: null,
      stripeAccountId: null,
      stripeConnectOnboarded: false,
    });
    count++;
  }
  console.log(`  profiles: reset ${count} user profiles`);
}

async function main() {
  console.log("=== SKY DROP CLEANUP ===\n");

  console.log("Deleting marketplace data...");
  let total = 0;
  for (const col of COLLECTIONS) {
    total += await deleteCollection(col);
  }

  console.log("\nDeleting subcollections...");
  await deleteSubcollections();

  console.log("\nResetting user profiles...");
  await clearUserProfiles();

  // Reset legendary badge counter
  try {
    await db.collection("config").doc("platform").set({
      legendaryBadgesAwarded: 0,
      lastLegendaryClaim: null,
    }, { merge: true });
    console.log("  config/platform: reset legendary badge counter");
  } catch {}

  // Reset rate limits
  const rateLimits = await db.collection("rateLimits").get();
  if (!rateLimits.empty) {
    const batch = db.batch();
    rateLimits.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log("  rateLimits: cleared");
  }

  console.log(`\n=== Done! All data cleared ===`);
}

main().catch(console.error);
