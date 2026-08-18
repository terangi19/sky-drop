import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import { isAdminUser } from "../../lib/admin-check.server";
import {
  processAwhinaAIRequest,
  processAndExecuteAIRequest,
  type AwhinaAIRequest,
} from "../../lib/awhina-ai-server";
import { processCanonicalAwhina } from "../../lib/awhina-canonical";
import { finalizeAwhinaListingDescription } from "../../lib/awhina-listing-composer";
import type { SkyAiListingFill } from "../../lib/sky-ai-listing-fill";
import type { SkyAiListingContext } from "../../lib/sky-ai-types";
import {
  buildOpenListingSlotClarification,
  isClarificationOpen,
  type ClientTaskScopeContext,
} from "../../lib/awhina-task-scope";
import type { ClientSearchContext } from "../../lib/awhina-search-memory";
import type { AwhinaPendingAction } from "../../lib/awhina-pending-action";

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
  const limit = await rateLimit(limitKey, uid ? 80 : 15, 15 * 60_000);
  return { uid, email, allowed: limit.allowed };
}

function parseCanonicalSession(body: Record<string, unknown>, message: string) {
  const raw =
    body.awhinaSession && typeof body.awhinaSession === "object"
      ? (body.awhinaSession as Record<string, unknown>)
      : null;
  let task =
    raw?.task && typeof raw.task === "object"
      ? (raw.task as ClientTaskScopeContext)
      : null;
  const search =
    raw?.search && typeof raw.search === "object"
      ? (raw.search as ClientSearchContext)
      : null;
  const pendingAction =
    raw?.pendingAction && typeof raw.pendingAction === "object"
      ? (raw.pendingAction as AwhinaPendingAction)
      : null;
  const pendingSlot =
    typeof raw?.pendingSlot === "string" && raw.pendingSlot.trim()
      ? raw.pendingSlot.trim()
      : null;

  // Backward/compact client contract: if only the top-level pendingSlot survived,
  // rebuild the open listing clarification before canonical processing. This is
  // the same durability bridge used by /api/sky-ai.
  if (pendingSlot) {
    const open = isClarificationOpen(task?.pendingClarification);
    const hasSlot =
      open &&
      (task?.pendingClarification?.pendingSlot ||
        task?.pendingClarification?.knownEntities?.activeSlot);
    if (!hasSlot) {
      task = {
        task: task?.task || "selling",
        pendingItem: task?.pendingItem,
        compareCandidates: task?.compareCandidates,
        entityLockKey: task?.entityLockKey,
        entityLocked: task?.entityLocked,
        updatedAt: task?.updatedAt || Date.now(),
        pendingClarification: buildOpenListingSlotClarification({
          priorMessage: message.slice(0, 160),
          missingSlots: [pendingSlot],
          activeSlot: pendingSlot,
        }),
      };
    } else if (
      open &&
      task?.pendingClarification &&
      !task.pendingClarification.pendingSlot
    ) {
      task = {
        ...task,
        pendingClarification: {
          ...task.pendingClarification,
          pendingSlot,
          knownEntities: {
            ...task.pendingClarification.knownEntities,
            activeSlot: pendingSlot,
          },
        },
      };
    }
  }

  return { task, search, pendingAction };
}

function listingFactsChanged(
  before: SkyAiListingContext | undefined,
  after: SkyAiListingFill
): boolean {
  if (!before) return true;
  return (
    after.title !== before.title ||
    after.condition !== before.condition ||
    after.location !== before.location ||
    after.vehicleMake !== before.vehicleMake ||
    after.vehicleModel !== before.vehicleModel ||
    after.vehicleGeneration !== before.vehicleGeneration ||
    after.vehicleYear !== before.vehicleYear ||
    after.vehicleOdometer !== before.vehicleOdometer ||
    after.vehicleColour !== before.vehicleColour ||
    after.vehicleTransmission !== before.vehicleTransmission ||
    after.vehicleFuelType !== before.vehicleFuelType ||
    JSON.stringify(after.extras || []) !== JSON.stringify(before.extras || [])
  );
}

export async function POST(req: NextRequest) {
  try {
    const { uid, email, allowed } = await checkRateLimit(req);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many Āwhina requests — please try again later." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const pathname = typeof body.pathname === "string" ? body.pathname : "/";
    const isAdmin = uid ? await isAdminUser(email, uid) : false;
    const executeTool = body.executeTool === true;
    const conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory.slice(-10)
      : [];
    const listingContext =
      typeof body.listingContext === "object" && body.listingContext
        ? (body.listingContext as SkyAiListingContext)
        : undefined;
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : undefined;
    const anonSessionId =
      typeof body.anonSessionId === "string" && body.anonSessionId.trim()
        ? body.anonSessionId.trim().slice(0, 80)
        : undefined;
    const awhinaSession = parseCanonicalSession(body, message);

    if (!message || message.length > 2000) {
      return NextResponse.json(
        { error: "Message required (max 2000 chars)" },
        { status: 400 }
      );
    }

    // Canonical local / search-memory / tools path (same brain as /api/sky-ai wrapper).
    // IMPORTANT: client listing/session context is the durable source of truth. The
    // in-memory Maps are only warm caches and may disappear between Vercel turns.
    const canonical = processCanonicalAwhina(message, {
      pathname,
      uid,
      isAdmin,
      conversationId,
      anonSessionId: uid ? undefined : anonSessionId,
      history: conversationHistory,
      listingContext,
      clientTask: awhinaSession.task,
      clientSearch: awhinaSession.search,
      clientPendingAction: awhinaSession.pendingAction,
      source: body.source === "voice" ? "voice" : "text",
      voiceConfidence:
        body.voiceConfidence === "low" ||
        body.voiceConfidence === "medium" ||
        body.voiceConfidence === "high"
          ? body.voiceConfidence
          : undefined,
    });
    if (canonical.handled && canonical.reply) {
      let listingFill = canonical.listingFill as SkyAiListingFill | undefined;
      // A previously generated thin description must not survive after the seller
      // supplies richer vehicle facts. Recompose from the fully merged canonical
      // draft, while never overwriting a user-written description.
      if (
        listingFill &&
        listingFill.descriptionSource !== "user" &&
        listingFactsChanged(listingContext, listingFill)
      ) {
        listingFill = finalizeAwhinaListingDescription(listingFill, { force: true });
      }

      return NextResponse.json({
        reply: canonical.reply,
        navigateTo: canonical.navigateTo,
        listingFill,
        source: canonical.source,
        awhinaSession: canonical.sessionState,
        awhina: {
          intent: canonical.intent,
          tool: canonical.tool,
          confidence: canonical.confidence,
          usedLocalExecution: canonical.usedLocalExecution,
          avoidedAi: canonical.avoidedAi,
          routing: "canonical",
        },
        aiResponse: {
          toolCall: canonical.toolCall || null,
          textReply: canonical.reply,
          confidence: canonical.confidence,
          executionTime: canonical.executionTimeMs,
        },
        toolResult: canonical.navigateTo
          ? { success: true, navigateTo: canonical.navigateTo }
          : null,
        uid: uid || undefined,
        timestamp: Date.now(),
      });
    }
    if (!uid) {
      return NextResponse.json(
        { error: "Sign in to continue with personalised Āwhina help.", code: "auth_required" },
        { status: 401 }
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
