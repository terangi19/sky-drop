import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const auth = getAdminAuth();

    // Get the token from Firestore
    const tokenDoc = await db.collection("email-verification").doc(token).get();
    
    if (!tokenDoc.exists) {
      return NextResponse.json({ error: "Invalid or expired verification link" }, { status: 400 });
    }

    const tokenData = tokenDoc.data();
    if (!tokenData?.expiresAt || !tokenData.email) {
      return NextResponse.json({ error: "Invalid verification token" }, { status: 400 });
    }
    const now = new Date();
    const expiresAt = tokenData.expiresAt?.toDate ? tokenData.expiresAt.toDate() : new Date(tokenData.expiresAt);

    if (now > expiresAt) {
      await db.collection("email-verification").doc(token).delete();
      return NextResponse.json({ error: "Verification link has expired" }, { status: 400 });
    }

    const email = tokenData.email;

    // Find the user by email
    const userRecord = await auth.getUserByEmail(email);
    
    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Mark email as verified
    await auth.updateUser(userRecord.uid, {
      emailVerified: true,
    });

    // Delete the token
    await db.collection("email-verification").doc(token).delete();

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[verify-email-token]", e);
    if (e.code === "auth/user-not-found") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
