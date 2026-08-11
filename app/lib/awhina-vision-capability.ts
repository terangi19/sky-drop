/**
 * Āwhina Vision capability — controlled OpenAI vision inside canonical orchestration.
 *
 * Flow: image(s) → vision model → structured extraction → validate → updateListingDraft proposal → UI
 *
 * MUST NOT invent: exact model (unless visually supported), price, authenticity,
 * working condition, ownership, unseen defects, seller location.
 *
 * Multi-image: reason across photos together → one normalized structured result.
 * Corrections: conversational partial updates only ("digital edition", "controller isn't included").
 */

import OpenAI from "openai";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import { validateListingFillFields } from "./awhina-listing-fill-tools";
import {
  type AwhinaConfidenceLevel,
  normalizeConfidenceLevel,
  confidenceLevelToScore,
  keepConfidentFields,
} from "./awhina-confidence-levels";
import { awhinaPersonalityPromptBlock } from "./awhina-personality";
import { openaiErrorResponse } from "./openai-errors";
import { recordAwhinaObs } from "./awhina-observability";
import { composeListingIdentity } from "./awhina-listing-identity";

export type VisionFieldValue = {
  value: string | string[] | boolean;
  confidence: AwhinaConfidenceLevel;
  visuallySupported?: boolean;
};

export type VisionStructuredExtraction = {
  title?: VisionFieldValue;
  category?: VisionFieldValue;
  listingType?: VisionFieldValue;
  conditionClues?: VisionFieldValue;
  description?: VisionFieldValue;
  keywords?: VisionFieldValue;
  /** Optional visible brand/make only when clearly readable on item/packaging */
  visibleBrand?: VisionFieldValue;
  /** Exact model only when text/logo on item clearly shows it */
  visibleModel?: VisionFieldValue;
  clarifyQuestions?: string[];
  summary?: string;
};

export type VisionCapabilityRequest = {
  images: string[];
  message?: string;
  listingContext?: SkyAiListingContext | null;
  pathname?: string;
  /** Correction-only follow-up with no (or optional) new images */
  correctionOnly?: boolean;
};

export type VisionCapabilityResult = {
  ok: boolean;
  reply: string;
  listingFill?: SkyAiListingFill;
  tool: "updateListingDraft" | "createListing" | "reply";
  confidence: AwhinaConfidenceLevel;
  extraction?: VisionStructuredExtraction;
  degraded?: boolean;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorCode?: string;
  clarification?: boolean;
};

const VISION_SYSTEM = `You are Āwhina's vision capability for Sky Drop (NZ marketplace).

Analyze product photo(s) and return ONE JSON object (no markdown) with this shape:
{
  "title": { "value": string, "confidence": "HIGH"|"MEDIUM"|"LOW", "visuallySupported": boolean },
  "category": { "value": string, "confidence": "HIGH"|"MEDIUM"|"LOW", "visuallySupported": boolean },
  "listingType": { "value": "physical"|"digital"|"vehicle"|"service"|"rental", "confidence": "HIGH"|"MEDIUM"|"LOW", "visuallySupported": boolean },
  "conditionClues": { "value": string, "confidence": "HIGH"|"MEDIUM"|"LOW", "visuallySupported": boolean },
  "description": { "value": string, "confidence": "HIGH"|"MEDIUM"|"LOW", "visuallySupported": boolean },
  "keywords": { "value": string[], "confidence": "HIGH"|"MEDIUM"|"LOW", "visuallySupported": boolean },
  "visibleBrand": { "value": string, "confidence": "HIGH"|"MEDIUM"|"LOW", "visuallySupported": boolean },
  "visibleModel": { "value": string, "confidence": "HIGH"|"MEDIUM"|"LOW", "visuallySupported": boolean },
  "clarifyQuestions": string[],
  "summary": string
}

HARD RULES — never invent:
- Exact model/SKU unless readable on the item/packaging (set visibleModel.visuallySupported=true only then)
- Price / NZD estimates
- Authenticity claims
- Whether it works / powers on
- Ownership / provenance
- Unseen defects (backsides, scratches not visible)
- Seller location

Multi-image: reason across ALL photos together. Produce ONE normalized result.
Do not contradict yourself across photos (e.g. don't say New and Used). Prefer MEDIUM/LOW and clarifyQuestions when photos conflict.

Condition: only visual clues ("box open", "scuffs on corner", "looks unused in packaging") — never claim "fully working".
Category: prefer Tech, Gaming, Home, Fashion, Sports, Cars, Other (physical) when unsure.
listingType: default physical for tangible goods; vehicle only if clearly a car/ute/bike; digital only if user says digital OR screenshot of software/files.

If the user message is a CORRECTION (e.g. "digital edition", "controller isn't included"), apply ONLY those partial updates — do not rewrite unrelated fields.

${awhinaPersonalityPromptBlock()}`;

