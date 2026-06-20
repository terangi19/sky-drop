/**
 * One-time helper to add the first admin email.
 * Run locally with the Firebase Admin SDK service account:
 *   npx tsx functions/src/seed-admin.ts your-admin@example.com
 */
import * as admin from "firebase-admin";

const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccount) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON");
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx functions/src/seed-admin.ts your-admin@example.com");
  process.exit(1);
}

async function main() {
  const ref = db.collection("config").doc("adminEmails");
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data()?.emails || []) : [];
  if (existing.includes(email)) {
    console.log("Email already admin:", email);
    return;
  }
  await ref.set({ emails: [...existing, email] }, { merge: true });
  console.log("Added admin email:", email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
