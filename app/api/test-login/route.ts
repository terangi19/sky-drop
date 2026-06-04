import { NextResponse } from "next/server";
import { getAdminAuth } from "../../lib/firebase-admin";

const TEST_EMAIL = process.env.NEXT_PUBLIC_TEST_EMAIL || "test@skydrop.nz";
const TEST_PASSWORD = process.env.NEXT_PUBLIC_TEST_PASSWORD || "TestPass123";

export async function POST() {
  try {
    const auth = getAdminAuth();
    let user;
    try {
      user = await auth.getUserByEmail(TEST_EMAIL);
    } catch {
      user = await auth.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        displayName: "Test User",
        emailVerified: true,
      });
    }
    const token = await auth.createCustomToken(user.uid);
    return NextResponse.json({ token, email: TEST_EMAIL });
  } catch (e) {
    console.error("Test login error:", e);
    return NextResponse.json({ error: "Test login failed" }, { status: 500 });
  }
}
