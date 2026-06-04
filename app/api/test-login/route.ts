import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminAuth,
  getAdminDb,
  isAdminInitialized,
} from "../../lib/firebase-admin";
import {
  getTestLoginEmail,
  getTestLoginPassword,
  isTestLoginApiEnabled,
} from "../../lib/test-login";

async function ensureTestProfile(uid: string, email: string) {
  const db = getAdminDb();
  const ref = db.collection("profiles").doc(uid);
  const snap = await ref.get();
  if (snap.exists) return;

  await ref.set({
    email,
    username: "testuser",
    phone: "",
    phoneVerified: false,
    referralCode: "TESTUSR1",
    memberSince: FieldValue.serverTimestamp(),
    lastActive: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function POST() {
  if (!isTestLoginApiEnabled()) {
    return NextResponse.json({ error: "Test login is disabled" }, { status: 403 });
  }

  if (!isAdminInitialized()) {
    return NextResponse.json(
      {
        error:
          "Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT to .env.local (see .env.template), then restart the dev server.",
      },
      { status: 503 }
    );
  }

  const TEST_EMAIL = getTestLoginEmail();
  const TEST_PASSWORD = getTestLoginPassword();

  try {
    const auth = getAdminAuth();
    let user;

    try {
      user = await auth.getUserByEmail(TEST_EMAIL);
      await auth.updateUser(user.uid, {
        password: TEST_PASSWORD,
        emailVerified: true,
        displayName: user.displayName || "Test User",
      });
    } catch {
      user = await auth.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        displayName: "Test User",
        emailVerified: true,
      });
    }

    await ensureTestProfile(user.uid, TEST_EMAIL);

    const token = await auth.createCustomToken(user.uid);
    return NextResponse.json({ token, email: TEST_EMAIL });
  } catch (e) {
    console.error("Test login error:", e);
    const message =
      e instanceof Error ? e.message : "Test login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
