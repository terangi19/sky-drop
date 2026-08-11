/**
 * Camera-first vision listing — OpenAI Responses API + Structured Outputs.
 * IMAGE INPUT only (not image generation). Server-side keys only.
 *
 * Pipeline (ONE multimodal AI call → deterministic local compose):
 *   IMAGE → structured perception → knowledge enrich → adapter → public copy gate
 */

import OpenAI from "openai";
import type { SkyAiListingContext } from "./sky-ai-types";
import { openaiErrorResponse } from "./openai-errors";
import {
  adaptVisionObservationToListing,
  type VisionAdapterResult,
} from "./awhina-vision-adapter";
import {
  fingerprintVisionImages,
  getVisionCache,
  setVisionCache,
  visionCacheKey,
} from "./awhina-vision-cache";
import {
  VISION_LISTING_OBSERVATION_SCHEMA,
  VISION_LISTING_SYSTEM,
  parseVisionObservation,
  type VisionListingObservation,
} from "./awhina-vision-observation";
import { isAwhinaVisionListingEnabledServer } from "./awhina-vision-listing-flags";
import { mergeVisionWithSellerText } from "./awhina-vision-compound";
import { enrichObservationWithKnowledge } from "./awhina-vision-knowledge";
import {
  logAwhinaTiming,
  markAwhinaTiming,
  startAwhinaTiming,
} from "./awhina-timing";

export const AWHINA_VISION_MAX_IMAGES = 4;
/**
 * Strong multimodal default for difficult recognition (logos, serials, small text).
 * Override with OPENAI_VISION_MODEL. Do not fall back to OPENAI_MODEL (often mini).
 */
export const AWHINA_VISION_DEFAULT_MODEL = "gpt-4o";
/** Image detail — high preserves small text/serials; low destroyed card OCR. */
export const AWHINA_VISION_IMAGE_DETAIL: "low" | "high" | "auto" = "high";

export type VisionListingRequest = {
  images: string[];
  message?: string;
  listingContext?: SkyAiListingContext | null;
  draftKey?: string;
  force?: boolean;
  pathname?: string;
};

export type VisionListingResult = {
  ok: boolean;
  enabled: boolean;
  cached: boolean;
  observation?: VisionListingObservation;
  adapted?: VisionAdapterResult;
  listingFill?: VisionAdapterResult["listingFill"];
  reply: string;
  displayIdentity?: string;
  needsIdentityConfirm?: boolean;
  missingPrompts?: string[];
  model?: string;
  domain?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorCode?: string;
  degraded?: boolean;
  timing?: Record<string, number>;
  /** AI calls used for this photo path (0 cache / 1 live) */
  aiCalls?: number;
};

function stripDataUrls(images: string[]): string[] {
  return images
    .filter((s) => typeof s === "string" && s.startsWith("data:image/"))
    .slice(0, AWHINA_VISION_MAX_IMAGES);
}

function extractOutputText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const chunks: string[] = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

/**
 * Run camera-first vision recognition → adapter → existing listing fill schema.
 * ONE multimodal AI call; title/desc/category compose is local/deterministic.
 */
