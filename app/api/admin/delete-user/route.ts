import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../../lib/firebase-admin";
import { requireAdminFromRequest } from "../../../lib/admin-request";
import { logAdminAction } from "../../../lib/audit-log";
import { rateLimit } from "../../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`delete-user:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const decoded = await requireAdminFromRequest(req);
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    
    // Find user by email in profiles
    const profilesSnap = await db.collection("profiles").where("email", "==", email).get();
    
    if (profilesSnap.empty) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const profile = profilesSnap.docs[0];
    const uid = profile.id;

    // Delete user from Firebase Auth
    try {
      const adminAuth = (await import("firebase-admin/auth")).getAuth();
      await adminAuth.deleteUser(uid);
    } catch (authError: any) {
      console.error("Failed to delete from auth:", authError);
      // Continue with data deletion even if auth deletion fails
    }

    // Delete profile
    await profile.ref.delete();

    // Delete associated data
    const batch = db.batch();
    
    // Delete listings
    const listingsSnap = await db.collection("listings").where("sellerEmail", "==", email).get();
    listingsSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete purchases
    const purchasesSnap = await db.collection("purchases").where("buyerEmail", "==", email).get();
    purchasesSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete messages
    const messagesSnap = await db.collection("messages").where("sender", "==", email).get();
    messagesSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    const messagesRecvSnap = await db.collection("messages").where("receiver", "==", email).get();
    messagesRecvSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete conversations
    const convSnap = await db.collection("conversations").where("participants", "array-contains", email).get();
    convSnap.docs.forEach(doc => batch.delete(doc.ref));

    // Delete blocked users
    if (uid) {
      const blockedSnap = await db.collection("users").doc(uid).collection("blocked").get();
      blockedSnap.docs.forEach(doc => batch.delete(doc.ref));
    }

    await batch.commit();

    // Log the action
    await logAdminAction({
      timestamp: new Date(),
      adminEmail: decoded.email || "",
      adminUid: decoded.uid || "",
      action: "delete_user",
      target: email,
      targetId: uid,
      success: true,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, deleted: email });
  } catch (e: unknown) {
    console.error("[delete-user] Error:", e);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
