import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import {
  findBestDestination,
  scoreDestination,
} from "../../lib/guide-assistant";
import {
  appendSkyAiExchange,
  createSkyAiConversation,
  loadSkyAiMessages,
} from "../../lib/sky-ai-firestore";
import { mergeListingFillWithDraft } from "../../lib/sky-ai-draft-merge";
import { type SkyAiListingFill } from "../../lib/sky-ai-listing-fill";
import type { SkyAiHistoryItem, SkyAiListingContext } from "../../lib/sky-ai-types";
import { isSkyAiGeneralQuestion } from "../../lib/sky-ai-prompts";
import { openaiErrorResponse } from "../../lib/openai-errors";
import { enhanceListingFillFromMessage } from "../../lib/sky-ai-form-actions";
import {
  hasListingSellIntent,
  isExplicitNewSellListingMessage,
  isSkyAiAdviceQuestion,
  shouldBypassNavigationShortcut,
  detectSkyAiIntent,
} from "../../lib/sky-ai-intent";
import { trySkyAiTaskReply } from "../../lib/sky-ai-task-replies";
import { logAwhinaQualityIfNeeded } from "../../lib/sky-ai-quality-log";
import { processCanonicalAwhina } from "../../lib/awhina-canonical";
import { recordAwhinaObs } from "../../lib/awhina-observability";
import { extractSellerAuthoredText } from "../../lib/awhina-orchestration-boundary";
import {
  buildOpenListingSlotClarification,
  isClarificationOpen,
} from "../../lib/awhina-task-scope";
import {
  hasProfileFillContent,
  type SkyAiProfileFill,
} from "../../lib/sky-ai-profile-fill";
import { finalizePageAwareResponse } from "../../lib/sky-ai-page-intent";
import { validateListingFillFields } from "../../lib/awhina-listing-fill-tools";
import { assessDraftTransition } from "../../lib/awhina-draft-transition";
import { sanitizeProfileFillProposal } from "../../lib/awhina-profile-tools";
import {
  finalizeAwhinaListingDescription,
  finalizeAwhinaListingDescriptionAsync,
} from "../../lib/awhina-listing-composer";
import {
  buildDescriptionWriterFacts,
  validateAiListingDescription,
} from "../../lib/awhina-description-writer";
import type { SkyAiProfileContext } from "../../lib/sky-ai-profile-context";
import { runVisionCapability } from "../../lib/awhina-vision-capability";
import { runVisionListing } from "../../lib/awhina-vision-listing";
import { isAwhinaVisionListingEnabledServer } from "../../lib/awhina-vision-listing-flags";
import { confidenceLevelToScore } from "../../lib/awhina-confidence-levels";
import { runFreeformCapability } from "../../lib/awhina-freeform-capability";
import {
  buildPostListingNextActions,
  isCompareRequest,
  parseCompareTitlesFromMessage,
  resolveGroundedCompare,
  polishAwhinaReplyStyle,
  progressStatesForRoute,
  progressStatesForCanonical,
  shouldAutoNavigate,
  type AwhinaProgressState,
  type ListingFacts,
} from "../../lib/awhina-product-ux";
import { fetchListingFactsForCompare } from "../../lib/awhina-listing-compare.server";

function listingFillConfirmReply(fill: SkyAiListingFill | undefined): string {
  if (!fill) return "";
  return buildPostListingNextActions(fill, { hasPhotos: false });
}

function listingHasBuyerCopyEvidence(fill: SkyAiListingFill): boolean {
  const extras = (fill.extras || []).filter(
    (entry) =>
      !/^(domain|objectType|object_type|listing_type|listingtype|category_id|field_source|vision_confidence):/i.test(
        String(entry)
      )
  );
  return Boolean(
    fill.condition ||
      extras.length ||
      fill.vehicleYear ||
      fill.vehicleOdometer ||
      fill.vehicleTransmission ||
      fill.vehicleColour ||
      fill.servicePricingType ||
      fill.rentalSubType
  );
}

