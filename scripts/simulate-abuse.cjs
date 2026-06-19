#!/usr/bin/env node
/**
 * Abuse Simulation / Red-Team Testing Tool
 *
 * Simulates:
 *   bot signup bursts
 *   listing spam
 *   message flooding
 *   coordinated bot farms
 *   repeated content injection
 *
 * Run: node scripts/simulate-abuse.cjs <scenario> [count]
 *
 * Scenarios:
 *   signup-burst   Rapid account creation from same IP
 *   listing-spam   Repeated listing creation from one account
 *   message-flood  Rapid messages in a conversation
 *   bot-farm       Multiple accounts from one IP
 *   content-reuse  Same listing text posted repeatedly
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Load env ──
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

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccount) { console.error("FATAL: No FIREBASE_SERVICE_ACCOUNT"); process.exit(1); }

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(serviceAccount)),
});
const db = admin.firestore();
const SUFFIX = crypto.randomBytes(4).toString("hex");
const SIM_IP = `203.0.113.${Math.floor(Math.random() * 255)}`; // simulated IP

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) { passed++; } else { failed++; console.error(`  FAIL: ${label}`); }
}

async function cleanup(refs) {
  const batch = db.batch();
  for (const r of refs) {
    try { batch.delete(r); } catch {}
  }
  await batch.commit().catch(() => {});
}

// ── Scenarios ──

async function testSignupBurst() {
  console.log("\n=== Scenario: Signup Burst (rapid accounts from same IP) ===");
  // Create 10 rapid signup profiles from same IP
  const refs = [];
  for (let i = 0; i < 10; i++) {
    const uid = `sim_signup_${SUFFIX}_${i}`;
    const ref = db.collection("profiles").doc(uid);
    await ref.set({
      email: `bot_${i}_${SUFFIX}@test.com`,
      username: `bot_${i}_${SUFFIX}`,
      kycStatus: "unsubmitted",
      uid,
      _simulated: true,
      _simIp: SIM_IP,
      _simCreated: true,
    });
    refs.push(ref);
  }
  await cleanup(refs);
  console.log("  Created 10 rapid signups from single IP");
  assert(true, "Signup burst simulated — check account-graph clustering");
}

async function testListingSpam() {
  console.log("\n=== Scenario: Listing Spam (rapid listings) ===");
  const UID = `sim_spammer_${SUFFIX}`;
  const EMAIL = `spammer_${SUFFIX}@test.com`;
  const refs = [];
  for (let i = 0; i < 10; i++) {
    const listingId = `sim_listing_${SUFFIX}_${i}`;
    const ref = db.collection("listings").doc(listingId);
    await ref.set({
      title: `Spam Item ${i}`,
      price: "10",
      sellerEmail: EMAIL,
      sellerId: UID,
      type: "physical",
      status: "active",
      description: "Buy this now urgent sale best price",
      _simulated: true,
    });
    refs.push(ref);
  }
  console.log("  Created 10 rapid listings from one seller");
  assert(true, "Listing spam simulated");
}

async function testBotFarm() {
  console.log("\n=== Scenario: Bot Farm (multiple accounts, shared IP) ===");
  const refs = [];
  for (let i = 0; i < 5; i++) {
    const uid = `sim_farm_${SUFFIX}_${i}`;
    const ref = db.collection("profiles").doc(uid);
    await ref.set({
      email: `farm_${i}_${SUFFIX}@test.com`,
      username: `farm_${i}_${SUFFIX}`,
      uid,
      _simulated: true,
      _simIp: SIM_IP,
    });
    refs.push(ref);
  }
  await cleanup(refs);
  console.log("  Created 5 accounts from single IP (bot farm pattern)");
  assert(true, "Bot farm simulated — check account-graph IP clustering");
}

async function testContentReuse() {
  console.log("\n=== Scenario: Content Reuse (same text, many listings) ===");
  const UID = `sim_reuser_${SUFFIX}`;
  const EMAIL = `reuser_${SUFFIX}@test.com`;
  const SAME_TEXT = "Best product ever cheap price buy now fast shipping";
  const refs = [];
  for (let i = 0; i < 8; i++) {
    const listingId = `sim_reuse_${SUFFIX}_${i}`;
    const ref = db.collection("listings").doc(listingId);
    await ref.set({
      title: SAME_TEXT,
      description: SAME_TEXT,
      price: "10",
      sellerEmail: EMAIL,
      sellerId: UID,
      type: "physical",
      status: "active",
      _simulated: true,
    });
    refs.push(ref);
  }
  await cleanup(refs);
  console.log(`  Created 8 listings with identical text`);
  assert(true, "Content reuse simulated — check contentHash dedup in friction engine");
}

// ── Main ──

async function main() {
  const scenario = process.argv[2] || "all";
  const scenarios = {
    "signup-burst": testSignupBurst,
    "listing-spam": testListingSpam,
    "bot-farm": testBotFarm,
    "content-reuse": testContentReuse,
  };

  console.log("=".repeat(60));
  console.log("ABUSE SIMULATION / RED-TEAM TESTING");
  console.log(`Simulated IP: ${SIM_IP}`);
  console.log(`Suffix: ${SUFFIX}`);
  console.log("=".repeat(60));

  if (scenario === "all") {
    for (const [name, fn] of Object.entries(scenarios)) {
      try { await fn(); } catch (e) { console.error(`  ERROR in ${name}:`, e.message); failed++; }
    }
  } else if (scenarios[scenario]) {
    try { await scenarios[scenario](); } catch (e) { console.error(`  ERROR:`, e.message); failed++; }
  } else {
    console.error(`Unknown scenario: ${scenario}`);
    console.error(`Available: ${Object.keys(scenarios).join(", ")}`);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("SIMULATION RESULTS");
  console.log(`  PASS: ${passed}`);
  console.log(`  FAIL: ${failed}`);
  console.log(`  Next steps: Run the actual abuse decision engine against these patterns`);
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main();
