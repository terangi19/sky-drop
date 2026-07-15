import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { frictionLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import {
  classifyIntentWithOpenAI,
  type AwhinaIntentContext,
  type AwhinaIntentResult,
} from "../../lib/awhina-intent-router-server";

async function checkRateLimit(req: NextRequest) {
  const ip = parseIpFromRequest(req.headers);
  const authHeader = req.headers.get("authorization");
  let uid: string | null = null;
  let email = "";

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
      email = decoded.email || "";
    } catch {
      /* optional */
    }
  }

  const limitKey = uid ? `awhina-intent:${uid}` : `awhina-intent:ip:${ip}`;
  const max = uid ? 200 : 50; // Intent classification is cheaper than full AI

  await frictionLimit(limitKey, max, 15 * 60_000, {
    ip,
    uid: uid ?? undefined,
    email,
    action: "sky-ai-chat",
  });

  return { uid, email };
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await checkRateLimit(req);

    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const pathname = typeof body.pathname === "string" ? body.pathname : "/";
    const isAdmin = typeof body.isAdmin === "boolean" ? body.isAdmin : false;
    const conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory.slice(-10) // Last 10 messages
      : [];
    const listingContext = typeof body.listingContext === "object" && body.listingContext
      ? body.listingContext
      : undefined;

    if (!message || message.length > 1000) {
      return NextResponse.json(
        { error: "Message required (max 1000 chars)" },
        { status: 400 }
      );
    }

    const context: AwhinaIntentContext = {
      pathname,
      isAdmin,
      conversationHistory,
      listingContext,
    };

    const result = await classifyIntentWithOpenAI(message, context);

    return NextResponse.json({
      ...result,
      uid: uid || undefined,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Intent classification error:", error);
    return NextResponse.json(
      {
        error: "Intent classification failed",
        code: "intent_error",
      },
      { status: 500 }
    );
  }
}
