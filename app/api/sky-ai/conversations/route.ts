import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../../lib/firebase-admin";
import { rateLimit } from "../../../lib/rate-limit";
import {
  createSkyAiConversation,
  listSkyAiConversations,
} from "../../../lib/sky-ai-firestore";

export const runtime = "nodejs";

async function authUid(req: NextRequest): Promise<{ uid: string; email: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await verifyIdToken(authHeader.slice(7));
    return { uid: decoded.uid, email: decoded.email || "" };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await authUid(req);
    if (!user) {
      return NextResponse.json({ error: "Sign in to view chat history" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`sky-ai-conv-list:${user.uid}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const conversations = await listSkyAiConversations(user.uid);
    return NextResponse.json({ conversations });
  } catch (e: unknown) {
    console.error("sky-ai conversations GET:", e);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authUid(req);
    if (!user) {
      return NextResponse.json({ error: "Sign in to start a saved chat" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`sky-ai-conv-new:${user.uid}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const id = await createSkyAiConversation(user.uid, user.email);
    return NextResponse.json({ conversationId: id });
  } catch (e: unknown) {
    console.error("sky-ai conversations POST:", e);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}
