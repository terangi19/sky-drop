import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import { isAdminUser } from "../../lib/admin-check.server";
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
  const limit = await rateLimit(limitKey, uid ? 80 : 10, 15 * 60_000);
  return { uid, email, allowed: limit.allowed };
}

export async function POST(req: NextRequest) {
  try {
    const { uid, email, allowed } = await checkRateLimit(req);
    if (!uid) {
      return NextResponse.json(
        { error: "Sign in to use AI intent classification.", code: "auth_required" },
        { status: 401 }
      );
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many classification requests — please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const pathname = typeof body.pathname === "string" ? body.pathname : "/";
    const isAdmin = await isAdminUser(email, uid);
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
