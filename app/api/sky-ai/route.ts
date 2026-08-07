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
import { processCanonicalAwhina } from "../../lib/awhina-canonical";
import { awhinaPersonalityPromptBlock } from "../../lib/awhina-personality";
import { recordAwhinaObs } from "../../lib/awhina-observability";

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
        `\n\n${awhinaPersonalityPromptBlock()}` +
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
        // Trim to last useful turns for latency/tokens (keep more on sell page for draft edits)
        const keep = pathname.startsWith("/post/ai") ? 12 : 8;
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
        .slice(-8)
        .map((h: SkyAiHistoryItem) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content).slice(0, 2000),
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
  const effectiveJustGeneratedListing = justGeneratedListing && !isNewTaskSwitch;

  // ── Canonical Āwhina path (local + search memory + structured tools) ──
  // Skip when images present or sell-page listing fill needs OpenAI.
  const skipCanonical =
    images.length > 0 ||
    (pathname.startsWith("/post/ai") && hasListingIntent) ||
    (pathname === "/profile" && message.length > 0 && !isSkyAiGeneralQuestion(message) && !/^(messages|home|sell|profile|back|go back)$/i.test(message.trim()));

  if (!skipCanonical && message) {
    const canonical = processCanonicalAwhina(message, {
      pathname,
      uid,
      conversationId: conversationId || undefined,
      history,
      source: body.source === "voice" ? "voice" : "text",
      voiceConfidence:
        body.voiceConfidence === "medium" || body.voiceConfidence === "low"
          ? body.voiceConfidence
          : body.voiceConfidence === "high"
            ? "high"
            : undefined,
    });

    if (canonical.handled && canonical.reply) {
      const reply = stripBold(canonical.reply);
      recordAwhinaQuality(req, message, pathname, reply, "rules", undefined, uid);
      if (uid && conversationId) {
        await safePersist(() =>
          appendSkyAiExchange(conversationId, uid, message, reply, canonical.navigateTo)
        );
      }
      const payload = {
        reply,
        navigateTo: canonical.navigateTo,
        source: canonical.source === "local" ? ("rules" as const) : ("rules" as const),
        conversationId: conversationId || undefined,
        awhina: {
          intent: canonical.intent,
          tool: canonical.tool,
          confidence: canonical.confidence,
          usedLocalExecution: canonical.usedLocalExecution,
          avoidedAi: canonical.avoidedAi,
          routing: "canonical",
        },
      };
      if (stream) {
        return new Response(
          sseLine({ type: "delta", text: reply }) +
            sseLine({ type: "done", ...payload }),
          { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
        );
      }
      return NextResponse.json(payload);
    }
  }

  // Remaining deterministic task replies (visibility, price, cancel, buy trouble)
  // Find / capabilities / arrange purchase handled by canonical above.
  const taskReply = trySkyAiTaskReply(message, pathname, taskContext);
  if (taskReply) {
    const reply = stripBold(taskReply.text);
    recordAwhinaQuality(req, message, pathname, reply, taskReply.source, undefined, uid);
    recordAwhinaObs({
      intent: "task_reply",
      localVsAi: "rules",
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
    if (stream) {
      return new Response(
        sseLine({ type: "delta", text: reply }) +
          sseLine({
            type: "done",
            reply,
            navigateTo: taskReply.navigateTo,
            source: taskReply.source,
            conversationId: conversationId || undefined,
          }),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
      );
    }
    return NextResponse.json({
      reply,
      navigateTo: taskReply.navigateTo,
      source: taskReply.source,
      conversationId: conversationId || undefined,
    });
  }

  const isVaguePostListingFollowUp =
    !message ||
    message.length < 5 ||
    /^(help|help me|thanks|thank you|ok|okay|cool|nice|what next|what now)\??$/i.test(message);

  // If a listing was just generated and the user sends a vague follow-up, show contextual actions
  if (justGeneratedListing && isVaguePostListingFollowUp && !isSkyAiGeneralQuestion(message)) {
    const contextualActions = `Here's what you can do next with your listing:\n\n• **Publish your listing** — Add photos above, then hit Publish below to go live\n• **Edit the title or description** — I can refine it for you\n• **Improve the description** — Add more details to attract buyers\n• **Generate keywords** — Add search terms for better visibility\n• **Price check** — Compare with similar listings\n• **Create Facebook Marketplace listing** — I can format it for FB\n• **Create Trade Me listing** — I can format it for Trade Me\n\nWhat would you like to do?`;
    if (uid && conversationId) {
      await safePersist(() =>
        appendSkyAiExchange(conversationId, uid, message, contextualActions, undefined)
      );
    }
    if (stream) {
      return new Response(
        sseLine({ type: "delta", text: contextualActions }) +
          sseLine({
            type: "done",
            reply: contextualActions,
            navigateTo: undefined,
            source: "rules",
            conversationId: conversationId || undefined,
          }),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
      );
    }
    return NextResponse.json({
      reply: contextualActions,
      navigateTo: undefined,
      source: "rules",
      conversationId: conversationId || undefined,
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
      if (stream) {
        return new Response(
          sseLine({ type: "delta", text: reply }) +
            sseLine({
              type: "done",
              reply,
              navigateTo: shortcut.navigateTo,
              source: shortcut.source,
              conversationId: conversationId || undefined,
            }),
          { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
        );
      }
      return NextResponse.json({
        reply,
        navigateTo: shortcut.navigateTo,
        source: shortcut.source,
        conversationId: conversationId || undefined,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      const ruleFallback = isSkyAiGeneralQuestion(message)
        ? { text: skyAiCapabilitiesReply() }
        : getGuideReply(message, pathname);
      const reply = stripBold(ruleFallback.text);
      const navigateTo = ruleFallback.navigateTo;
      if (uid && conversationId) {
        await safePersist(() =>
          appendSkyAiExchange(conversationId, uid, message, reply, navigateTo)
        );
      }
      const payload = {
        type: "done" as const,
        reply,
        navigateTo,
        source: "rules",
        conversationId: conversationId || undefined,
      };
      if (stream) {
        return new Response(sseLine({ type: "delta", text: reply }) + sseLine(payload), {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }
      return NextResponse.json(
        { ...payload, code: "missing_openai_key" },
        { status: 503 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const messages = buildMessages(
      message,
      pathname,
      history,
      contextualListingContext,
      images,
      effectiveJustGeneratedListing,
      lastAssistantMessage
    );

    if (stream) {
      let completion;
      try {
        completion = await openai.chat.completions.create({
          model,
          temperature: 0.7,
          max_tokens: 2000,
          stream: true,
          messages,
        });
      } catch (openaiErr: unknown) {
        const mapped = openaiErrorResponse(openaiErr);
        return NextResponse.json(
          { error: mapped.error, code: mapped.code },
          { status: mapped.status }
        );
      }

      const encoder = new TextEncoder();
      let full = "";

      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of completion) {
              const delta = chunk.choices[0]?.delta?.content || "";
              if (!delta) continue;
              full += delta;
              controller.enqueue(
                encoder.encode(sseLine({ type: "delta", text: delta }))
              );
            }
            const { text, navigateTo, listingFill } = extractSkyAiReply(full);
            const mergedFill = finalizeListingFill(message, listingContext, listingFill);
            const finalNav = pathname.startsWith("/post/ai") && navigateTo === "/post/ai" ? undefined : navigateTo;
            if (listingFill || mergedFill) {
              console.log(`[Awhina] Listing fill: type=${listingFill?.listingType || mergedFill?.listingType}, title=${listingFill?.title || mergedFill?.title}, nav=${finalNav || "none"}`);
            }
            if (uid && conversationId) {
              await safePersist(() =>
                appendSkyAiExchange(conversationId, uid, message, full, finalNav)
              );
            }
            const displayReply = text || listingFillConfirmReply(mergedFill) || full.trim() || "Add photos, then hit **Publish**.";
            recordAwhinaQuality(req, message, pathname, displayReply, "ai", mergedFill, uid);
            controller.enqueue(
              encoder.encode(
                sseLine({
                  type: "done",
                  reply: displayReply,
                  navigateTo: finalNav,
                  listingFill: mergedFill,
                  source: "ai",
                  conversationId: conversationId || undefined,
                })
              )
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Stream failed";
            controller.enqueue(encoder.encode(sseLine({ type: "error", error: msg })));
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        temperature: 0.7,
        max_tokens: 2000,
        messages,
      });
    } catch (openaiErr: unknown) {
      const mapped = openaiErrorResponse(openaiErr);
      return NextResponse.json(
        { error: mapped.error, code: mapped.code },
        { status: mapped.status }
      );
    }

    const raw = completion.choices[0]?.message?.content || "";
    const { text, navigateTo, listingFill } = extractSkyAiReply(raw);
    const mergedFill = finalizeListingFill(message, listingContext, listingFill);
    const finalNav = pathname.startsWith("/post/ai") && navigateTo === "/post/ai" ? undefined : navigateTo;
    if (listingFill || mergedFill) {
      console.log(`[Awhina] Listing fill: type=${listingFill?.listingType || mergedFill?.listingType}, title=${listingFill?.title || mergedFill?.title}, nav=${finalNav || "none"}`);
    }

    if (uid && conversationId) {
      await safePersist(() =>
        appendSkyAiExchange(conversationId, uid, message, raw, finalNav)
      );
    }

    const finalReply =
      text ||
      listingFillConfirmReply(mergedFill) ||
      "I didn't catch that — try again, or tell me what you want to sell or find.";
    recordAwhinaQuality(req, message, pathname, finalReply, "ai", mergedFill, uid);

    return NextResponse.json({
      reply: finalReply,
      navigateTo: finalNav,
      listingFill: mergedFill,
      source: "ai",
      conversationId: conversationId || undefined,
    });
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
