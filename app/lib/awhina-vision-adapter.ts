/**
 * Vision observation → existing StructuredListingFacts → SkyAiListingFill.
 * INPUT ADAPTER only. USER provenance always outranks IMAGE.
 * NEW PHOTO = independent perception first, then object continuity, then merge.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import { composeListingIdentity } from "./awhina-listing-identity";
import {
  emptyListingFacts,
  factsToListingFill,
  maybeLockEntity,
  mergeListingFacts,
  setFact,
  type StructuredListingFacts,
} from "./awhina-listing-facts";
import {
  mapVisibleConditionToListing,
  mayPopulateFromVision,
  type VisionListingObservation,
  type VisionObservedField,
} from "./awhina-vision-observation";
import { validateListingFillFields } from "./awhina-listing-fill-tools";
import {
  assessIdentityCompleteness,
  isMalformedItemIdentity,
} from "./awhina-identity-composition";
import { resolveFactDomain } from "./awhina-domain-facts";
import {
  assessObjectContinuity,
  type ObjectContinuityVerdict,
} from "./awhina-object-continuity";
import {
  assessTitleQuality,
  composeTradingCardTitle,
  extractTradingCardFactsFromExtras,
  gatePublicListingCopy,
  isSealedTradingCardProductFormat,
} from "./awhina-public-copy-gate";
import {
  isUserLockedProvenance,
  type ListingFieldProvenanceMap,
} from "./listing-draft-confirmed";
import { applyAwhinaDomainKnowledge } from "./awhina-domain-knowledge";

export type VisionAdapterResult = {
  facts: StructuredListingFacts;
  listingFill: SkyAiListingFill;
  /** Fields held back for confirmation (MEDIUM) */
  suggestions: Array<{ field: string; value: string; confidence: string }>;
  /** Fields blocked (LOW / inference) */
  omitted: string[];
  displayIdentity: string;
  needsIdentityConfirm: boolean;
  missingPrompts: string[];
  foundReply: string;
  /** Object continuity vs prior draft */
  continuity?: ObjectContinuityVerdict;
  /** When NEW_OBJECT — client should wipe item-scoped prior draft */
  replaceDraft?: boolean;
};

function trySet(
  facts: StructuredListingFacts,
  field: Parameters<typeof setFact>[1],
  obs: VisionObservedField,
  omitted: string[],
  suggestions: VisionAdapterResult["suggestions"],
  opts?: { allowMediumPopulate?: boolean; forceHighOnly?: boolean }
): void {
  if (!obs.value.trim()) return;
  if (!mayPopulateFromVision(obs, { allowMedium: opts?.allowMediumPopulate })) {
    if (obs.value && obs.confidence === "MEDIUM" && obs.evidence !== "INFERENCE") {
      suggestions.push({
        field,
        value: obs.value,
        confidence: obs.confidence,
      });
    } else if (obs.value) {
      omitted.push(field);
    }
    return;
  }
  if (opts?.forceHighOnly && obs.confidence !== "HIGH") {
    suggestions.push({
      field,
      value: obs.value,
      confidence: obs.confidence,
    });
    return;
  }
  setFact(facts, field, obs.value, "IMAGE", obs.confidence);
}

