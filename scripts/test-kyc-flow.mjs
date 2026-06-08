/**
 * End-to-end KYC data-flow test (Firestore + optional API alert).
 * Run: node scripts/test-kyc-flow.mjs
 * Cleanup: node scripts/test-kyc-flow.mjs --cleanup
 */
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

try {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
} catch {}

const TEST_UID = "kyc_flow_test_user";
const TEST_EMAIL = "kyc-test@skydrop.nz";

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    initializeApp({ credential: cert(JSON.parse(sa)) });
  } else {
    initializeApp({ projectId: "sky-drop-de459" });
  }
}

const db = getFirestore();
const auth = getAuth();

async function ensureTestUser() {
  try {
    await auth.getUser(TEST_UID);
  } catch {
    await auth.createUser({
      uid: TEST_UID,
      email: TEST_EMAIL,
      emailVerified: true,
      password: "KycTestFlow!2026",
    });
  }
}

async function cleanup() {
  await db.collection("profiles").doc(TEST_UID).delete().catch(() => {});
  try {
    await auth.deleteUser(TEST_UID);
  } catch {}
  const alerts = await db.collection("adminNotifications")
    .where("metadata.uid", "==", TEST_UID).get();
  for (const doc of alerts.docs) await doc.ref.delete();
  console.log("Cleaned up KYC test user and alerts.");
}

async function testSubmitPending() {
  await db.collection("profiles").doc(TEST_UID).set({
    email: TEST_EMAIL,
    username: "kyc_test_user",
    kycStatus: "pending",
    kycIdUrl: "https://example.com/test-id.jpg",
    kycSelfieUrl: "https://example.com/test-selfie.jpg",
    kycSubmittedAt: Timestamp.now(),
  }, { merge: true });

  const pending = await db.collection("profiles")
    .where("kycStatus", "==", "pending")
    .get();
  const found = pending.docs.some((d) => d.id === TEST_UID);
  if (!found) throw new Error("Pending KYC query did not return test profile");
  console.log("✓ Submit: profile appears in pending KYC query");
}

async function testApprove() {
  await db.collection("profiles").doc(TEST_UID).set({
    kycStatus: "approved",
    kycReviewedAt: Timestamp.now(),
    kycReviewedBy: "test-script",
  }, { merge: true });

  const snap = await db.collection("profiles").doc(TEST_UID).get();
  if (snap.data()?.kycStatus !== "approved") {
    throw new Error("Approve failed — kycStatus not approved");
  }
  console.log("✓ Approve: kycStatus = approved");
}

async function testRejectAndResubmit() {
  await db.collection("profiles").doc(TEST_UID).set({
    kycStatus: "rejected",
    kycRejectionReason: "Photo blurry",
    kycReviewedAt: Timestamp.now(),
    kycReviewedBy: "test-script",
  }, { merge: true });

  let snap = await db.collection("profiles").doc(TEST_UID).get();
  if (snap.data()?.kycRejectionReason !== "Photo blurry") {
    throw new Error("Reject failed — reason not stored");
  }
  console.log("✓ Reject: rejection reason stored");

  // Simulate re-submit (matches profile handleKycSubmit)
  await db.collection("profiles").doc(TEST_UID).set({
    kycStatus: "pending",
    kycIdUrl: "https://example.com/test-id-2.jpg",
    kycSelfieUrl: "https://example.com/test-selfie-2.jpg",
    kycSubmittedAt: Timestamp.now(),
    kycRejectionReason: FieldValue.delete(),
  }, { merge: true });

  snap = await db.collection("profiles").doc(TEST_UID).get();
  const data = snap.data() || {};
  if (data.kycStatus !== "pending") throw new Error("Re-submit failed — not pending");
  if (data.kycRejectionReason) throw new Error("Re-submit failed — rejection reason not cleared");
  console.log("✓ Re-submit: pending + rejection reason cleared");
}

async function testKycAlertApi() {
  const base = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
  const customToken = await auth.createCustomToken(TEST_UID);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    console.log("⚠ Skipping API test — NEXT_PUBLIC_FIREBASE_API_KEY not in .env.local");
    return;
  }

  const signInRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const signInData = await signInRes.json();
  if (!signInData.idToken) {
    console.log("⚠ Skipping API test — could not exchange custom token:", signInData.error?.message);
    return;
  }

  const before = (await db.collection("adminNotifications")
    .where("metadata.uid", "==", TEST_UID).get()).size;

  const res = await fetch(`${base}/api/admin/kyc-alert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${signInData.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uid: TEST_UID,
      email: TEST_EMAIL,
      username: "kyc_test_user",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`kyc-alert API failed (${res.status}): ${JSON.stringify(body)}`);

  const after = (await db.collection("adminNotifications")
    .where("metadata.uid", "==", TEST_UID).get()).size;
  if (after <= before) throw new Error("kyc-alert API did not create adminNotifications doc");
  console.log("✓ API: /api/admin/kyc-alert created admin notification");
}

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    return;
  }

  console.log("KYC flow test — Firestore + API\n");
  await ensureTestUser();
  await testSubmitPending();
  await testApprove();
  await testRejectAndResubmit();
  await testKycAlertApi();
  console.log("\nAll KYC flow checks passed.");
  console.log("Run with --cleanup to remove test data.");
}

main().catch((e) => {
  console.error("\n✗ KYC flow test failed:", e.message || e);
  process.exit(1);
});