export async function runVisionListing(
  request: VisionListingRequest
): Promise<VisionListingResult> {
  const timing = startAwhinaTiming("vision");
  timing.mark("photoSelectedAt");
  const start = Date.now();
  let aiCalls = 0;

  if (!isAwhinaVisionListingEnabledServer()) {
    return {
      ok: false,
      enabled: false,
      cached: false,
      reply: "Camera vision listing is not enabled yet.",
      latencyMs: Date.now() - start,
      errorCode: "vision_listing_disabled",
      aiCalls: 0,
      timing: timing.snapshot(),
    };
  }

  const images = stripDataUrls(request.images || []);
  const message = (request.message || "").trim();

  if (images.length === 0) {
    return {
      ok: false,
      enabled: true,
      cached: false,
      reply: "Add a product photo to continue.",
      latencyMs: Date.now() - start,
      errorCode: "no_images",
      aiCalls: 0,
      timing: timing.snapshot(),
    };
  }

  const draftKey = request.draftKey || "draft";
  const fp = fingerprintVisionImages(images);
  const cacheKey = visionCacheKey(draftKey, fp);

  if (!request.force) {
    const hit = getVisionCache(cacheKey);
    if (hit) {
      timing.mark("cacheHitAt");
      // Re-adapt against CURRENT draft so continuity/public-gate stay fresh
      let adapted = adaptVisionObservationToListing(
        hit.observation,
        request.listingContext
      );
      if (message) {
        adapted = mergeVisionWithSellerText(
          adapted,
          message,
          request.listingContext
        );
      }
      timing.mark("draftCompletedAt");
      logAwhinaTiming("vision_cache_hit", timing.snapshot(), {
        aiCalls: 0,
        fingerprint: fp.slice(0, 24),
      });
      return {
        ok: true,
        enabled: true,
        cached: true,
        observation: hit.observation,
        adapted,
        listingFill: adapted.listingFill,
        reply: adapted.foundReply,
        displayIdentity: adapted.displayIdentity,
        needsIdentityConfirm: adapted.needsIdentityConfirm,
        missingPrompts: adapted.missingPrompts,
        model: hit.model || AWHINA_VISION_DEFAULT_MODEL,
        latencyMs: Date.now() - start,
        promptTokens: hit.promptTokens,
        completionTokens: hit.completionTokens,
        aiCalls: 0,
        timing: timing.snapshot(),
      };
    }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      enabled: true,
      cached: false,
      reply:
        "I can't check photos right now. Describe the item in a sentence and I'll fill the form.",
      latencyMs: Date.now() - start,
      errorCode: "missing_openai_key",
      degraded: true,
      aiCalls: 0,
      timing: timing.snapshot(),
    };
  }

  // Prefer dedicated vision model — do not silently fall back to chat mini
  const model =
    process.env.OPENAI_VISION_MODEL?.trim() || AWHINA_VISION_DEFAULT_MODEL;

  const openai = new OpenAI({ apiKey });

  // CRITICAL: never inject prior draft title into the vision prompt —
  // that biases OCR toward stale brands (Panini leak). USER locks apply in adapter.
  const userText = [
    images.length > 1
      ? `Seller uploaded ${images.length} product photos of ONE listing. Fuse evidence across photos of the SAME object. Read logos, printed names, numbers, labels, serials, and design details carefully.`
      : "Seller uploaded a product photo for their Sky Drop listing. Read logos, printed names, numbers, labels, serials, and design details carefully.",
    message
      ? `Seller also said (use for price/location/pickup if present; do NOT invent identity from this alone): ${message}`
      : "No seller text yet — identify from photos only. Leave unreadable fields empty.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    timing.mark("openaiRequestAt");
    aiCalls = 1;
    const response = await openai.responses.create({
      model,
      temperature: 0.2,
      max_output_tokens: 1600,
      store: false,
      instructions: VISION_LISTING_SYSTEM,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: userText },
            ...images.map((url) => ({
              type: "input_image" as const,
              image_url: url,
              detail: AWHINA_VISION_IMAGE_DETAIL,
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "awhina_vision_listing_observation",
          strict: true,
          schema: VISION_LISTING_OBSERVATION_SCHEMA as unknown as Record<
            string,
            unknown
          >,
        },
      },
    });
    timing.mark("openaiResponseAt");
    markAwhinaTiming("openaiResponseAt");

    const rawText = extractOutputText(response);
    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      parsedJson = null;
    }

    if (!parsedJson) {
      return {
        ok: false,
        enabled: true,
        cached: false,
        reply:
          "I couldn't read those photos clearly. Tell me what it is and I'll fill the form.",
        latencyMs: Date.now() - start,
        errorCode: "vision_parse_failed",
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
        aiCalls,
        timing: timing.snapshot(),
      };
    }

    const rawObservation = parseVisionObservation(parsedJson);
    timing.mark("perceptionParsedAt");
    const { observation, knowledge, domain } =
      enrichObservationWithKnowledge(rawObservation);
    let adapted = adaptVisionObservationToListing(
      observation,
      request.listingContext
    );
    if (
      knowledge.matched &&
      knowledge.confidence !== "LOW" &&
      knowledge.clarificationChoices.length &&
      adapted.needsIdentityConfirm
    ) {
      adapted = {
        ...adapted,
        foundReply: `${adapted.foundReply} (${knowledge.clarificationChoices[0]})`,
      };
    }
    if (message) {
      adapted = mergeVisionWithSellerText(
        adapted,
        message,
        request.listingContext
      );
    }
    timing.mark("draftCompletedAt");

    const promptTokens = response.usage?.input_tokens;
    const completionTokens = response.usage?.output_tokens;

    setVisionCache(cacheKey, {
      observation,
      adapted,
      imageFingerprint: fp,
      draftKey,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - start,
      model,
    });

    logAwhinaTiming("vision_live", timing.snapshot(), {
      aiCalls,
      model,
      domain,
      openaiMs: timing.elapsed("openaiRequestAt", "openaiResponseAt"),
      totalMs: Date.now() - start,
    });

    return {
      ok: true,
      enabled: true,
      cached: false,
      observation,
      adapted,
      listingFill: adapted.listingFill,
      reply: adapted.foundReply,
      displayIdentity: adapted.displayIdentity,
      needsIdentityConfirm: adapted.needsIdentityConfirm,
      missingPrompts: adapted.missingPrompts,
      model,
      domain,
      latencyMs: Date.now() - start,
      promptTokens,
      completionTokens,
      aiCalls,
      timing: timing.snapshot(),
    };
  } catch (err) {
    const mapped = openaiErrorResponse(err);
    return {
      ok: false,
      enabled: true,
      cached: false,
      reply:
        "I can't analyse photos right now. Describe what you're selling and I'll fill the form.",
      latencyMs: Date.now() - start,
      errorCode: mapped.code,
      degraded: true,
      aiCalls,
      timing: timing.snapshot(),
    };
  }
}
