/**
 * Camera-first vision listing — OpenAI Responses API + Structured Outputs.
 * IMAGE INPUT only (not image generation). Server-side keys only.
 */

import OpenAI from "openai";
import type { SkyAiListingContext } from "./sky-ai-types";
import { openaiErrorResponse } from "./openai-errors";
import { adaptVisionObservationToListing, type VisionAdapterResult } from "./awhina-vision-adapter";
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

export const AWHINA_VISION_MAX_IMAGES = 4;
/** Prefer gpt-4o-mini: vision + structured outputs, low cost/latency for listing ID. */
export const AWHINA_VISION_DEFAULT_MODEL = "gpt-4o-mini";

export type VisionListingRequest = {
  images: string[];
  message?: string;
  listingContext?: SkyAiListingContext | null;
  /** Active draft key for cache scoping */
  draftKey?: string;
  /** Force re-analysis (ignore cache) */
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
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorCode?: string;
  degraded?: boolean;
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
 */
export async function runVisionListing(
  request: VisionListingRequest
): Promise<VisionListingResult> {
  const start = Date.now();

  if (!isAwhinaVisionListingEnabledServer()) {
    return {
      ok: false,
      enabled: false,
      cached: false,
      reply: "Camera vision listing is not enabled yet.",
      latencyMs: Date.now() - start,
      errorCode: "vision_listing_disabled",
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
    };
  }

  const draftKey = request.draftKey || "draft";
  const fp = fingerprintVisionImages(images);
  const cacheKey = visionCacheKey(draftKey, fp);

  if (!request.force) {
    const hit = getVisionCache(cacheKey);
    if (hit) {
      const adapted = message
        ? mergeVisionWithSellerText(hit.adapted, message, request.listingContext)
        : hit.adapted;
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
        model: AWHINA_VISION_DEFAULT_MODEL,
        latencyMs: Date.now() - start,
        promptTokens: hit.promptTokens,
        completionTokens: hit.completionTokens,
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
    };
  }

  const model =
    process.env.OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    AWHINA_VISION_DEFAULT_MODEL;

  const openai = new OpenAI({ apiKey });

  const userText = [
    images.length > 1
      ? `Seller uploaded ${images.length} product photos of ONE listing. Reason across all photos.`
      : "Seller uploaded a product photo for their Sky Drop listing.",
    message
      ? `Seller also said (use for price/location/pickup if present; do NOT invent identity from this alone): ${message}`
      : "No seller text yet — identify from photos only.",
    request.listingContext?.title
      ? `Active draft title (USER outranks vision): ${request.listingContext.title}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await openai.responses.create({
      model,
      temperature: 0.2,
      max_output_tokens: 1200,
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
              detail: "low" as const,
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
      };
    }

    const observation = parseVisionObservation(parsedJson);
    let adapted = adaptVisionObservationToListing(observation, request.listingContext);
    if (message) {
      adapted = mergeVisionWithSellerText(adapted, message, request.listingContext);
    }

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
      latencyMs: Date.now() - start,
      promptTokens,
      completionTokens,
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
    };
  }
}