/** Build facts bag from a single multi-photo observation. */
export function observationToListingFacts(
  obs: VisionListingObservation
): {
  facts: StructuredListingFacts;
  suggestions: VisionAdapterResult["suggestions"];
  omitted: string[];
} {
  const facts = emptyListingFacts();
  const suggestions: VisionAdapterResult["suggestions"] = [];
  const omitted: string[] = [];

  trySet(facts, "listingType", obs.listingType, omitted, suggestions, {
    allowMediumPopulate: true,
  });
  trySet(facts, "itemIdentity", obs.itemIdentity, omitted, suggestions, {
    allowMediumPopulate: true,
  });
  trySet(facts, "brand", obs.brand, omitted, suggestions, {
    allowMediumPopulate: true,
  });
  trySet(facts, "model", obs.model, omitted, suggestions, {
    allowMediumPopulate: false,
  });
  trySet(facts, "variant", obs.variant, omitted, suggestions);
  trySet(facts, "category", obs.category, omitted, suggestions, {
    allowMediumPopulate: true,
  });
  trySet(facts, "colour", obs.colour, omitted, suggestions, {
    allowMediumPopulate: true,
  });

  const conditionMapped = mapVisibleConditionToListing(obs.visibleCondition);
  if (conditionMapped) {
    setFact(facts, "condition", conditionMapped, "IMAGE", obs.visibleCondition.confidence);
  } else if (obs.visibleCondition.value) {
    setFact(
      facts,
      "conditionClues",
      obs.visibleCondition.value,
      "IMAGE",
      obs.visibleCondition.confidence === "LOW" ? "MEDIUM" : obs.visibleCondition.confidence
    );
    if (obs.visibleCondition.confidence === "MEDIUM") {
      suggestions.push({
        field: "condition",
        value: obs.visibleCondition.value,
        confidence: "MEDIUM",
      });
    } else if (obs.visibleCondition.confidence === "LOW") {
      omitted.push("condition");
    }
  }

  const identity =
    obs.displayIdentity ||
    composeListingIdentity({
      brand: mayPopulateFromVision(obs.brand, { allowMedium: true })
        ? obs.brand.value
        : undefined,
      product: mayPopulateFromVision(obs.product, { allowMedium: true })
        ? obs.product.value
        : mayPopulateFromVision(obs.itemIdentity, { allowMedium: true })
          ? obs.itemIdentity.value
          : undefined,
      model: mayPopulateFromVision(obs.model) ? obs.model.value : undefined,
      variant: mayPopulateFromVision(obs.variant) ? obs.variant.value : undefined,
    });

  if (identity && (obs.overallConfidence === "HIGH" || obs.overallConfidence === "MEDIUM")) {
    setFact(facts, "title", identity, "IMAGE", obs.overallConfidence);
    setFact(facts, "itemIdentity", identity, "IMAGE", obs.overallConfidence);
  }

  // Description: natural prose from safe visual + readable facts — never marketing
  if (obs.visualDescription && obs.overallConfidence !== "LOW") {
    const prose = composeVisionAwareDescription({
      visualDescription: obs.visualDescription,
      facts: [
        ...(obs.visibleFacts || []).slice(0, 3),
        ...(obs.readableFacts || []).slice(0, 2),
      ].filter((f) => !(obs.inferredFacts || []).includes(f)),
    });
    if (prose) setFact(facts, "description", prose, "IMAGE", obs.overallConfidence);
  }

  facts.visibleAttributes = [
    ...obs.visibleFeatures,
    ...obs.accessories.map((a) => `accessory:${a}`),
  ].slice(0, 24);
  facts.textFound = obs.identifiers.slice(0, 12);
  facts.identifiers = obs.identifiers.slice(0, 12);
  facts.domainExtras = obs.usefulFacts
    .filter((f) => !/\$|authentic|warranty|works|mileage|battery|storage/i.test(f))
    .slice(0, 12);

  return { facts: maybeLockEntity(facts), suggestions, omitted };
}