const MAX_IMAGES = 4;

function isCorrectionMessage(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (m.length > 160 && !/\b(not included|isn't included|is digital|digital edition|without|except|actually|correction)\b/i.test(m)) {
    return false;
  }
  return /\b(digital edition|not included|isn't included|isn'?t included|without (the )?controller|no controller|actually|correction|it'?s (a )?digital|slim|disc( edition)?|bundle|sealed|unopened)\b/i.test(
    m
  );
}

function parseVisionJson(raw: string): VisionStructuredExtraction | null {
  const trimmed = raw.trim();
  const jsonSlice = trimmed.startsWith("{")
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonSlice) return null;
  try {
    const parsed = JSON.parse(jsonSlice) as Record<string, unknown>;
    const pickField = (key: string): VisionFieldValue | undefined => {
      const f = parsed[key];
      if (!f || typeof f !== "object") return undefined;
      const obj = f as Record<string, unknown>;
      if (obj.value === undefined || obj.value === null) return undefined;
      return {
        value: obj.value as string | string[] | boolean,
        confidence: normalizeConfidenceLevel(String(obj.confidence || "LOW")),
        visuallySupported: obj.visuallySupported === true,
      };
    };
    return {
      title: pickField("title"),
      category: pickField("category"),
      listingType: pickField("listingType"),
      conditionClues: pickField("conditionClues"),
      description: pickField("description"),
      keywords: pickField("keywords"),
      visibleBrand: pickField("visibleBrand"),
      visibleModel: pickField("visibleModel"),
      clarifyQuestions: Array.isArray(parsed.clarifyQuestions)
        ? (parsed.clarifyQuestions as unknown[])
            .filter((x): x is string => typeof x === "string")
            .slice(0, 3)
        : undefined,
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Drop fields that violate hallucination rules or are LOW confidence.
 * Exact model only kept when visuallySupported + HIGH/MEDIUM.
 * Never keep price / location / authenticity-like content.
 */
export function sanitizeVisionExtraction(
  extraction: VisionStructuredExtraction,
  opts?: { correctionOnly?: boolean; existingDraft?: SkyAiListingContext | null }
): { fields: Partial<VisionStructuredExtraction>; omitted: string[]; clarify: string[] } {
  const omitted: string[] = [];
  const clarify = [...(extraction.clarifyQuestions || [])];

  // Strip forbidden invented fields if model sneaks them in as description
  const cleaned: VisionStructuredExtraction = { ...extraction };

  if (cleaned.visibleModel) {
    if (!cleaned.visibleModel.visuallySupported || cleaned.visibleModel.confidence === "LOW") {
      omitted.push("visibleModel");
      delete cleaned.visibleModel;
    }
  }

  // Never trust price/location if somehow present as keywords noise — strip from keywords
  if (cleaned.keywords && Array.isArray(cleaned.keywords.value)) {
    const filtered = (cleaned.keywords.value as string[]).filter(
      (k) =>
        !/\$|nzd|price|authentic|genuine|works|working|location|auckland|wellington|owned/i.test(
          k
        )
    );
    cleaned.keywords = { ...cleaned.keywords, value: filtered };
  }

  // Description must not claim working condition / authenticity / price
  if (cleaned.description && typeof cleaned.description.value === "string") {
    let d = cleaned.description.value;
    d = d
      .replace(/\b(fully working|works perfectly|tested and working|100% authentic|genuine authentic)\b/gi, "")
      .replace(/\$\s*\d[\d,]*(?:\.\d{2})?/g, "")
      .replace(/\b(located in|seller in|pickup in)\s+[A-Za-z\s]+/gi, "")
      .trim();
    cleaned.description = { ...cleaned.description, value: d };
  }

  const minLevel: AwhinaConfidenceLevel = opts?.correctionOnly ? "MEDIUM" : "MEDIUM";
  const kept = keepConfidentFields(
    {
      title: cleaned.title,
      category: cleaned.category,
      listingType: cleaned.listingType,
      conditionClues: cleaned.conditionClues,
      description: cleaned.description,
      keywords: cleaned.keywords,
      visibleBrand: cleaned.visibleBrand,
      visibleModel: cleaned.visibleModel,
    } as Record<string, VisionFieldValue>,
    minLevel
  );

  for (const key of [
    "title",
    "category",
    "listingType",
    "conditionClues",
    "description",
    "keywords",
    "visibleBrand",
    "visibleModel",
  ] as const) {
    if (cleaned[key] && !kept[key]) omitted.push(key);
  }

  // Correction-only: if user said something specific, we still may keep MEDIUM+ only those fields the model marked
  if (opts?.correctionOnly && opts.existingDraft) {
    // Prefer partial: if title confidence low, omit so draft title preserved downstream
  }

  if (cleaned.title?.confidence === "LOW" || !kept.title) {
    clarify.push("What should we call this listing?");
  }

  return {
    fields: {
      ...kept,
      clarifyQuestions: clarify.slice(0, 3),
      summary: cleaned.summary,
    },
    omitted,
    clarify: clarify.slice(0, 3),
  };
}

const CONDITION_MAP: Record<string, string> = {
  new: "New",
  sealed: "New",
  unopened: "New",
  "like new": "Used - Like New",
  mint: "Used - Like New",
  good: "Used - Good",
  used: "Used - Good",
  fair: "Used - Fair",
  scuffed: "Used - Fair",
  scuff: "Used - Fair",
  scratch: "Used - Fair",
  wear: "Used - Good",
};

export function visionFieldsToListingFill(
  fields: Partial<VisionStructuredExtraction>,
  existing?: SkyAiListingContext | null,
  correctionOnly?: boolean
): SkyAiListingFill {
  const fill: SkyAiListingFill = {};

  const str = (f?: VisionFieldValue): string | undefined =>
    f && typeof f.value === "string" ? f.value.trim() : undefined;

  const title = str(fields.title);
  const category = str(fields.category);
  const listingType = str(fields.listingType)?.toLowerCase();
  const description = str(fields.description);
  const brand = str(fields.visibleBrand);
  const model = str(fields.visibleModel);
  const clues = str(fields.conditionClues);

  if (!correctionOnly || title) {
    if (title) fill.title = title;
    else if (brand || model) {
      fill.title = composeListingIdentity({ brand, model }) || [brand, model].filter(Boolean).join(" ");
    }
  }

  if (category) fill.category = category;
  if (listingType && ["physical", "digital", "vehicle", "service", "rental"].includes(listingType)) {
    fill.listingType = listingType;
  } else if (!correctionOnly && !existing?.listingType) {
    fill.listingType = "physical";
  }

  if (description) fill.description = description;

  if (clues) {
    const lower = clues.toLowerCase();
    for (const [k, v] of Object.entries(CONDITION_MAP)) {
      if (lower.includes(k)) {
        fill.condition = v;
        break;
      }
    }
    // Keep clue text in extras, not as asserted working condition
    fill.extras = [...(fill.extras || []), `Visual: ${clues}`].slice(0, 12);
  }

  if (fields.keywords && Array.isArray(fields.keywords.value)) {
    const kws = (fields.keywords.value as string[])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 12);
    if (kws.length) fill.extras = [...(fill.extras || []), ...kws.map((k) => `kw:${k}`)].slice(0, 24);
  }

  // NEVER set price or location from vision
  return fill;
}

function buildUserContent(
  message: string,
  images: string[],
  listingContext: SkyAiListingContext | null | undefined,
  correctionOnly: boolean
): string | OpenAI.Chat.ChatCompletionContentPart[] {
  const draftNote = listingContext
    ? `\nActive draft (preserve unless correction overrides): ${JSON.stringify({
        title: listingContext.title,
        category: listingContext.category,
        condition: listingContext.condition,
        listingType: listingContext.listingType,
      })}`
    : "";

  const text =
    (message
      ? correctionOnly
        ? `CORRECTION from seller (partial update only): ${message}`
        : message
      : images.length > 1
        ? "Seller uploaded multiple product photos. Reason across all of them and return one normalized JSON extraction."
        : "Seller uploaded a product photo for their Sky Drop listing. Return structured JSON extraction.") +
    draftNote +
    "\nReturn JSON only.";

  if (images.length === 0) {
    return text;
  }

  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text },
    ...images.slice(0, MAX_IMAGES).map(
      (url): OpenAI.Chat.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: { url, detail: "high" },
      })
    ),
  ];
  return parts;
}

