import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../../../lib/firebase-admin";
import { rateLimit } from "../../../../lib/rate-limit";
import {
  deleteSkyAiConversation,
  loadSkyAiMessages,
} from "../../../../lib/sky-ai-firestore";

export const runtime = "nodejs";

async function authUid(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await authUid(req);
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { allowed } = await rateLimit(`sky-ai-conv-get:${uid}`, 40, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const messages = await loadSkyAiMessages(id, uid);
    return NextResponse.json({ messages });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load messages";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await authUid(req);
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await deleteSkyAiConversation(id, uid);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
