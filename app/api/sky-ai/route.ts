import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
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
import { extractSkyAiReply, type SkyAiListingFill } from "../../lib/sky-ai-listing-fill";
import type { SkyAiHistoryItem, SkyAiListingContext } from "../../lib/sky-ai-types";
import {
  isSkyAiGeneralQuestion,
  skyAiCapabilitiesReply,
} from "../../lib/sky-ai-prompts";
import { openaiErrorResponse } from "../../lib/openai-errors";

export const runtime = "nodejs";

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
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
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
  const max = uid ? 200 : 15;
  const { allowed } = await rateLimit(limitKey, max, 15 * 60_000);
  return { allowed, uid, email };
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
  images: string[]
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
      content: buildSkyAiSystemPrompt(pathname, listingContext, {
        hasImages: images.length > 0,
      }),
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

export async function POST(req: NextRequest) {
  try {
    const { allowed, uid, email } = await checkRateLimit(req);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

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

    const hasListingIntent = pathname.startsWith("/post/ai") && (
      // Structured field labels
      /(?:^|\n)(title|price|description|location|condition|category|make|model|year|odometer|colour|color|transmission|fuel|mileage|km|kms)\s*:/i.test(message) ||
      // Listing type keywords
      /(?:rental|vehicle|service|digital|item|physical)\s+listing/i.test(message) ||
      // Multiple field-like lines
      (message.match(/(?:^|\n)\s*\w+\s*:/g) || []).length >= 2 ||
      // Vehicle pattern: year + make/model + price
      /\d{4}\s+[A-Za-z]+\s+[A-Za-z0-9]+.*\$[\d,]+/i.test(message) ||
      // Year at start (vehicle shorthand like "2015 Mazda Axela blue")
      /^\d{4}\s+[A-Za-z]/.test(message) ||
      // Selling intent keywords
      /\b(i('m| am| want to)?\s*(sell|selling|list|listing|post|create|make|put up|advertise)|for sale|selling my|i have a .* for sale|want to sell)\b/i.test(message) ||
      // Item descriptions with price
      /\$[\d,]+/.test(message) ||
      // Vehicle brand keywords on sell page
      /\b(toyota|honda|mazda|ford|holden|nissan|subaru|mitsubishi|hyundai|kia|bmw|mercedes|audi|volkswagen|vw|jeep|chevrolet|dodge|tesla|lexus|suzuki|isuzu|hilux|corolla|camry|rav4|cx-5|axela|swift|ranger|commodore)\b/i.test(message) ||
      // Service/rental/digital signals on sell page
      /\b(lawn|mow|clean|handyman|tutor|teach|photograph|design|seo|website|graphic|weekly rent|per week|bond|deposit|apartment|flat|room|house for rent|digital download|template|ebook|preset|notion|canva)\b/i.test(message) ||
      // Physical item selling
      /\b(ps5|playstation|xbox|iphone|samsung|laptop|macbook|tv|television|couch|sofa|fridge|washing machine|bike|bicycle|kayak|surfboard|guitar|camera)\b/i.test(message) ||
      // Condition + item pattern
      /\b(new|used|good condition|excellent condition|great condition|like new)\b.*\b(sell|selling|for sale|\$\d)/i.test(message) ||
      // Located in + price
      /\b(located in|based in|pickup from|auckland|wellington|christchurch|hamilton|tauranga|dunedin|palmerston|napier|rotorua|nelson|invercargill|waikato|otago)\b.*\$[\d,]+/i.test(message) ||
      // Odometer / km reading
      /\b\d{2,3}[\s,]?\d{3}\s*km\b/i.test(message)
    );
    const isAdviceQuestion = /\b(should i|which (sale type|one|option)|what.s (best|better|faster|quickest)|how much (should|is)|is it (safe|worth)|recommend|suggestion)\b/i.test(message);
    const shortcut = !isAdviceQuestion && !hasListingIntent ? tryNavigationShortcut(message, pathname) : null;
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
    const messages = buildMessages(message, pathname, history, listingContext, images);

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
            const mergedFill = mergeFillWithContext(listingContext, listingFill);
            const finalNav = pathname.startsWith("/post/ai") && navigateTo === "/post/ai" ? undefined : navigateTo;
            if (listingFill || mergedFill) {
              console.log(`[Awhina] Listing fill: type=${listingFill?.listingType || mergedFill?.listingType}, title=${listingFill?.title || mergedFill?.title}, nav=${finalNav || "none"}`);
            }
            if (uid && conversationId) {
              await safePersist(() =>
                appendSkyAiExchange(conversationId, uid, message, text, finalNav)
              );
            }
            controller.enqueue(
              encoder.encode(
                sseLine({
                  type: "done",
                  reply: text,
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
    const mergedFill = mergeFillWithContext(listingContext, listingFill);
    const finalNav = pathname.startsWith("/post/ai") && navigateTo === "/post/ai" ? undefined : navigateTo;
    if (listingFill || mergedFill) {
      console.log(`[Awhina] Listing fill: type=${listingFill?.listingType || mergedFill?.listingType}, title=${listingFill?.title || mergedFill?.title}, nav=${finalNav || "none"}`);
    }

    if (uid && conversationId) {
      await safePersist(() =>
        appendSkyAiExchange(conversationId, uid, message, text, finalNav)
      );
    }

    return NextResponse.json({
      reply: text || "I couldn't generate a reply. Try again.",
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
    const msg = e instanceof Error ? e.message : "Sky AI unavailable";
    return NextResponse.json({ error: msg, code: "sky_ai_error" }, { status: 500 });
  }
}