export function visionDegradedReply(hasDraft: boolean): string {
  return hasDraft
    ? "I can't analyse photos right now (vision is temporarily unavailable). Your draft is still here — describe the item in a sentence and I'll update the form, or keep editing manually."
    : "I can't analyse photos right now (vision is temporarily unavailable). Describe what you're selling in a sentence (e.g. \"PS5 disc edition, no controller\") and I'll fill the form, or edit the Sell page manually.";
}

/**
 * Run vision capability. Single OpenAI call (no separate intent classifier).
 */
export async function runVisionCapability(
  request: VisionCapabilityRequest
): Promise<VisionCapabilityResult> {
  const start = Date.now();
  const images = (request.images || []).filter((s) => typeof s === "string" && s.startsWith("data:image/")).slice(0, MAX_IMAGES);
  const message = (request.message || "").trim();
  const correctionOnly =
    request.correctionOnly === true ||
    (Boolean(message) && isCorrectionMessage(message) && (images.length === 0 || Boolean(request.listingContext)));

  if (images.length === 0 && !correctionOnly) {
    return {
      ok: false,
      reply: "Add a product photo, or describe the item in text.",
      tool: "reply",
      confidence: "LOW",
      latencyMs: Date.now() - start,
      clarification: true,
      errorCode: "no_images",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const reply = visionDegradedReply(Boolean(request.listingContext));
    recordAwhinaObs({
      intent: "vision",
      localVsAi: "ai",
      capability: "vision",
      success: false,
      latencyMs: Date.now() - start,
      clarification: false,
      pathname: request.pathname,
      aiFail: true,
      degraded: true,
    });
    return {
      ok: false,
      reply,
      tool: "reply",
      confidence: "LOW",
      degraded: true,
      latencyMs: Date.now() - start,
      errorCode: "missing_openai_key",
    };
  }

  const openai = new OpenAI({ apiKey });
  const model =
    process.env.OPENAI_VISION_MODEL || "gpt-4o";

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VISION_SYSTEM },
        {
          role: "user",
          content: buildUserContent(message, images, request.listingContext, correctionOnly),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "";
    const promptTokens = completion.usage?.prompt_tokens;
    const completionTokens = completion.usage?.completion_tokens;
    const parsed = parseVisionJson(raw);

    if (!parsed) {
      recordAwhinaObs({
        intent: "vision",
        localVsAi: "ai",
        capability: "vision",
        success: false,
        latencyMs: Date.now() - start,
        clarification: true,
        pathname: request.pathname,
        promptTokens,
        completionTokens,
        aiFail: true,
      });
      return {
        ok: false,
        reply:
          "I couldn't read those photos clearly. Tell me what it is (e.g. \"PS5 Slim disc edition\") and I'll fill the form.",
        tool: "reply",
        confidence: "LOW",
        latencyMs: Date.now() - start,
        promptTokens,
        completionTokens,
        clarification: true,
        errorCode: "vision_parse_failed",
      };
    }

    const { fields, clarify } = sanitizeVisionExtraction(parsed, {
      correctionOnly,
      existingDraft: request.listingContext,
    });

    let listingFill = visionFieldsToListingFill(fields, request.listingContext, correctionOnly);

    // Merge with existing draft for partial corrections
    if (correctionOnly && request.listingContext) {
      listingFill = {
        ...Object.fromEntries(
          Object.entries(request.listingContext).filter(([, v]) => v !== undefined && v !== "")
        ),
        ...listingFill,
      } as SkyAiListingFill;
    }

    const validated = validateListingFillFields(listingFill);
    if (!validated.ok) {
      return {
        ok: false,
        reply: clarify[0] || validated.error,
        tool: "reply",
        confidence: "LOW",
        extraction: parsed,
        latencyMs: Date.now() - start,
        promptTokens,
        completionTokens,
        clarification: true,
        errorCode: "vision_validation_failed",
      };
    }

    const fieldConfidences = [
      fields.title?.confidence,
      fields.category?.confidence,
      fields.description?.confidence,
    ]
      .filter(Boolean)
      .map((c) => confidenceLevelToScore(c!));
    const avg =
      fieldConfidences.length > 0
        ? fieldConfidences.reduce((a, b) => a + b, 0) / fieldConfidences.length
        : 0.5;
    const overall =
      avg >= 0.8 ? ("HIGH" as const) : avg >= 0.5 ? ("MEDIUM" as const) : ("LOW" as const);

    const titleBit = validated.fill.title ? `**${validated.fill.title}**` : "your item";
    const clarifyBit =
      clarify.length > 0 ? `\n\nQuick check: ${clarify[0]}` : "";
    const reply = correctionOnly
      ? `Updated the draft from your note — ${titleBit}.${clarifyBit}`
      : images.length > 1
        ? `I looked across your ${images.length} photos and drafted ${titleBit}. Add your price and location, then hit **Publish**.${clarifyBit}`
        : `From the photo, I drafted ${titleBit}. Add your price and location, then hit **Publish**.${clarifyBit}`;

    recordAwhinaObs({
      intent: "vision",
      localVsAi: "ai",
      capability: "vision",
      tool: correctionOnly ? "updateListingDraft" : "updateListingDraft",
      success: true,
      latencyMs: Date.now() - start,
      clarification: clarify.length > 0,
      pathname: request.pathname,
      promptTokens,
      completionTokens,
      imageCount: images.length,
    });

    return {
      ok: true,
      reply,
      listingFill: validated.fill,
      tool: correctionOnly || request.listingContext ? "updateListingDraft" : "createListing",
      confidence: overall,
      extraction: parsed,
      latencyMs: Date.now() - start,
      promptTokens,
      completionTokens,
      clarification: clarify.length > 0,
    };
  } catch (err) {
    const mapped = openaiErrorResponse(err);
    recordAwhinaObs({
      intent: "vision",
      localVsAi: "ai",
      capability: "vision",
      success: false,
      latencyMs: Date.now() - start,
      clarification: false,
      pathname: request.pathname,
      aiFail: true,
      degraded: true,
    });
    return {
      ok: false,
      reply: visionDegradedReply(Boolean(request.listingContext)),
      tool: "reply",
      confidence: "LOW",
      degraded: true,
      latencyMs: Date.now() - start,
      errorCode: mapped.code,
    };
  }
}

export { isCorrectionMessage };
