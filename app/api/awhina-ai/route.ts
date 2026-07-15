import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { frictionLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import {
  processAwhinaAIRequest,
  processAndExecuteAIRequest,
  type AwhinaAIRequest,
} from "../../lib/awhina-ai-server";

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

  const limitKey = uid ? `awhina-ai:${uid}` : `awhina-ai:ip:${ip}`;
  const max = uid ? 300 : 100;

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
    const executeTool = body.executeTool === true;
    const conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory.slice(-10)
      : [];
    const listingContext = typeof body.listingContext === "object" && body.listingContext
      ? body.listingContext
      : undefined;

    if (!message || message.length > 2000) {
      return NextResponse.json(
        { error: "Message required (max 2000 chars)" },
        { status: 400 }
      );
    }

    const request: AwhinaAIRequest = {
      message,
      context: {
        pathname,
        isAdmin,
        listingContext,
      },
      conversationHistory,
    };

    if (executeTool) {
      const result = await processAndExecuteAIRequest(request);
      return NextResponse.json({
        ...result,
        uid: uid || undefined,
        timestamp: Date.now(),
      });
    } else {
      const aiResponse = await processAwhinaAIRequest(request);
      return NextResponse.json({
        aiResponse,
        uid: uid || undefined,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Awhina AI error:", error);
    return NextResponse.json(
      {
        error: "AI processing failed",
        code: "ai_error",
      },
      { status: 500 }
    );
  }
}