function shouldWriteDescription(
  fill: SkyAiListingFill,
  prior: SkyAiListingContext | null,
  message: string
): boolean {
  if (fill.descriptionSource === "user") return false;
  if (/\b(?:rewrite|regenerate|improve|update|make).{0,30}\b(?:description|desc)\b/i.test(message)) {
    return true;
  }
  if (!listingHasBuyerCopyEvidence(fill)) return false;
  if (!prior) return true;
  return (
    fill.title !== prior.title ||
    fill.condition !== prior.condition ||
    fill.location !== prior.location ||
    fill.vehicleColour !== prior.vehicleColour ||
    JSON.stringify(fill.extras || []) !== JSON.stringify(prior.extras || []) ||
    fill.vehicleMake !== prior.vehicleMake ||
    fill.vehicleModel !== prior.vehicleModel ||
    fill.vehicleOdometer !== prior.vehicleOdometer ||
    fill.vehicleTransmission !== prior.vehicleTransmission
  );
}

async function enhanceAiOwnedDescription(
  fill: SkyAiListingFill | undefined,
  prior: SkyAiListingContext | null,
  message: string
): Promise<SkyAiListingFill | undefined> {
  if (!fill || !shouldWriteDescription(fill, prior, message)) return fill;
  const rewriteRequested =
    /\b(?:rewrite|regenerate|improve|update|make).{0,30}\b(?:description|desc)\b/i.test(message);
  const stillValid = fill.description?.trim()
    ? validateAiListingDescription(fill.description, buildDescriptionWriterFacts(fill))
    : null;
  try {
    return await finalizeAwhinaListingDescriptionAsync(fill, {
      force: rewriteRequested || !stillValid,
    });
  } catch {
    return fill;
  }
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
  // Help / how-to questions stay in place — only explicit action nav
  if (
    !shouldAutoNavigate({
      message,
      intent: "navigation",
      hasExplicitNavAction: false,
    })
  ) {
    return null;
  }

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
  const limit = await rateLimit(limitKey, uid ? 120 : 20, 15 * 60_000);
  return { uid, email, allowed: limit.allowed };
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
    vehicleGeneration: pick("vehicleGeneration"),
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

function parseProfileContext(body: unknown): SkyAiProfileContext | null {
  if (!body || typeof body !== "object") return null;
  const c = body as Record<string, unknown>;
  const fill: SkyAiProfileFill = {};
  for (const key of [
    "username",
    "bio",
    "region",
    "discord",
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "website",
    "businessName",
  ] as const) {
    if (typeof c[key] === "string" && c[key].trim()) fill[key] = c[key].trim();
  }
  return hasProfileFillContent(fill) ? fill : null;
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
  if (!listingFill) return undefined;

  // Explicit NEW sell → fresh draft. Do NOT merge prior draft/search fields.
  // Follow-ups ("actually make it $250") still merge.
  const transition = assessDraftTransition({
    message,
    priorDraft: listingContext,
  });
  const fresh =
    listingFill.replaceDraft === true ||
    transition.mode === "REPLACE" ||
    isExplicitNewSellListingMessage(message);

  if (fresh) {
    const seed = { ...listingFill, replaceDraft: true };
    const enhanced = enhanceListingFillFromMessage(message, seed) ?? seed;
    return {
      ...finalizeAwhinaListingDescription(enhanced),
      replaceDraft: true,
    };
  }

  const merged = mergeFillWithContext(listingContext, listingFill);
  if (!merged) return undefined;
  return finalizeAwhinaListingDescription(
    enhanceListingFillFromMessage(message, merged) ?? merged
  );
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

function sseLine(obj: Record<string, unknown>) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function chunkReplyText(text: string, size = 48): string[] {
  if (!text || text.length <= size) return text ? [text] : [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function parsePageListings(raw: unknown): ListingFacts[] {
  if (!Array.isArray(raw)) return [];
  const out: ListingFacts[] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    out.push({
      id: typeof o.id === "string" ? o.id : undefined,
      title,
      price: o.price != null ? String(o.price) : null,
      year: o.year != null ? String(o.year) : o.vehicleYear != null ? String(o.vehicleYear) : null,
      make: o.make != null ? String(o.make) : o.vehicleMake != null ? String(o.vehicleMake) : null,
      model: o.model != null ? String(o.model) : o.vehicleModel != null ? String(o.vehicleModel) : null,
      mileage:
        o.mileage != null
          ? String(o.mileage)
          : o.vehicleOdometer != null
            ? String(o.vehicleOdometer)
            : null,
      condition: o.condition != null ? String(o.condition) : null,
      location: o.location != null ? String(o.location) : null,
      sellerReputation: o.sellerReputation != null ? String(o.sellerReputation) : null,
      delivery: o.delivery != null ? String(o.delivery) : null,
      listingAge: o.listingAge != null ? String(o.listingAge) : null,
      category: o.category != null ? String(o.category) : null,
      createdAtMs: typeof o.createdAtMs === "number" ? o.createdAtMs : null,
    });
  }
  return out;
}

function parseSearchResultMeta(raw: unknown): {
  count?: number;
  cheapestPrice?: number;
  newestTitle?: string;
} | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const meta: { count?: number; cheapestPrice?: number; newestTitle?: string } = {};
  if (typeof o.count === "number" && o.count >= 0) meta.count = o.count;
  if (typeof o.cheapestPrice === "number" && o.cheapestPrice > 0) meta.cheapestPrice = o.cheapestPrice;
  if (typeof o.newestTitle === "string" && o.newestTitle.trim()) meta.newestTitle = o.newestTitle.trim().slice(0, 80);
  return Object.keys(meta).length ? meta : undefined;
}

/** Local/canonical: instant. Vision/freeform: few progress states + chunked deltas. */
function respondPayload(
  stream: boolean,
  payload: Record<string, unknown>,
  status = 200,
  opts?: { progress?: AwhinaProgressState[]; chunkReply?: boolean }
) {
  const reply = typeof payload.reply === "string" ? polishAwhinaReplyStyle(payload.reply) : "";
  const donePayload = { ...payload, reply };
  if (!stream) {
    return NextResponse.json(donePayload, { status });
  }

  const progress = opts?.progress?.length ? opts.progress : [];
  const chunk = opts?.chunkReply === true && reply.length > 80;

  if (!progress.length && !chunk) {
    return new Response(
      sseLine({ type: "delta", text: reply }) + sseLine({ type: "done", ...donePayload }),
      {
        status,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      }
    );
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for (const state of progress) {
          controller.enqueue(encoder.encode(sseLine({ type: "progress", state })));
          await new Promise((r) => setTimeout(r, 40));
        }
        if (chunk) {
          for (const part of chunkReplyText(reply)) {
            controller.enqueue(encoder.encode(sseLine({ type: "delta", text: part })));
            await new Promise((r) => setTimeout(r, 12));
          }
        } else {
          controller.enqueue(encoder.encode(sseLine({ type: "delta", text: reply })));
        }
        controller.enqueue(encoder.encode(sseLine({ type: "done", ...donePayload })));
      } catch (e) {
        console.warn("sky-ai sse stream error:", e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
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
  try {
    const { uid, email, allowed } = await checkRateLimit(req);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many Āwhina requests — please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const inboundMessage = typeof body.message === "string" ? body.message.trim() : "";
    // Architectural boundary: only seller-authored text enters the sell pipeline.
    // Client-era LISTING CREATION REQUEST wrappers (and residual control phrases)
    // are stripped before intent, extraction, evidence, and enhance.
    const message = extractSellerAuthoredText(inboundMessage) || inboundMessage;
    const pathname = typeof body.pathname === "string" ? body.pathname : "/";
    const stream = body.stream === true;
    let conversationId =
      typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const listingContext = parseListingContext(body.listingContext);
    const profileContext = parseProfileContext(body.profileContext);
    const images = parseSkyAiImages(body.images);

    if ((!message && images.length === 0) || message.length > 4000) {
      return NextResponse.json(
        { error: "Message or image required (max 4000 chars)" },
        { status: 400 }
      );
    }
    // Guest chat may use deterministic help, but every OpenAI-backed capability
    // requires an authenticated Firebase identity.
    if (images.length > 0 && !uid) {
      return NextResponse.json(
        { error: "Sign in to analyse listing photos.", code: "auth_required" },
        { status: 401 }
      );
    }

    let history: SkyAiHistoryItem[] = [];

    if (uid && conversationId) {
      try {
        const stored = await loadSkyAiMessages(conversationId, uid, 30);
        // Trim OpenAI context — sell/profile keep a few turns for follow-ups
        const keep =
          pathname.startsWith("/post/ai") || pathname.startsWith("/profile") ? 10 : 6;
        history = stored
          .map((m) => ({ role: m.role, content: m.content }))
          .slice(-keep);
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
        .slice(-6)
        .map((h: SkyAiHistoryItem) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content).slice(0, 1500),
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

    const hasListingIntent = hasListingSellIntent(message);

  const lastAssistantMessage =
    history.length > 0 && history[history.length - 1]?.role === "assistant"
      ? history[history.length - 1].content
      : "";
  const priorUserMessage = [...history].reverse().find((h) => h.role === "user")?.content;
  const taskContext = { priorUserMessage, priorAssistantMessage: lastAssistantMessage };
  const justGeneratedListing = /\[\[LISTING_FILL\]\]/.test(lastAssistantMessage);
  const currentIntent = detectSkyAiIntent(message);
  const isNewTaskSwitch =
    isSkyAiGeneralQuestion(message) ||
    currentIntent === "find_buy" ||
    currentIntent === "price_value" ||
    currentIntent === "visibility_issue" ||
    currentIntent === "buy_trouble";

  const contextualListingContext =
    pathname.startsWith("/post/ai") || !isNewTaskSwitch ? listingContext : null;

  // ── Vision: ONE shared multimodal identifier (not the legacy flat extractor) ──
  if (images.length > 0) {
    if (isAwhinaVisionListingEnabledServer()) {
      const vision = await runVisionListing({
        images,
        message,
        listingContext: contextualListingContext,
        draftKey: uid || "sky-ai",
        pathname,
        force: true,
      });
      let listingFill = vision.listingFill
        ? finalizeListingFill(
            message || "photo upload",
            contextualListingContext,
            vision.listingFill
          )
        : undefined;
      if (listingFill) {
        const validated = validateListingFillFields(listingFill);
        listingFill = validated.ok ? validated.fill : undefined;
      }
      listingFill = await enhanceAiOwnedDescription(
        listingFill,
        contextualListingContext,
        message || "photo upload"
      );
      const reply = stripBold(
        vision.reply ||
          listingFillConfirmReply(listingFill) ||
          "Add photos, then hit **Publish**."
      );
      if (uid && conversationId) {
        await safePersist(() =>
          appendSkyAiExchange(conversationId, uid, message || "[image]", reply, undefined)
        );
      }
      recordAwhinaQuality(
        req,
        message || "[image]",
        pathname,
        reply,
        vision.ok ? "ai" : "rules",
        listingFill,
        uid
      );
      const payload = {
        reply,
        listingFill,
        displayIdentity: vision.displayIdentity,
        needsIdentityConfirm: vision.needsIdentityConfirm,
        canonicalIdentity: vision.adapted?.canonicalIdentity,
        observation: vision.observation,
        source: vision.degraded ? ("rules" as const) : ("ai" as const),
        conversationId: conversationId || undefined,
        awhina: {
          intent: "vision",
          tool: "runVisionListing",
          confidence: confidenceLevelToScore(
            vision.observation?.overallConfidence || "MEDIUM"
          ),
          confidenceLevel: vision.observation?.overallConfidence,
          routing: "awhina_vision_shared_pipeline",
          avoidedAi: false,
          usedLocalExecution: false,
          degraded: vision.degraded,
          latencyMs: vision.latencyMs,
          promptTokens: vision.promptTokens,
          completionTokens: vision.completionTokens,
          continuity: vision.adapted?.continuity,
        },
        ...(vision.errorCode ? { code: vision.errorCode } : {}),
      };
      return respondPayload(
        stream,
        payload,
        vision.errorCode === "missing_openai_key" ? 503 : 200,
        { progress: progressStatesForRoute("vision"), chunkReply: true }
      );
    }

    // Legacy fallback only when shared vision listing flag is off.
    const vision = await runVisionCapability({
      images,
      message,
      listingContext: contextualListingContext,
      pathname,
    });
    let listingFill = vision.listingFill
      ? finalizeListingFill(message || "photo upload", contextualListingContext, vision.listingFill)
      : undefined;
    if (listingFill) {
      const validated = validateListingFillFields(listingFill);
      listingFill = validated.ok ? validated.fill : undefined;
    }
    listingFill = await enhanceAiOwnedDescription(
      listingFill,
      contextualListingContext,
      message || "photo upload"
    );
    const reply = stripBold(
      vision.reply || listingFillConfirmReply(listingFill) || "Add photos, then hit **Publish**."
    );
    if (uid && conversationId) {
      await safePersist(() =>
        appendSkyAiExchange(conversationId, uid, message || "[image]", reply, undefined)
      );
    }
    recordAwhinaQuality(req, message || "[image]", pathname, reply, vision.ok ? "ai" : "rules", listingFill, uid);
    const payload = {
      reply,
      listingFill,
      source: vision.degraded ? ("rules" as const) : ("ai" as const),
      conversationId: conversationId || undefined,
      awhina: {
        intent: "vision",
        tool: vision.tool,
        confidence: confidenceLevelToScore(vision.confidence),
        confidenceLevel: vision.confidence,
        routing: "vision_capability",
        avoidedAi: false,
        usedLocalExecution: false,
        degraded: vision.degraded,
        latencyMs: vision.latencyMs,
        promptTokens: vision.promptTokens,
        completionTokens: vision.completionTokens,
      },
      ...(vision.degraded && vision.errorCode ? { code: vision.errorCode } : {}),
    };
    return respondPayload(
      stream,
      payload,
      vision.degraded && vision.errorCode === "missing_openai_key" ? 503 : 200,
      { progress: progressStatesForRoute("vision"), chunkReply: true }
    );
  }

  // ── Canonical Āwhina (local + search + sell draft + profile) ──
  if (message) {
    const anonSessionId =
      typeof body.anonSessionId === "string" && body.anonSessionId.trim()
        ? body.anonSessionId.trim().slice(0, 80)
        : undefined;
    const awhinaSession =
      body.awhinaSession && typeof body.awhinaSession === "object"
        ? (body.awhinaSession as {
            task?: {
              task?: "selling" | "shopping" | "help" | "none";
              pendingItem?: string;
              compareCandidates?: string[];
              pendingClarification?: import("../../lib/awhina-task-scope").PendingClarification;
              entityLockKey?: string;
              entityLocked?: boolean;
              updatedAt?: number;
            };
            search?: {
              filters?: Record<string, unknown>;
              updatedAt?: number;
            };
            pendingSlot?: string | null;
            pendingAction?: import("../../lib/awhina-pending-action").AwhinaPendingAction | null;
          })
        : undefined;

    const pageListings = parsePageListings(body.pageListings);
    const searchResultMeta = parseSearchResultMeta(body.searchResultMeta);

    // Real compare: enrich BEFORE canonical so one grounded pathway (no title-only then patch)
    let comparePageListings = pageListings;
    if (isCompareRequest(message)) {
      const pre = resolveGroundedCompare({
        message,
        pageListings,
        compareCandidates: awhinaSession?.task?.compareCandidates,
      });
      if (pre.needsEnrichment) {
        const needles =
          pre.titles.length >= 2
            ? pre.titles
            : parseCompareTitlesFromMessage(message).length >= 2
              ? parseCompareTitlesFromMessage(message)
              : (awhinaSession?.task?.compareCandidates || []).slice(0, 4);
        if (needles.length >= 2) {
          const fetched = await fetchListingFactsForCompare(needles);
          if (fetched.some((f) => f.price || f.condition || f.location || f.mileage)) {
            comparePageListings = fetched;
          }
        }
      } else if (pre.grounded) {
        comparePageListings = pre.facts;
      }
    }

    // Ensure top-level pendingSlot reaches canonical as open listing_slots clarification
    let clientTask = (awhinaSession?.task || null) as
      | import("../../lib/awhina-task-scope").ClientTaskScopeContext
      | null;
    const topSlot =
      typeof awhinaSession?.pendingSlot === "string" && awhinaSession.pendingSlot.trim()
        ? awhinaSession.pendingSlot.trim()
        : null;
    if (topSlot) {
      const open = isClarificationOpen(clientTask?.pendingClarification);
      const hasSlot =
        open &&
        (clientTask?.pendingClarification?.pendingSlot ||
          clientTask?.pendingClarification?.knownEntities?.activeSlot);
      if (!hasSlot) {
        clientTask = {
          task: clientTask?.task || "selling",
          pendingItem: clientTask?.pendingItem,
          compareCandidates: clientTask?.compareCandidates,
          entityLockKey: clientTask?.entityLockKey,
          entityLocked: clientTask?.entityLocked,
          updatedAt: clientTask?.updatedAt || Date.now(),
          pendingClarification: buildOpenListingSlotClarification({
            priorMessage: message.slice(0, 160),
            missingSlots: [topSlot],
            activeSlot: topSlot,
          }),
        };
      } else if (
        open &&
        clientTask?.pendingClarification &&
        !clientTask.pendingClarification.pendingSlot
      ) {
        clientTask = {
          ...clientTask,
          pendingClarification: {
            ...clientTask.pendingClarification,
            pendingSlot: topSlot,
            knownEntities: {
              ...clientTask.pendingClarification.knownEntities,
              activeSlot: topSlot,
            },
          },
        };
      }
    }

    const canonical = processCanonicalAwhina(message, {
      pathname,
      uid,
      conversationId: conversationId || undefined,
      anonSessionId: uid ? undefined : anonSessionId,
      history,
      listingContext: contextualListingContext,
      profileContext,
      clientTask,
      clientSearch: awhinaSession?.search
        ? {
            filters: awhinaSession.search.filters as import("../../lib/awhina-search-memory").SearchSessionFilters,
            updatedAt: awhinaSession.search.updatedAt,
          }
        : null,
      clientPendingAction: awhinaSession?.pendingAction || null,
      hasImages: Array.isArray(body.images) && body.images.length > 0,
      source: body.source === "voice" ? "voice" : "text",
      voiceConfidence:
        body.voiceConfidence === "medium" || body.voiceConfidence === "low"
          ? body.voiceConfidence
          : body.voiceConfidence === "high"
            ? "high"
            : undefined,
      pageListings: comparePageListings,
      searchResultMeta,
    });

    if (canonical.handled && canonical.reply) {
      let reply = stripBold(canonical.reply);
      let navigateTo = canonical.navigateTo;
      let listingFill: SkyAiListingFill | undefined;
      let profileFill: SkyAiProfileFill | undefined;

      if (canonical.listingFill) {
        const validated = validateListingFillFields(
          canonical.listingFill as SkyAiListingFill
        );
        if (validated.ok) {
          // Use contextualListingContext (may be null on task switch); finalizeListingFill
          // also skips merge on explicit NEW sell / replaceDraft.
          listingFill = finalizeListingFill(
            message,
            contextualListingContext,
            validated.fill
          );
          listingFill = await enhanceAiOwnedDescription(
            listingFill,
            contextualListingContext,
            message
          );
        } else {
          reply = validated.error;
        }
      }

      if (canonical.profileFill) {
        const sanitized = sanitizeProfileFillProposal(canonical.profileFill);
        if (sanitized.ok) profileFill = sanitized.fill;
      }

      const pageAware = finalizePageAwareResponse(pathname, message, profileContext, {
        reply,
        navigateTo,
        profileFill,
      });
      reply = stripBold(pageAware.reply);
      navigateTo = pageAware.navigateTo;
      if (pageAware.profileFill) profileFill = pageAware.profileFill;

      // ANSWER vs ACTION: strip accidental nav on help/education replies
      if (
        navigateTo &&
        !shouldAutoNavigate({
          message,
          intent: canonical.intent,
          hasExplicitNavAction: Boolean(
            canonical.tool === "navigate" ||
              canonical.tool === "openMessages" ||
              canonical.tool === "openCategory"
          ),
        })
      ) {
        navigateTo = undefined;
      }

      recordAwhinaQuality(req, message, pathname, reply, "rules", listingFill, uid);
      recordAwhinaObs({
        intent: canonical.intent,
        localVsAi: canonical.usedLocalExecution ? "local" : "rules",
        capability: "local",
        tool: canonical.tool,
        success: true,
        latencyMs: canonical.executionTimeMs,
        clarification: Boolean(canonical.clarificationQuestion),
        pathname,
        source: body.source === "voice" ? "voice" : "text",
      });
      if (uid && conversationId) {
        await safePersist(() =>
          appendSkyAiExchange(conversationId, uid, message, reply, navigateTo)
        );
      }
      const progress = progressStatesForCanonical({
        intent: canonical.intent,
        tool: canonical.tool,
      });
      const chunkReply =
        progress.length > 0 && typeof reply === "string" && reply.length > 80;
      return respondPayload(
        stream,
        {
          reply,
          navigateTo,
          listingFill,
          profileFill: profileFill && hasProfileFillContent(profileFill) ? profileFill : undefined,
          source: "rules" as const,
          conversationId: conversationId || undefined,
          awhinaSession: canonical.sessionState || undefined,
          awhina: {
            intent: canonical.intent,
            tool: canonical.tool,
            confidence: canonical.confidence,
            usedLocalExecution: canonical.usedLocalExecution,
            avoidedAi: canonical.avoidedAi,
            routing: "canonical",
          },
        },
        200,
        { progress, chunkReply }
      );
    }
  }

  // Remaining deterministic task replies (visibility, price, cancel, buy trouble)
  const taskReply = trySkyAiTaskReply(message, pathname, taskContext);
  if (taskReply) {
    const reply = stripBold(taskReply.text);
    recordAwhinaQuality(req, message, pathname, reply, taskReply.source, undefined, uid);
    recordAwhinaObs({
      intent: "task_reply",
      localVsAi: "rules",
      capability: "rules",
      success: true,
      latencyMs: 0,
      clarification: false,
      pathname,
      source: "text",
    });
    if (uid && conversationId) {
      await safePersist(() =>
        appendSkyAiExchange(conversationId, uid, message, reply, taskReply.navigateTo)
      );
    }
    return respondPayload(stream, {
      reply,
      navigateTo: taskReply.navigateTo,
      source: taskReply.source,
      conversationId: conversationId || undefined,
      awhina: { routing: "task_reply", avoidedAi: true },
    });
  }

  const isVaguePostListingFollowUp =
    !message ||
    message.length < 5 ||
    /^(help|help me|thanks|thank you|ok|okay|cool|nice|what next|what now)\??$/i.test(message);

  if (justGeneratedListing && isVaguePostListingFollowUp && !isSkyAiGeneralQuestion(message)) {
    const draft = contextualListingContext
      ? ({
          title: contextualListingContext.title,
          description: contextualListingContext.description,
          price: contextualListingContext.price,
          category: contextualListingContext.category,
          listingType: contextualListingContext.listingType,
        } as SkyAiListingFill)
      : null;
    const contextualActions = buildPostListingNextActions(draft, {
      hasPhotos: false,
      vagueFollowUp: true,
    });
    if (uid && conversationId) {
      await safePersist(() =>
        appendSkyAiExchange(conversationId, uid, message, contextualActions, undefined)
      );
    }
    return respondPayload(stream, {
      reply: contextualActions,
      navigateTo: undefined,
      source: "rules",
      conversationId: conversationId || undefined,
      awhina: { routing: "post_listing_tip", avoidedAi: true },
    });
  }

  const isAdviceQuestion = isSkyAiAdviceQuestion(message);
  const shortcut =
    !isAdviceQuestion &&
    !hasListingIntent &&
    !justGeneratedListing &&
    !shouldBypassNavigationShortcut(message)
      ? tryNavigationShortcut(message, pathname)
      : null;
  if (shortcut) {
    const reply = stripBold(shortcut.reply);
    if (uid && conversationId) {
      await safePersist(() =>
        appendSkyAiExchange(conversationId, uid, message, reply, shortcut.navigateTo)
      );
    }
    return respondPayload(stream, {
      reply,
      navigateTo: shortcut.navigateTo,
      source: shortcut.source,
      conversationId: conversationId || undefined,
      awhina: { routing: "navigation_shortcut", avoidedAi: true },
    });
  }

  // ── Free-form capability (structured tools only — no prose action parsing) ──
  if (!uid) {
    return respondPayload(stream, {
      reply: "Sign in to continue with personalised Āwhina help.",
      source: "rules",
      awhina: { routing: "guest_auth_gate", avoidedAi: true },
    }, 401);
  }
  const llm = await runFreeformCapability({
    message,
    pathname,
    history,
    listingContext: contextualListingContext,
    isAdmin: false,
  });

  let listingFill = llm.listingFill
    ? finalizeListingFill(message, contextualListingContext, llm.listingFill)
    : undefined;
  if (listingFill) {
    const validated = validateListingFillFields(listingFill);
    listingFill = validated.ok ? validated.fill : undefined;
  }
  listingFill = await enhanceAiOwnedDescription(
    listingFill,
    contextualListingContext,
    message
  );
  let profileFill = llm.profileFill;
  if (profileFill) {
    const sanitized = sanitizeProfileFillProposal(profileFill);
    profileFill = sanitized.ok ? sanitized.fill : undefined;
  }

  const pageAware = finalizePageAwareResponse(pathname, message, profileContext, {
    reply: llm.reply,
    navigateTo:
      pathname.startsWith("/post/ai") && llm.navigateTo === "/post/ai"
        ? undefined
        : llm.navigateTo,
    profileFill,
  });
  if (pageAware.profileFill) profileFill = pageAware.profileFill;
  const finalReply =
    polishAwhinaReplyStyle(
      stripBold(pageAware.reply) ||
        listingFillConfirmReply(listingFill) ||
        "I didn't catch that — try again, or tell me what you want to sell or find."
    );
  let finalNav = pageAware.navigateTo;
  if (
    finalNav &&
    !shouldAutoNavigate({
      message,
      intent: "free_form",
    })
  ) {
    finalNav = undefined;
  }

  if (uid && conversationId) {
    await safePersist(() =>
      appendSkyAiExchange(conversationId, uid, message, finalReply, finalNav)
    );
  }

  recordAwhinaQuality(
    req,
    message,
    pathname,
    finalReply,
    llm.degraded ? "rules" : "ai",
    listingFill,
    uid
  );

  return respondPayload(
    stream,
    {
      reply: finalReply,
      navigateTo: finalNav,
      listingFill,
      profileFill: profileFill && hasProfileFillContent(profileFill) ? profileFill : undefined,
      source: llm.degraded ? ("rules" as const) : ("ai" as const),
      conversationId: conversationId || undefined,
      awhina: {
        intent: "free_form",
        tool: llm.toolCall?.tool,
        confidence: confidenceLevelToScore(llm.confidence),
        confidenceLevel: llm.confidence,
        routing: "freeform_capability",
        avoidedAi: false,
        usedLocalExecution: false,
        degraded: llm.degraded,
        latencyMs: llm.latencyMs,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
        clarification: llm.clarification,
      },
      ...(llm.degraded && llm.errorCode ? { code: llm.errorCode } : {}),
    },
    llm.degraded && llm.errorCode === "missing_openai_key" ? 503 : 200,
    { progress: progressStatesForRoute("freeform"), chunkReply: true }
  );
  } catch (e: unknown) {
    console.error("sky-ai error:", e);
    const mapped = openaiErrorResponse(e);
    if (mapped.code !== "openai_error" || (e as { status?: number }).status) {
      return NextResponse.json(
        { error: mapped.error, code: mapped.code },
        { status: mapped.status }
      );
    }
    return NextResponse.json(
      {
        error: "Āwhina hit a snag — refresh and try again. Your form changes are still on screen.",
        code: "sky_ai_error",
      },
      { status: 500 }
    );
  }
}
