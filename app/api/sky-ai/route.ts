import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyIdToken } from "../../lib/firebase-admin";
import { frictionLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import {
  findBestDestination,
  getGuideReply,
  scoreDestination,
} from "../../lib/guide-assistant";
import {
  appendSkyAiExchange,
  createSkyAiConversation,
  loadSkyAiMessages,
} from "../../lib/sky-ai-firestore";
import { buildSkyAiSystemPrompt } from "../../lib/sky-ai-prompt";
import { mergeListingFillWithDraft } from "../../lib/sky-ai-draft-merge";
import {
  extractSkyAiReply,
  stripSkyAiMachineTags,
  type SkyAiListingFill,
} from "../../lib/sky-ai-listing-fill";
import type { SkyAiHistoryItem, SkyAiListingContext } from "../../lib/sky-ai-types";
import {
  isSkyAiGeneralQuestion,
  skyAiCapabilitiesReply,
} from "../../lib/sky-ai-prompts";
import { openaiErrorResponse } from "../../lib/openai-errors";
import { enhanceListingFillFromMessage } from "../../lib/sky-ai-form-actions";
import {
  getSkyAiIntentHint,
  hasListingSellIntent,
  isSkyAiAdviceQuestion,
  shouldBypassNavigationShortcut,
  detectSkyAiIntent,
} from "../../lib/sky-ai-intent";
import { trySkyAiTaskReply } from "../../lib/sky-ai-task-replies";
import { logAwhinaQualityIfNeeded } from "../../lib/sky-ai-quality-log";
import { classifyIntentWithOpenAI } from "../../lib/awhina-intent-router-server";
import { getAwhinaTelemetry, generateTelemetryRequestId } from "../../lib/awhina-telemetry";

function listingFillConfirmReply(fill: SkyAiListingFill | undefined): string {
  if (!fill) return "";
  const title = fill.title?.trim();
  return title
    ? `Filled your listing — **${title}**. Add photos, then hit **Publish**. Want me to tweak anything?`
    : `Filled your listing draft. Add photos, then hit **Publish**. Want me to tweak anything?`;
}

const NAVIGATE_PATTERNS =
  /\b(take me|go to|open|show me|navigate|bring me|send me|guide me to|where is|where's|how do i get to)\b/i;

function stripBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

function tryNavigationShortcut(message: string, pathname: string) {
  // Disable navigation shortcuts on profile/listing pages to allow field updates
  if (pathname === "/profile" || pathname === "/post/ai") {
    return null;
  }

  if (isSkyAiGeneralQuestion(message)) return null;

  const dest = findBestDestination(message);
  if (!dest) return null;
  const score = scoreDestination(message, dest);
  const wantsNav =
    NAVIGATE_PATTERNS.test(message) ||
    (score >= 6 && /\b(guidelines|settings|messages|sell|listing|profile|faq)\b/i.test(message));
  if (!wantsNav || score < 4) return null;

  const same =
    pathname === dest.path ||
    (dest.path.includes("#") && pathname === dest.path.split("#")[0]);
  if (same) {
    return {
      reply: `You're already on **${dest.title}**. ${dest.blurb} What would you like help with?`,
      navigateTo: undefined,
      source: "rules" as const,
    };
  }

  return {
    reply: `Taking you to **${dest.title}** now.\n\n${dest.blurb}`,
    navigateTo: dest.path,
    source: "rules" as const,
  };
}

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

  const limitKey = uid ? `sky-ai:${uid}` : `sky-ai:ip:${ip}`;
  const max = uid ? 500 : 100;
  // Soft-limit: delay heavy users instead of hard 429 (listing creation must stay smooth).
  await frictionLimit(limitKey, max, 15 * 60_000, {
    ip,
    uid: uid ?? undefined,
    email,
    action: "sky-ai-chat",
  });
  return { uid, email };
}

function parseListingContext(body: unknown): SkyAiListingContext | null {
  if (!body || typeof body !== "object") return null;
  const c = body as Record<string, unknown>;
  const pick = (k: string) => (typeof c[k] === "string" ? c[k].trim() : "");
  const extras = Array.isArray(c.extras)
    ? (c.extras as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const draft: SkyAiListingContext = {
    title: pick("title"),
    description: pick("description"),
    category: pick("category"),
    condition: pick("condition"),
    price: pick("price"),
    listingType: pick("listingType"),
    location: pick("location"),
    paymentType: pick("paymentType"),
    vehicleMake: pick("vehicleMake"),
    vehicleModel: pick("vehicleModel"),
    vehicleYear: pick("vehicleYear"),
    vehicleOdometer: pick("vehicleOdometer"),
    vehicleColour: pick("vehicleColour"),
    vehicleBodyType: pick("vehicleBodyType"),
    vehicleFuelType: pick("vehicleFuelType"),
    vehicleTransmission: pick("vehicleTransmission"),
    rentalPriceWeekly: pick("rentalPriceWeekly"),
    rentalPriceMonthly: pick("rentalPriceMonthly"),
    rentalDeposit: pick("rentalDeposit"),
    stockQuantity: pick("stockQuantity"),
    serviceDuration: pick("serviceDuration"),
    extras: extras?.length ? extras : undefined,
  };
  const hasScalar = Object.entries(draft).some(
    ([k, v]) => k !== "extras" && typeof v === "string" && v.length > 0
  );
  return hasScalar || (extras && extras.length > 0) ? draft : null;
}

function mergeFillWithContext(
  listingContext: SkyAiListingContext | null,
  listingFill: SkyAiListingFill | undefined
): SkyAiListingFill | undefined {
  if (!listingFill) return undefined;
  if (!listingContext) return listingFill;
  return mergeListingFillWithDraft(listingContext, listingFill);
}

function finalizeListingFill(
  message: string,
  listingContext: SkyAiListingContext | null,
  listingFill: SkyAiListingFill | undefined
): SkyAiListingFill | undefined {
  const merged = mergeFillWithContext(listingContext, listingFill);
  if (!merged) return undefined;
  return enhanceListingFillFromMessage(message, merged) ?? merged;
}

const MAX_SKY_AI_IMAGES = 4;

function parseSkyAiImages(body: unknown): string[] {
  if (!Array.isArray(body)) return [];
  const out: string[] = [];
  for (const item of body) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (!s.startsWith("data:image/")) continue;
    if (s.length > 6_500_000) continue;
    out.push(s);
    if (out.length >= MAX_SKY_AI_IMAGES) break;
  }
  return out;
}

function buildMessages(
  message: string,
  pathname: string,
  history: SkyAiHistoryItem[],
  listingContext: SkyAiListingContext | null,
  images: string[],
  justGeneratedListing: boolean,
  priorAssistant?: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const userContent: OpenAI.Chat.ChatCompletionMessageParam["content"] =
    images.length > 0
      ? [
          {
            type: "text",
            text:
              message ||
              "The user uploaded product photo(s) for their Sky Drop listing. Describe what you see and fill the sell form with LISTING_FILL.",
          },
          ...images.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "low" as const },
          })),
        ]
      : message;

  return [
    {
      role: "system",
      content:
        buildSkyAiSystemPrompt(pathname, listingContext, {
          hasImages: images.length > 0,
          justGeneratedListing,
        }) +
        (message ? `\n\n${getSkyAiIntentHint(message, pathname, priorAssistant)}` : ""),
    },
    ...history.map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: userContent },
  ];
}

