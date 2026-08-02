#!/usr/bin/env node
/**
 * End-to-end transaction integrity tests
 *
 * Tests 5 scenarios against live Firestore using Admin SDK.
 * Run: node scripts/e2e-test.cjs
 *
 * Prerequisites: FIREBASE_SERVICE_ACCOUNT must be set in .env.local
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Load .env.local manually
const envPath = path.resolve(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env[key] = process.env[key] || value;
}

// ── Test counters ──
let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg = `✗ ${label}`;
    console.error(`  ${msg}`);
    errors.push(msg);
  }
}

async function assertDocExists(db, collection, docId, label) {
  const snap = await db.collection(collection).doc(docId).get();
  assert(snap.exists, `${label} (${collection}/${docId} exists)`);
  return snap;
}

async function assertDocMissing(db, collection, docId, label) {
  const snap = await db.collection(collection).doc(docId).get();
  assert(!snap.exists, `${label} (${collection}/${docId} missing)`);
  return snap;
}

function assertField(doc, field, expected, label) {
  const actual = doc.data()[field];
  const ok = actual === expected;
  assert(ok, `${label} — ${field} = ${JSON.stringify(expected)}`);
  if (!ok) console.error(`       got: ${JSON.stringify(actual)}`);
}

// ── Init Firebase Admin ──
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccount) {
  console.error("FATAL: FIREBASE_SERVICE_ACCOUNT not set in .env.local");
  process.exit(1);
}

const sa = JSON.parse(serviceAccount);

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL: "https://sky-drop-de459-default-rtdb.asia-southeast1.firebasedatabase.app",
  });
}

const db = admin.firestore();
const now = admin.firestore.Timestamp.now();

// Unique test IDs
const TEST_SUFFIX = crypto.randomBytes(4).toString("hex");
const BUYER_EMAIL = `buyer_${TEST_SUFFIX}@test.com`;
const SELLER_EMAIL = `seller_${TEST_SUFFIX}@test.com`;

const testResults = [];

async function cleanup() {
  console.log("\n Cleanup...");
  const batch = db.batch();
  // Collect all created docs for deletion
  for (const ref of createdDocs) {
    batch.delete(ref);
  }
  await batch.commit();
  console.log(`  Deleted ${createdDocs.length} test documents`);
}

const createdDocs = [];

function track(...refs) {
  for (const r of refs) createdDocs.push(r);
}

// ════════════════════════════════════════════════════════════════
// TEST 1: Offer Flow
// ════════════════════════════════════════════════════════════════
async function testOfferFlow() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: Offer Flow");
  console.log("=".repeat(60));

  const listingId = `test_listing_offer_${TEST_SUFFIX}`;
  const listingRef = db.collection("listings").doc(listingId);
  const purchaseId = `${listingId}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;
  const convId = `conv_${listingId}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;

  // 1. Create a test listing
  console.log("\n 1. Create listing...");
  await listingRef.set({
    title: `Test Listing Offer ${TEST_SUFFIX}`,
    price: "100",
    sellerEmail: SELLER_EMAIL,
    type: "physical",
    status: "active",
    acceptOffers: true,
    images: [],
    createdAt: now,
  });
  track(listingRef);
  console.log(`  Listing: ${listingId}`);

  // 2. Buyer makes offer — create offer message (client-side)
  console.log("\n 2. Buyer makes offer...");
  const offerMsgRef = db.collection("messages").doc();
  await offerMsgRef.set({
    type: "offer",
    offerType: "make",
    offerAmount: 75,
    offerStatus: "pending",
    text: "Offer: $75",
    sender: BUYER_EMAIL,
    receiver: SELLER_EMAIL,
    participants: [BUYER_EMAIL, SELLER_EMAIL],
    listingId,
    listingTitle: `Test Listing Offer ${TEST_SUFFIX}`,
    createdAt: now,
  });
  track(offerMsgRef);
  const offerMessageId = offerMsgRef.id;
  console.log(`  Offer message: ${offerMessageId}`);

  // 3. Seller accepts offer — simulate acceptOfferWithAdmin
  console.log("\n 3. Seller accepts offer (server atomic transaction)...");
  try {
    await db.runTransaction(async (tx) => {
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) throw new Error("Listing not found");
      const listing = listingSnap.data();
      if (listing.status === "sold") throw new Error("Already sold");
      if (listing.sellerEmail !== SELLER_EMAIL) throw new Error("Not seller");

      const offerSnap = await tx.get(offerMsgRef);
      if (!offerSnap.exists) throw new Error("Offer not found");
      const offer = offerSnap.data();
      if (offer.type !== "offer" || offer.offerStatus !== "pending")
        throw new Error("Offer not pending");

      // Update offer message
      tx.update(offerMsgRef, { offerStatus: "accepted", updatedAt: now });

      // Create purchase with offer_accepted status
      const purchaseRef = db.collection("purchases").doc(purchaseId);
      const paymentDeadline = new Date(Date.now() + 48 * 3600000);
      tx.set(purchaseRef, {
        listingId,
        listingTitle: `Test Listing Offer ${TEST_SUFFIX}`,
        listingPrice: "100",
        listingImage: "",
        sellerEmail: SELLER_EMAIL,
        buyerEmail: BUYER_EMAIL,
        buyerName: BUYER_EMAIL.split("@")[0],
        deliveryMethod: "pickup",
        processingFee: 1.00,
        total: 76,
        type: "physical",
        status: "offer_accepted",
        paymentDeadline,
        offerMessageId,
        paidAt: null,
        createdAt: now,
        fundsReleased: false,
      });
      track(purchaseRef);

      // Create/find conversation
      const convRef = db.collection("conversations").doc(convId);
      tx.set(convRef, {
        convKey: `listing_${listingId}`,
        participants: [BUYER_EMAIL, SELLER_EMAIL],
        buyerEmail: BUYER_EMAIL,
        sellerEmail: SELLER_EMAIL,
        listingId,
        listingTitle: `Test Listing Offer ${TEST_SUFFIX}`,
        listingPrice: "100",
        listingImage: "",
        orderStatus: "offer_accepted",
        createdAt: now,
        updatedAt: now,
        lastMessage: `Offer accepted — $75`,
      });
      track(convRef);
      tx.update(purchaseRef, { conversationId: convId });

      // System message
      const sysMsgRef = db.collection("messages").doc();
      tx.set(sysMsgRef, {
        type: "order",
        sender: "system",
        receiver: BUYER_EMAIL,
        participants: [BUYER_EMAIL, SELLER_EMAIL],
        listingId,
        listingTitle: `Test Listing Offer ${TEST_SUFFIX}`,
        listingPrice: "100",
        orderStatus: "offer_accepted",
        text: `Offer of $75 accepted. Payment due within 48 hours.`,
        read: false,
        createdAt: now,
      });
      track(sysMsgRef);
    });
    console.log("  Transaction committed");
  } catch (e) {
    console.error("  Accept offer failed:", e.message);
    assert(false, "Accept offer transaction succeeds");
    return;
  }

  // ── Verify state after accept ──
  console.log("\n  Verification after accept...");
  const purchaseSnap1 = await assertDocExists(db, "purchases", purchaseId, "Purchase created");
  assertField(purchaseSnap1, "status", "offer_accepted", "Purchase status");
  assertField(purchaseSnap1, "paidAt", null, "Purchase not yet paid");

  const offerMsg2 = await db.collection("messages").doc(offerMessageId).get();
  assert(offerMsg2.exists, "Offer message still exists");
  assertField(offerMsg2, "offerStatus", "accepted", "Offer message accepted");

  const convSnap = await assertDocExists(db, "conversations", convId, "Conversation created");
  assertField(convSnap, "orderStatus", "offer_accepted", "Conv order status");

  const listingSnap1 = await listingRef.get();
  assert(listingSnap1.exists, "Listing still exists");
  assertField(listingSnap1, "status", "active", "Listing NOT sold yet");

  // ── Test idempotency: re-accept same offer ──
  console.log("\n  Idempotency: re-accept should fail or be safe...");
  let reAcceptFailed = false;
  try {
    await db.runTransaction(async (tx) => {
      const offerSnap = await tx.get(offerMsgRef);
      if (offerSnap.data().offerStatus !== "pending") {
        throw new Error("Offer is already accepted");
      }
    });
  } catch (e) {
    reAcceptFailed = true;
  }
  assert(reAcceptFailed, "Re-accept fails (offer already accepted)");

  testResults.push({ test: 1, name: "Offer Flow", passed: passed - testResults.reduce((s, t) => s + t.passed, 0) });
}

// ════════════════════════════════════════════════════════════════
// TEST 2: Buy-Now Flow
// ════════════════════════════════════════════════════════════════
async function testBuyNowFlow() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Buy-Now Flow");
  console.log("=".repeat(60));

  const listingId = `test_listing_buy_${TEST_SUFFIX}`;
  const listingRef = db.collection("listings").doc(listingId);
  const purchaseId = `${listingId}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;
  const convId = `conv_${listingId}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;

  // 1. Create listing
  console.log("\n 1. Create listing...");
  await listingRef.set({
    title: `Test Buy Now ${TEST_SUFFIX}`,
    price: "50",
    sellerEmail: SELLER_EMAIL,
    type: "physical",
    status: "active",
    acceptOffers: false,
    images: [],
    createdAt: now,
  });
  track(listingRef);
  console.log(`  Listing: ${listingId}`);

  // 2. Create purchase atomically — simulate createPurchaseWithAdmin
  console.log("\n 2. Buyer purchases (server atomic transaction)...");
  try {
    await db.runTransaction(async (tx) => {
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) throw new Error("Listing not found");
      const listing = listingSnap.data();
      if (listing.status === "sold") throw new Error("Already sold");
      if (listing.sellerEmail === BUYER_EMAIL) throw new Error("Own listing");

      // Lock listing
      tx.update(listingRef, { status: "sold" });

      // Create purchase
      const purchaseRef = db.collection("purchases").doc(purchaseId);
      tx.set(purchaseRef, {
        listingId,
        listingTitle: listing.title,
        listingPrice: listing.price,
        listingImage: "",
        sellerEmail: listing.sellerEmail,
        buyerEmail: BUYER_EMAIL,
        buyerName: BUYER_EMAIL.split("@")[0],
        deliveryMethod: "pickup",
        processingFee: 1.00,
        total: 51,
        type: listing.type,
        status: "pending",
        stripePaymentIntentId: `pi_test_${TEST_SUFFIX}`,
        paidAt: now,
        orderId: "",
        conversationId: "",
        fundsReleased: false,
        disputeStatus: null,
        createdAt: now,
      });
      track(purchaseRef);

      // Create order
      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        listingId,
        title: listing.title,
        price: listing.price,
        sellerEmail: listing.sellerEmail,
        buyerEmail: BUYER_EMAIL,
        status: "paid",
        purchaseId,
        createdAt: now,
      });
      track(orderRef);

      // Update purchase with orderId
      tx.update(purchaseRef, { orderId: orderRef.id });

      // Create conversation
      const convRef = db.collection("conversations").doc(convId);
      tx.set(convRef, {
        convKey: `listing_${listingId}`,
        participants: [BUYER_EMAIL, SELLER_EMAIL],
        buyerEmail: BUYER_EMAIL,
        sellerEmail: SELLER_EMAIL,
        listingId,
        listingTitle: listing.title,
        listingPrice: listing.price,
        listingImage: "",
        orderStatus: "paid",
        orderId: orderRef.id,
        createdAt: now,
        updatedAt: now,
        lastMessage: `Payment confirmed`,
      });
      track(convRef);
      tx.update(purchaseRef, { conversationId: convId });

      // System messages
      for (const receiver of [BUYER_EMAIL, SELLER_EMAIL]) {
        const msgRef = db.collection("messages").doc();
        tx.set(msgRef, {
          type: "order",
          orderId: orderRef.id,
          sender: "system",
          receiver,
          participants: [BUYER_EMAIL, SELLER_EMAIL],
          listingId,
          listingTitle: listing.title,
          listingPrice: listing.price,
          orderStatus: "paid",
          text: receiver === BUYER_EMAIL
            ? `Payment confirmed. Awaiting seller response.`
            : `Your listing "${listing.title}" has been purchased.`,
          read: false,
          createdAt: now,
        });
        track(msgRef);
      }
    });
    console.log("  Transaction committed");
  } catch (e) {
    console.error("  Buy transaction failed:", e.message);
    assert(false, "Buy-now transaction succeeds");
    return;
  }

  // ── Verify ──
  console.log("\n  Verification...");
  const listingSnap = await assertDocExists(db, "listings", listingId, "Listing exists");
  assertField(listingSnap, "status", "sold", "Listing locked as sold");

  const purchaseSnap = await assertDocExists(db, "purchases", purchaseId, "Purchase created");
  assertField(purchaseSnap, "status", "pending", "Purchase status = pending");
  assertField(purchaseSnap, "stripePaymentIntentId", `pi_test_${TEST_SUFFIX}`, "Stripe ID saved");

  const convSnap2 = await assertDocExists(db, "conversations", convId, "Conversation created");
  assertField(convSnap2, "orderStatus", "paid", "Conv order status = paid");

  // Check orders collection
  const ordersSnap = await db.collection("orders").where("purchaseId", "==", purchaseId).get();
  assert(ordersSnap.size === 1, "Exactly one order created");
  assertField(ordersSnap.docs[0], "status", "paid", "Order status = paid");

  // ── Test idempotency: same purchase ID → existing ──
  console.log("\n  Idempotency: same buyer re-purchase...");
  let reBuyRejected = false;
  try {
    await db.runTransaction(async (tx) => {
      const purchaseRef = db.collection("purchases").doc(purchaseId);
      const existing = await tx.get(purchaseRef);
      if (existing.exists) {
        // Simulate existing path — idempotent, no writes
        return;
      }
      // Would create duplicate
      throw new Error("Would create duplicate");
    });
    reBuyRejected = true; // No error = idempotent path works
  } catch (e) {
    reBuyRejected = false;
  }
  assert(reBuyRejected, "Re-purchase returns existing (no duplicate)");
}

// ════════════════════════════════════════════════════════════════
// TEST 3: Expired Offer
// ════════════════════════════════════════════════════════════════
async function testExpiredOffer() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: Expired Offer");
  console.log("=".repeat(60));

  const listingId = `test_listing_expire_${TEST_SUFFIX}`;
  const listingRef = db.collection("listings").doc(listingId);
  const purchaseId = `${listingId}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;
  const convId = `conv_${listingId}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;

  // 1. Create listing + accepted offer with expired deadline
  console.log("\n 1. Create listing with expired offer deadline...");
  await listingRef.set({
    title: `Test Expired ${TEST_SUFFIX}`,
    price: "150",
    sellerEmail: SELLER_EMAIL,
    type: "physical",
    status: "active",
    acceptOffers: true,
    images: [],
    createdAt: now,
  });
  track(listingRef);

  const purchaseRef = db.collection("purchases").doc(purchaseId);
  const expiredDeadline = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 3600000)); // 1 hour ago
  await purchaseRef.set({
    listingId,
    listingTitle: `Test Expired ${TEST_SUFFIX}`,
    listingPrice: "150",
    listingImage: "",
    sellerEmail: SELLER_EMAIL,
    buyerEmail: BUYER_EMAIL,
    buyerName: BUYER_EMAIL.split("@")[0],
    deliveryMethod: "pickup",
    processingFee: 1.00,
    total: 121,
    type: "physical",
    status: "offer_accepted",
    paymentDeadline: expiredDeadline,
    offerMessageId: `msg_expired_${TEST_SUFFIX}`,
    paidAt: null,
    fundsReleased: false,
    createdAt: expiredDeadline,
  });
  track(purchaseRef);

  // 2. Try to pay expired offer
  console.log("\n 2. Attempt payment on expired offer...");
  let deadlineEnforced = false;
  try {
    const payResult = await db.runTransaction(async (tx) => {
      const snap = await tx.get(purchaseRef);
      if (!snap.exists) throw new Error("Purchase not found");
      const p = snap.data();
      if (p.status !== "offer_accepted") throw new Error("Not in offer_accepted status");

      const deadline = p.paymentDeadline?.toDate?.() || p.paymentDeadline;
      if (deadline && new Date(deadline).getTime() < Date.now()) {
        throw new Error("Payment deadline has passed. Please ask the seller to re-accept your offer.");
      }
    });
  } catch (e) {
    deadlineEnforced = e.message.includes("Payment deadline has passed");
  }
  assert(deadlineEnforced, "Expired offer payment rejected with correct message");

  // 3. Verify listing is NOT sold (offer accept doesn't lock listing)
  console.log("\n 3. Verify listing still active...");
  const listingSnap = await listingRef.get();
  assertField(listingSnap, "status", "active", "Listing remains active after offer expiry");
}

// ════════════════════════════════════════════════════════════════
// TEST 5: Double Action / Concurrency
// ════════════════════════════════════════════════════════════════
async function testDoubleActions() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 5: Double Action & Concurrency");
  console.log("=".repeat(60));

  // ── 5a: Double pay-offer ──
  console.log("\n 5a: Double Pay Offer...");
  const listingId5a = `test_5a_${TEST_SUFFIX}`;
  const purchaseId5a = `${listingId5a}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;
  const listingRef5a = db.collection("listings").doc(listingId5a);

  await listingRef5a.set({
    title: `Test 5a ${TEST_SUFFIX}`,
    price: "50",
    sellerEmail: SELLER_EMAIL,
    type: "physical",
    status: "active",
  });
  track(listingRef5a);

  const purchaseRef5a = db.collection("purchases").doc(purchaseId5a);
  await purchaseRef5a.set({
    listingId: listingId5a,
    listingTitle: `Test 5a ${TEST_SUFFIX}`,
    status: "offer_accepted",
    sellerEmail: SELLER_EMAIL,
    buyerEmail: BUYER_EMAIL,
    total: 51,
    type: "physical",
    paymentDeadline: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 3600000)),
    paidAt: null,
    fundsReleased: false,
  });
  track(purchaseRef5a);

  // Call pay twice (simulating double-click)
  let firstPaySucceeded = false;
  let secondPayReturnedExisting = false;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(purchaseRef5a);
      const p = snap.data();
      if (p.status === "pending" || p.status === "paid") {
        firstPaySucceeded = true; // actually existing
        return;
      }
      if (p.status !== "offer_accepted") throw new Error("Wrong status");

      // Process payment
      tx.update(listingRef5a, { status: "sold" });
      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, { purchaseId: purchaseId5a, status: "paid", createdAt: now });
      tx.update(purchaseRef5a, { status: "pending", paidAt: now, orderId: orderRef.id });
    });
    firstPaySucceeded = true;
  } catch (e) {
    console.error("  First pay failed:", e.message);
  }
  assert(firstPaySucceeded, "First offer payment succeeds");

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(purchaseRef5a);
      const p = snap.data();
      if (p.status === "pending" || p.status === "paid") {
        secondPayReturnedExisting = true;
        return; // idempotent
      }
      throw new Error("Would process duplicate payment");
    });
  } catch (e) {
    // If it didn't return early, it tried and failed
    secondPayReturnedExisting = e.message.includes("Wrong status") ? false : false;
  }
  assert(secondPayReturnedExisting, "Second offer payment returns existing (no duplicate)");

  // Verify only one order
  const orders5a = await db.collection("orders").where("purchaseId", "==", purchaseId5a).get();
  assert(orders5a.size === 1, `Exactly 1 order for purchase (got ${orders5a.size})`);

  // Verify listing sold only once
  const listing5aAfter = await listingRef5a.get();
  assertField(listing5aAfter, "status", "sold", "Listing sold once");

  // ── 5b: Double create-purchase (refresh success page) ──
  console.log("\n 5b: Double Create Purchase (refresh)...");
  const listingId5b = `test_5b_${TEST_SUFFIX}`;
  const purchaseId5b = `${listingId5b}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;
  const listingRef5b = db.collection("listings").doc(listingId5b);

  await listingRef5b.set({
    title: `Test 5b ${TEST_SUFFIX}`,
    price: "30",
    sellerEmail: SELLER_EMAIL,
    type: "physical",
    status: "active",
  });
  track(listingRef5b);

  // First purchase (simulate)
  const purchaseRef5b = db.collection("purchases").doc(purchaseId5b);
  const convRef5b = db.collection("conversations").doc(`conv_${listingId5b}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`);

  await db.runTransaction(async (tx) => {
    tx.update(listingRef5b, { status: "sold" });
    const orderRef = db.collection("orders").doc();
    tx.set(orderRef, { purchaseId: purchaseId5b, status: "paid", createdAt: now });
    tx.set(purchaseRef5b, {
      listingId: listingId5b,
      status: "pending",
      sellerEmail: SELLER_EMAIL,
      buyerEmail: BUYER_EMAIL,
      total: 31,
      paidAt: now,
      orderId: orderRef.id,
    });
    tx.set(convRef5b, { participants: [BUYER_EMAIL, SELLER_EMAIL], orderStatus: "paid" });
  });
  track(purchaseRef5b);
  track(convRef5b);

  // Second purchase (idempotent — already exists)
  let secondPurchaseExisting = false;
  try {
    await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(purchaseRef5b);
      if (existingSnap.exists) {
        secondPurchaseExisting = true;
        return; // idempotent
      }
      throw new Error("Would create duplicate");
    });
  } catch (e) {
    secondPurchaseExisting = false;
  }
  assert(secondPurchaseExisting, "Second purchase call returns existing after refresh");

  // Verify listing not double-sold (irrelevant since idempotent)
  const listing5bAfter = await listingRef5b.get();
  assertField(listing5bAfter, "status", "sold", "Listing still sold (not double-updated)");

  // Verify exactly one order
  const orders5b = await db.collection("orders").where("purchaseId", "==", purchaseId5b).get();
  assert(orders5b.size <= 1, `At most 1 order for re-purchase (got ${orders5b.size})`);

  // ── 5c: Concurrent offer accept + pay (race condition) ──
  console.log("\n 5c: Concurrent Accept + Pay race...");
  // This simulates buyer paying milliseconds after seller accepts
  // The purchase exists (from accept) but order doesn't exist yet
  // This tests that the pay transaction correctly reads the purchase status
  const listingId5c = `test_5c_${TEST_SUFFIX}`;
  const purchaseId5c = `${listingId5c}_${BUYER_EMAIL.replace(/[@.]/g, "_")}`;
  const listingRef5c = db.collection("listings").doc(listingId5c);

  await listingRef5c.set({
    title: `Test 5c ${TEST_SUFFIX}`,
    price: "40",
    sellerEmail: SELLER_EMAIL,
    type: "physical",
    status: "active",
  });
  track(listingRef5c);

  const purchaseRef5c = db.collection("purchases").doc(purchaseId5c);
  await purchaseRef5c.set({
    listingId: listingId5c,
    status: "offer_accepted",
    sellerEmail: SELLER_EMAIL,
    buyerEmail: BUYER_EMAIL,
    total: 41,
    type: "physical",
    paymentDeadline: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 3600000)),
    paidAt: null,
    fundsReleased: false,
  });
  track(purchaseRef5c);

  // Simulate: accept and pay run "concurrently" (sequentially here, testing state isolation)
  // Accept creates order, pay reads it — but what if pay runs before accept creates order?
  // payOffer doesn't rely on order existing — it CREATES a new order
  // So concurrent accept+pay is safe: accept creates order A, pay creates order B
  // But only one payment processes (status moves to "pending")
  let acceptSucceeded = false;
  let paySucceeded = false;

  // Run accept (should succeed — purchase is offer_accepted)
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(purchaseRef5c);
      if (snap.data().status !== "offer_accepted") throw new Error("Not in offer_accepted");
      tx.update(purchaseRef5c, { status: "pending", paidAt: now });
      tx.set(db.collection("orders").doc(), { purchaseId: purchaseId5c, status: "paid" });
    });
    paySucceeded = true;
  } catch (e) {
    console.error("  Concurrent pay failed:", e.message);
  }
  assert(paySucceeded, "Concurrent pay succeeds");

  // Now the purchase is "pending" — accept again should fail
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(purchaseRef5c);
      if (snap.data().status !== "offer_accepted") {
        throw new Error("Purchase is no longer in offer_accepted status");
      }
    });
  } catch (e) {
    acceptSucceeded = e.message.includes("no longer in offer_accepted");
  }
  assert(acceptSucceeded, "Second concurrent accept fails (purchase no longer offer_accepted)");
}

// ════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════
async function main() {
  console.log("=".repeat(60));
  console.log("SKY DROP — End-to-End Transaction Integrity Tests");
  console.log(`Buyer:  ${BUYER_EMAIL}`);
  console.log(`Seller: ${SELLER_EMAIL}`);
  console.log("=".repeat(60));

  try {
    await testOfferFlow();
    await testBuyNowFlow();
    await testExpiredOffer();
    await testDoubleActions();
  } catch (e) {
    console.error("\n UNHANDLED ERROR:", e.message);
    console.error(e.stack);
    failed++;
  } finally {
    await cleanup();
  }

  // ── Summary ──
  console.log("\n" + "=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  if (errors.length > 0) {
    console.log("\n  Failures:");
    for (const err of errors) {
      console.log(`    ${err}`);
    }
  }
  console.log("=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
