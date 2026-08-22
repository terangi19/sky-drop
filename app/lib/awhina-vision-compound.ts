/**
 * Photo + text compound: vision identity + seller text price/location/pickup.
 * Reuses existing processListingFillMessage — does not replace extraction.
 * Architecture preserves future photos + voice → complete listing.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import {
  parseListingPriceFromMessage,
  processListingFillMessage,
  validatePriceString,
} from "./awhina-listing-fill-tools";
import type { VisionAdapterResult } from "./awhina-vision-adapter";
import { composeVisionAwareDescription } from "./awhina-vision-adapter";
import { getListingReadinessState } from "./awhina-listing-readiness";
import { fuseVisionAndSellerText } from "./awhina-multimodal-fusion";

export type CompoundMergeResult = VisionAdapterResult & {
  textApplied: boolean;
  readiness: ReturnType<typeof getListingReadinessState>;
};

function titleCasePlace(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 80);
}

/**
 * Companion-note facts for camera-first flow:
 * "yep 500 pickup auckland", "want 850 pickup henderson"
 * Supplements — does not replace — processListingFillMessage.
 */
export function extractCompanionListingFacts(
  message: string
): Partial<SkyAiListingFill> {
  const trimmed = message.trim();
  if (!trimmed) return {};
  const out: Partial<SkyAiListingFill> = {};

  let price = parseListingPriceFromMessage(trimmed);
  if (!price || price === "malformed") {
    const soft = trimmed.match(
      /\b(?:yep|yes|yeah|yup|want|wants|asking|take|for)\s+\$?\s*([\d,]{2,8}(?:\.\d{1,2})?)\s*(k|K)?\b/i
    );
    if (soft) {
      let n = Number(soft[1].replace(/,/g, ""));
      if (soft[2]) n *= 1000;
      const check = validatePriceString(String(Math.round(n)));
      if (check.ok) price = check.price;
    }
  }
  if (!price || price === "malformed") {
    const beforePickup = trimmed.match(
      /\b\$?\s*([\d,]{2,8}(?:\.\d{1,2})?)\s*(k|K)?\s+(?:pickup|pick\s*up)\b/i
    );
    if (beforePickup) {
      let n = Number(beforePickup[1].replace(/,/g, ""));
      if (beforePickup[2]) n *= 1000;
      const check = validatePriceString(String(Math.round(n)));
      if (check.ok) price = check.price;
    }
  }
  if (price && price !== "malformed") out.price = price;

  const pickupLoc = trimmed.match(
    /\b(?:pickup|pick\s*up)\s+(?:in\s+|at\s+)?([A-Za-z][A-Za-z\s'-]{1,40})\b/i
  );
  if (pickupLoc?.[1] && !/^(only|available|ok|please|tomorrow|today)$/i.test(pickupLoc[1].trim())) {
    out.location = titleCasePlace(pickupLoc[1]);
    out.pickupAvailable = true;
  } else {
    const city = trimmed.match(
      /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston\s+north|rotorua|queenstown|nelson|whangarei|henderson|manukau|albany|takapuna|newmarket|ponsonby|parnell|remuera|howick|botany|papakura|waitakere)\b/i
    );
    if (city?.[1]) {
      out.location = titleCasePlace(city[1]);
    }
  }

  if (/\b(pick\s*up|pickup)\b/i.test(trimmed) && out.pickupAvailable === undefined) {
    out.pickupAvailable = true;
  }

  return out;
}

/**
 * Merge seller text onto vision-adapted fill via existing listing-fill tools.
 * USER text facts (price, location, pickup) outrank IMAGE.
 */
export function mergeVisionWithSellerText(
  visionAdapted: VisionAdapterResult,
  sellerMessage: string,
  listingContext?: SkyAiListingContext | null
): CompoundMergeResult {
  const msg = sellerMessage.trim();
  if (!msg) {
    return {
      ...visionAdapted,
      textApplied: false,
      readiness: getListingReadinessState(visionAdapted.listingFill),
    };
  }

  const baseContext: SkyAiListingContext = {
    ...(listingContext || {}),
    ...visionAdapted.listingFill,
  };

  const textResult = processListingFillMessage(msg, {
    pathname: "/post/ai",
    listingContext: baseContext,
    sessionKey: "vision-compound:sell",
  });

  const companion = extractCompanionListingFacts(msg);

  let listingFill: SkyAiListingFill = { ...visionAdapted.listingFill };
  const textFill =
    textResult.handled && textResult.listingFill ? textResult.listingFill : undefined;
  if (textFill) {
    listingFill = {
      ...listingFill,
      ...textFill,
    };
  }
  // Companion USER facts win last (price/location/pickup from short notes)
  listingFill = { ...listingFill, ...companion };

  // Structured fusion: domain shorthand + identity completeness + safe reply
  const fused = fuseVisionAndSellerText({
    listingFill,
    displayIdentity: visionAdapted.displayIdentity,
    sellerMessage: msg,
    onSellPage: true,
  });
  listingFill = fused.listingFill;

  const userDesc = textFill?.description?.trim();
  if (!userDesc || userDesc.length < 20) {
    // Only compose buyer description once identity is complete enough
    if (fused.identity.isComplete) {
      const composed = composeVisionAwareDescription({
        sellerText: msg,
        visualDescription: visionAdapted.listingFill.description,
      });
      if (composed) {
        listingFill.extras = [...(listingFill.extras || []), `note:${composed.slice(0, 400)}`];
        delete listingFill.description;
      }
    } else {
      delete listingFill.description;
    }
  }

  const missingPrompts: string[] = [];
  if (!listingFill.price) missingPrompts.push("price");
  if (!listingFill.location) missingPrompts.push("location");
  if (!fused.identity.isComplete) missingPrompts.push("identity");

  const readiness = getListingReadinessState(listingFill);
  const foundReply = fused.assistantMessage;

  const textApplied =
    Boolean(textFill) ||
    Object.keys(companion).length > 0 ||
    Object.keys(fused.userFacts).length > 0;

  return {
    ...visionAdapted,
    listingFill,
    displayIdentity: fused.identity.isComplete
      ? fused.identity.displayIdentity
      : fused.identity.knownSummary.replace(/^an?\s+/i, ""),
    needsIdentityConfirm: !fused.identity.isComplete,
    missingPrompts,
    foundReply,
    textApplied,
    readiness,
  };
}

/** Future: photos + voice transcript → same compound path. */
export function mergeVisionWithVoiceTranscript(
  visionAdapted: VisionAdapterResult,
  transcript: string,
  listingContext?: SkyAiListingContext | null
): CompoundMergeResult {
  return mergeVisionWithSellerText(visionAdapted, transcript, listingContext);
}
