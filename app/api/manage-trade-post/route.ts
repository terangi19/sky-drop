import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { enforceProtection } from "../../lib/enforce-protection";
import { parseIpFromRequest } from "../../lib/geo-check";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let token;
    try { token = await verifyIdToken(authHeader.slice(7)); } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }
    const db = getAdminDb();

    // DELETE trade post
    if (action === "delete") {
      const postId = typeof body.postId === "string" ? body.postId : "";
      if (!postId) {
        return NextResponse.json({ error: "postId required" }, { status: 400 });
      }
      const ref = db.collection("tradePosts").doc(postId);
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
      if (snap.data()?.sellerEmail !== token.email) {
        return NextResponse.json({ error: "You can only delete your own posts" }, { status: 403 });
      }
      await ref.delete();
      return NextResponse.json({ success: true });
    }

    // UPDATE trade post status
    if (action === "status") {
      const postId = typeof body.postId === "string" ? body.postId : "";
      const status = typeof body.status === "string" ? body.status : "";
      if (!postId || !status) {
        return NextResponse.json({ error: "postId and status required" }, { status: 400 });
      }
      const ref = db.collection("tradePosts").doc(postId);
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
      if (snap.data()?.sellerEmail !== token.email) {
        return NextResponse.json({ error: "You can only update your own posts" }, { status: 403 });
      }
      await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }

    // ADD REPLY to trade post
    if (action === "reply") {
      const postId = typeof body.postId === "string" ? body.postId : "";
      const replyText = typeof body.text === "string" ? body.text.trim() : "";
      if (!postId || !replyText) {
        return NextResponse.json({ error: "postId and text required" }, { status: 400 });
      }
      const ref = db.collection("tradePosts").doc(postId);
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
      const post = snap.data()!;
      const replies = Array.isArray(post.replies) ? [...post.replies] : [];
      replies.push({ text: replyText, by: token.email, at: new Date().toISOString() });
      await ref.update({ replies, updatedAt: FieldValue.serverTimestamp() });

      // Also send message to seller
      const participants = [token.email, post.sellerEmail].filter(Boolean);
      await db.collection("messages").add({
        text: replyText,
        sender: token.email,
        receiver: post.sellerEmail || "",
        participants,
        listingId: postId,
        listingTitle: post.title || null,
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    console.error("[manage-trade-post]", e);
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}