export function adaptVisionObservationToListing(
  obs: VisionListingObservation,
  existing?: SkyAiListingContext | null,
  opts?: { fieldProvenance?: ListingFieldProvenanceMap }
): VisionAdapterResult {
  // 1) Independent perception from THIS image first — never inherit prior brand
  const { facts: visionFacts, suggestions, omitted } = observationToListingFacts(obs);

  const continuity = assessObjectContinuity({
    observation: obs,
    priorDraft: existing,
  });
  const isNewObject = continuity.verdict === "NEW_OBJECT";
  const prov = opts?.fieldProvenance || {};

  // 2) Object continuity merge — only USER-locked or SAME_OBJECT fields survive
  let facts = visionFacts;
  const prior = emptyListingFacts();
  let mergedPrior = false;

  if (existing) {
    const mergeable = [
      "title",
      "description",
      "category",
      "condition",
      "price",
      "location",
      "listingType",
      "vehicleMake",
      "vehicleModel",
      "vehicleYear",
      "vehicleOdometer",
      "vehicleColour",
    ] as const;

    for (const k of mergeable) {
      const v = (existing as Record<string, unknown>)[k];
      if (typeof v !== "string" || !v.trim()) continue;

      const locked = isUserLockedProvenance(prov[k as keyof typeof prov]);

      // Location may persist as profile/session default across objects
      if (k === "location") {
        setFact(prior, k, v, "USER", "HIGH", { force: true });
        mergedPrior = true;
        continue;
      }

      // NEW_OBJECT: never inherit item-scoped prior (even false USER stamps from old bug)
      // except explicit USER locks on SAME/UNKNOWN when not brand-mismatched wipe
      if (isNewObject && !locked) continue;
      if (isNewObject && locked && continuity.blockedPriorFields.includes(k)) {
        // Brand/title mismatch wipe wins over stale USER stamp from other object
        continue;
      }
      if (continuity.blockedPriorFields.includes(k) && !locked) continue;

      if (locked || continuity.verdict === "SAME_OBJECT") {
        setFact(
          prior,
          k,
          v,
          locked ? "USER" : "IMAGE",
          locked ? "HIGH" : "MEDIUM",
          locked ? { force: true } : undefined
        );
        mergedPrior = true;
      }
    }
    if (mergedPrior) {
      facts = mergeListingFacts(prior, visionFacts);
    }
  }

  let listingFill = factsToListingFill(facts);
  if (!listingFill.listingType) listingFill.listingType = "physical";

  // NEW_OBJECT: never carry prior price/condition/title via fill gaps
  if (isNewObject) {
    // Vision perception is authoritative for identity; price must come from THIS turn
    if (!visionFacts.fields.price) delete listingFill.price;
    if (!visionFacts.fields.condition) delete listingFill.condition;
    listingFill.replaceDraft = true;
  }

  const validated = validateListingFillFields(listingFill);
  if (validated.ok) listingFill = validated.fill;

  // Apply structured vision domain facts (cards etc.) into extras — not Attr dumps
  listingFill = applyAwhinaDomainKnowledge(applyVisionDomainFacts(obs, listingFill));
  const packagedCardProduct =
    isSealedTradingCardProductFormat(obs.productFormat?.value) ||
    isSealedTradingCardProductFormat(
      `${listingFill.title || ""} ${(listingFill.extras || []).join(" ")}`
    );

  const domain = resolveFactDomain(listingFill);
  const cardFacts = extractTradingCardFactsFromExtras(listingFill.extras);
  if (obs.brand?.value && mayPopulateFromVision(obs.brand, { allowMedium: true })) {
    cardFacts.manufacturer = cardFacts.manufacturer || obs.brand.value;
  }
  if (obs.cardSet?.value && mayPopulateFromVision(obs.cardSet, { allowMedium: true })) {
    cardFacts.productLine = cardFacts.productLine || obs.cardSet.value;
  }
  // Packaging colour is never a card parallel on sealed products.
  if (
    !packagedCardProduct &&
    obs.colour?.value &&
    mayPopulateFromVision(obs.colour, { allowMedium: true })
  ) {
    cardFacts.parallelColour = cardFacts.parallelColour || obs.colour.value;
  }
  if (obs.productFormat?.value && mayPopulateFromVision(obs.productFormat, { allowMedium: true })) {
    cardFacts.productFormat = cardFacts.productFormat || obs.productFormat.value;
  }
  if (obs.league?.value && mayPopulateFromVision(obs.league, { allowMedium: true })) {
    cardFacts.league = cardFacts.league || obs.league.value;
  }
  if (obs.season?.value && mayPopulateFromVision(obs.season, { allowMedium: true })) {
    cardFacts.season = cardFacts.season || obs.season.value;
  }
  if (obs.quantity?.value && mayPopulateFromVision(obs.quantity, { allowMedium: true })) {
    cardFacts.quantity = cardFacts.quantity || obs.quantity.value;
  }

  const richerCardTitle = composeTradingCardTitle(cardFacts);
  const rawIdentity =
    obs.displayIdentity ||
    listingFill.title ||
    facts.fields.itemIdentity?.value ||
    "";

  const identity = assessIdentityCompleteness({
    fill: listingFill,
    claimedIdentity: rawIdentity,
    domain,
  });

  let displayIdentity = identity.isComplete
    ? identity.displayIdentity
    : identity.knownSummary.replace(/^an?\s+/i, "") || "this item";

  // A sealed product's readable package identity is authoritative. Do not let
  // card-title composition re-order it into "Premier League Booster Box Topps".
  if (
    packagedCardProduct &&
    mayPopulateFromVision(obs.itemIdentity, { allowMedium: true }) &&
    obs.displayIdentity.trim()
  ) {
    displayIdentity = obs.displayIdentity.trim();
  }

  // Prefer structured card/product title over lone manufacturer / soft category.
  // Keep a specific sealed-product displayIdentity when vision already named it.
  if (
    richerCardTitle &&
    assessTitleQuality(richerCardTitle).ok &&
    (domain === "TRADING_CARD" || packagedCardProduct)
  ) {
    const currentQuality = assessTitleQuality(displayIdentity);
    const shouldReplace =
      !currentQuality.ok ||
      currentQuality.reason === "lone_manufacturer" ||
      (!packagedCardProduct &&
        /trading card$/i.test(displayIdentity) &&
        !/trading card$/i.test(richerCardTitle));
    if (shouldReplace) {
      displayIdentity = richerCardTitle;
    }
  }

  const userTitleLocked =
    !isNewObject &&
    isUserLockedProvenance(prov.title) &&
    Boolean(existing?.title?.trim()) &&
    listingFill.title?.trim() === existing?.title?.trim();

  if (rawIdentity && isMalformedItemIdentity(rawIdentity, domain)) {
    if (
      !userTitleLocked &&
      listingFill.title &&
      isMalformedItemIdentity(listingFill.title, domain)
    ) {
      listingFill = { ...listingFill, title: displayIdentity };
    }
    omitted.push("malformed_identity");
  } else if (
    !userTitleLocked &&
    identity.isComplete &&
    identity.displayIdentity &&
    !listingFill.title?.trim()
  ) {
    listingFill = { ...listingFill, title: identity.displayIdentity };
  } else if (
    !userTitleLocked &&
    listingFill.title &&
    !assessTitleQuality(listingFill.title, { richerFactsAvailable: true }).ok
  ) {
    listingFill = {
      ...listingFill,
      title:
        domain === "TRADING_CARD" && assessTitleQuality(richerCardTitle).ok
          ? richerCardTitle
          : displayIdentity,
    };
  } else if (
    !userTitleLocked &&
    identity.isComplete &&
    identity.displayIdentity &&
    listingFill.title &&
    isMalformedItemIdentity(listingFill.title, domain)
  ) {
    listingFill = { ...listingFill, title: identity.displayIdentity };
  }

  // Category: trading cards / TCG products are collectibles, not sports by default.
  if (
    domain === "TRADING_CARD" ||
    /trading-?card|collectible/i.test(obs.domain || "") ||
    /collectibles/i.test(String(listingFill.category || ""))
  ) {
    if (!listingFill.category || listingFill.category === "Other" || listingFill.category === "Sports") {
      listingFill = { ...listingFill, category: "Collectibles" };
    }
  }

  // Condition: never invent New from looks-clean; mapVisibleCondition already gates sealed-only
  // If vision didn't map condition, leave unspecified (delete inherited on NEW_OBJECT already)

  // Public copy gate — Attr:/lone manufacturer/stale price impossible
  const gated = gatePublicListingCopy(listingFill, {
    allowPrice: !isNewObject || Boolean(visionFacts.fields.price),
    allowConditionNew: Boolean(
      listingFill.condition === "New" &&
        mapVisibleConditionToListing(obs.visibleCondition) === "New"
    ),
    canonicalIdentity: displayIdentity,
    richerFactsAvailable: Boolean(
      cardFacts.playerName ||
        cardFacts.productLine ||
        cardFacts.serialNumber ||
        obs.product?.value ||
        obs.model?.value
    ),
  });
  listingFill = gated.fill;
  if (isNewObject) listingFill.replaceDraft = true;

  const needsIdentityConfirm =
    !identity.isComplete ||
    obs.overallConfidence !== "HIGH" ||
    suggestions.some((s) => s.field === "itemIdentity" || s.field === "title") ||
    (domain === "TRADING_CARD" &&
      !packagedCardProduct &&
      !cardFacts.playerName &&
      !obs.cardSubject?.value);

  const missingPrompts: string[] = [];
  if (!listingFill.price) missingPrompts.push("price");
  if (!listingFill.location) missingPrompts.push("location");
  if (
    !identity.isComplete ||
    (domain === "TRADING_CARD" && !packagedCardProduct && !cardFacts.playerName)
  ) {
    missingPrompts.push("identity");
  }

  const missingCore =
    identity.missingCoreQuestion ||
    (domain === "TRADING_CARD" && !packagedCardProduct && !cardFacts.playerName
      ? "I can't confidently read the player's name — who is it?"
      : "");
  const foundReply = needsIdentityConfirm
    ? missingCore
      ? `Looks like ${identity.knownSummary || displayIdentity}, but ${missingCore}`
      : `Looks like a **${displayIdentity}**. Is that right?`
    : `Looks like a **${displayIdentity}**.`;

  return {
    facts,
    listingFill,
    suggestions,
    omitted,
    displayIdentity,
    needsIdentityConfirm,
    missingPrompts,
    foundReply,
    continuity: continuity.verdict,
    replaceDraft: isNewObject || listingFill.replaceDraft === true,
  };
}