function sseLine(obj: Record<string, unknown>) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function safePersist(
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn("sky-ai: conversation save failed (chat still works):", e);
  }
}

function recordAwhinaQuality(
  req: NextRequest,
  message: string,
  pathname: string,
  reply: string,
  source: "ai" | "rules",
  listingFill: SkyAiListingFill | undefined,
  uid: string | null
) {
  void logAwhinaQualityIfNeeded({
    userMessage: message,
    reply,
    pathname,
    source,
    listingFill,
    uid,
    ip: parseIpFromRequest(req.headers),
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const telemetryId = generateTelemetryRequestId();
  const telemetry = getAwhinaTelemetry();
  
  try {
    const { uid, email } = await checkRateLimit(req);

    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const pathname = typeof body.pathname === "string" ? body.pathname : "/";
    const stream = body.stream === true;
    let conversationId =
      typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const listingContext = parseListingContext(body.listingContext);
    const images = parseSkyAiImages(body.images);

    if ((!message && images.length === 0) || message.length > 4000) {
      return NextResponse.json(
        { error: "Message or image required (max 4000 chars)" },
        { status: 400 }
      );
    }

    let history: SkyAiHistoryItem[] = [];

    if (uid && conversationId) {
      try {
        const stored = await loadSkyAiMessages(conversationId, uid, 30);
        history = stored.map((m) => ({ role: m.role, content: m.content }));
      } catch {
        conversationId = "";
      }
    }

    if (!history.length && Array.isArray(body.history)) {
      history = body.history
        .filter(
          (h: unknown) =>
            h &&
            typeof h === "object" &&
            (h as SkyAiHistoryItem).role &&
            typeof (h as SkyAiHistoryItem).content === "string"
        )
        .slice(-20)
        .map((h: SkyAiHistoryItem) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content).slice(0, 4000),
        }));
    }

    if (uid && !conversationId) {
      try {
        conversationId = await createSkyAiConversation(uid, email);
      } catch (e) {
        console.warn("sky-ai: could not create conversation:", e);
        conversationId = "";
      }
    }

    // NEW INTENT ROUTER INTEGRATION
    // Use unified intent router for classification before AI processing
    const intentClassificationStart = Date.now();
    const intentResult = await classifyIntentWithOpenAI(message, {
      pathname,
      isAdmin: false, // TODO: Add admin check
      listingContext: listingContext as Record<string, unknown> | undefined,
      conversationHistory: history,
    });
    const timeToFirstResponse = Date.now() - intentClassificationStart;

    console.log("[NEW_INTENT_ROUTER]", {
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      entities: intentResult.entities,
    });

    // LEGACY FLOW - Sky AI Architecture
    // Original architecture with new intent router integration

    let reply = "";
    let navigateTo: string | undefined = undefined;

    // Try navigation shortcut first
    const navShortcut = tryNavigationShortcut(message, pathname);
    let hasListingFill = false;
    
    if (navShortcut) {
      reply = navShortcut.reply;
      navigateTo = navShortcut.navigateTo;
    } else {
      // Full AI processing - enhanced with intent context
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      
      const justGeneratedListing = Boolean(listingContext && listingContext.title);
      const messages = buildMessages(message, pathname, history, listingContext, images, justGeneratedListing);
      
      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const aiReply = response.choices[0]?.message?.content || "I understand. How can I help?";
      const extractedReply = extractSkyAiReply(aiReply);
      reply = extractedReply.text;
      hasListingFill = Boolean(extractedReply.listingFill);
      
      // Check for navigation in AI response
      if (extractedReply.navigateTo) {
        navigateTo = extractedReply.navigateTo;
      }

      // Handle listing fill if present
      if (extractedReply.listingFill) {
        const finalFill = finalizeListingFill(message, listingContext, extractedReply.listingFill);
        if (finalFill) {
          reply = listingFillConfirmReply(finalFill);
        }
      }
    }

    // Step 8: Save to conversation history
    if (uid && conversationId) {
      await safePersist(() =>
        appendSkyAiExchange(conversationId, uid, message, reply, navigateTo)
      );
    }

    // Step 9: Return response
    const totalExecutionTime = Date.now() - startTime;

    // Record telemetry before returning
    telemetry.recordEvent({
      timestamp: Date.now(),
      requestId: telemetryId,
      detectedIntent: intentResult.intent,
      confidenceScore: intentResult.confidence === "high" ? 0.9 : intentResult.confidence === "medium" ? 0.7 : 0.5,
      timeToFirstResponse,
      totalExecutionTime,
      askedClarificationQuestion: reply.includes("?") && (reply.includes("What") || reply.includes("How") || reply.includes("Can you")),
      userRepeatedOrRephrased: false, // TODO: Track from conversation history
      actionExecutedSuccessfully: Boolean(navigateTo || hasListingFill),
      respondedConversationallyInsteadOfActing: !navigateTo && !hasListingFill,
      pathname,
      message,
      hasConversationHistory: history.length > 0,
      hasListingContext: Boolean(listingContext),
    });

    if (stream) {
      return new Response(
        sseLine({ type: "delta", text: reply }) +
          sseLine({
            type: "done",
            reply,
            navigateTo,
            conversationId: conversationId || undefined,
          }),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
      );
    }

    return NextResponse.json({
      reply,
      navigateTo,
      conversationId: conversationId || undefined,
    });

  } catch (error) {
    console.error("[NEW_PIPELINE] Error:", error);
    const errorResponse = openaiErrorResponse(error);
    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.status }
    );
  }
}