/** Map per-fact vision domain fields into structured extras (evidence, not Attr dumps). */
function applyVisionDomainFacts(
  obs: VisionListingObservation,
  fill: SkyAiListingFill
): SkyAiListingFill {
  const extras = [...(fill.extras || [])].filter(
    (e) => !/^attr:/i.test(e) && !/^text:/i.test(e)
  );
  const push = (prefix: string, field: VisionObservedField) => {
    if (!mayPopulateFromVision(field, { allowMedium: true })) return;
    if (!field.value.trim()) return;
    if (extras.some((e) => e.toLowerCase().startsWith(prefix.toLowerCase()))) return;
    extras.push(`${prefix}${field.value.trim()}`);
  };

  if (obs.cardSubject) push("subject:", obs.cardSubject);
  if (obs.cardSet) push("set:", obs.cardSet);
  if (obs.brand) push("manufacturer:", obs.brand);
  if (obs.league) push("league:", obs.league);
  if (obs.season) push("season:", obs.season);
  if (obs.productFormat) push("productFormat:", obs.productFormat);
  if (obs.quantity) push("quantity:", obs.quantity);
  if (obs.grader && obs.grade) {
    const g = mayPopulateFromVision(obs.grader, { allowMedium: true })
      ? obs.grader.value
      : "";
    const gr = mayPopulateFromVision(obs.grade, { allowMedium: true })
      ? obs.grade.value
      : "";
    if (g && gr && !extras.some((e) => e.toLowerCase().startsWith("grade:"))) {
      extras.push(`grade:${g.toUpperCase()} ${gr}`);
    }
  } else if (obs.grade) {
    push("grade:", obs.grade);
  }
  if (obs.serialNumber) push("serial:", obs.serialNumber);
  if (obs.cardYear) push("year:", obs.cardYear);
  const sealed =
    isSealedTradingCardProductFormat(obs.productFormat?.value) ||
    isSealedTradingCardProductFormat(
      `${fill.title || ""} ${extras.join(" ")}`
    );
  if (!sealed && obs.parallel) push("parallel:", obs.parallel);
  // Colour on cards → parallel colour evidence (structured), not Attr:orange background
  if (
    !sealed &&
    obs.colour?.value &&
    mayPopulateFromVision(obs.colour, { allowMedium: true }) &&
    /trading-?card|collectible/i.test(obs.domain || "")
  ) {
    if (!extras.some((e) => /^parallelcolour:/i.test(e))) {
      extras.push(`parallelColour:${obs.colour.value.trim()}`);
    }
  }

  if (extras.length === (fill.extras || []).length) return fill;
  return { ...fill, extras };
}

/** Build a natural description from confirmed seller bits + safe vision facts. */
export function composeVisionAwareDescription(opts: {
  sellerText?: string;
  visualDescription?: string;
  facts?: string[];
}): string {
  const parts: string[] = [];
  const seller = (opts.sellerText || "").trim();
  const visual = (opts.visualDescription || "").trim();
  if (seller) parts.push(seller);
  if (visual && !seller.toLowerCase().includes(visual.slice(0, 40).toLowerCase())) {
    parts.push(visual);
  }
  for (const f of opts.facts || []) {
    const t = f.trim();
    if (!t || /\$|authentic|warranty|works perfectly/i.test(t)) continue;
    if (parts.some((p) => p.toLowerCase().includes(t.toLowerCase()))) continue;
    parts.push(t);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
}
