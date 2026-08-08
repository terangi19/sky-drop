/**
 * Canonical marketplace knowledge resolver (orchestrator).
 * ONE Āwhina path — pluggable domains, controlled aliases, honest uncertainty.
 */

import { MARKETPLACE_DOMAINS } from "./domains";
import {
  expandWithDomainContext,
  getDomainContext,
  setDomainContext,
} from "./context";
import { pickTopClarifications, formatClarifyQuestion } from "./clarify";
import { mapEntityToListingHints } from "./map-to-listing";
import { lookupCurrentInfo } from "./current-info";
import type {
  DomainConversationContext,
  MarketplaceDomainId,
  MarketplaceEntity,
  MarketplaceResolveResult,
  KnowledgeProvenance,
} from "./types";

export type ResolveMarketplaceOptions = {
  conversationKey?: string;
  priorContext?: DomainConversationContext | null;
  userFacts?: string[];
};

function stickyFromEntity(entity: MarketplaceEntity): Record<string, string> {
  const sticky: Record<string, string> = {};
  for (const a of entity.attributes) {
    if (a.key === "set") sticky.set = a.value;
    if (a.key === "subject") sticky.player = a.value;
    if (a.key === "storage") sticky.storage = a.value;
  }
  if (entity.brand?.name) sticky.brand = entity.brand.name;
  if (entity.model?.name) sticky.model = entity.model.name;
  if (entity.grade?.company && entity.grade.grade) {
    sticky.grade = `${entity.grade.company} ${entity.grade.grade}`;
  }
  if (entity.domain === "collectibles" && entity.family?.name) sticky.set = entity.family.name;
  return sticky;
}

/**
 * Resolve NL → structured marketplace entity via domain modules.
 * Hierarchy: USER > LOCAL_DATA > LOOKUP > high-confidence domain > MODEL_INFERENCE
 */
export function resolveMarketplaceKnowledge(
  text: string,
  opts: ResolveMarketplaceOptions = {}
): MarketplaceResolveResult {
  const raw = String(text || "").trim();
  const prior =
    opts.priorContext ??
    (opts.conversationKey ? getDomainContext(opts.conversationKey) : null);

  const expanded = expandWithDomainContext(raw, prior);
  const provenanceTrail: KnowledgeProvenance[] = [];

  let bestScore = 0;
  let bestEntity: MarketplaceEntity | null = null;
  let bestClarify = pickTopClarifications(null, 1);

  for (const mod of MARKETPLACE_DOMAINS) {
    const detect = mod.detect(expanded);
    const result = mod.resolve({
      text: expanded,
      prior,
      userFacts: opts.userFacts,
    });
    if (!result.hit || !result.entity) continue;

    // Prefer higher score; USER/LOCAL_DATA over MODEL_INFERENCE on ties
    const provBoost =
      result.entity.provenance === "USER"
        ? 0.05
        : result.entity.provenance === "LOCAL_DATA"
          ? 0.03
          : result.entity.provenance === "LOOKUP"
            ? 0.02
            : 0;
    const score = result.score + provBoost + Math.max(0, detect) * 0.05;
    if (score > bestScore) {
      bestScore = score;
      bestEntity = result.entity;
      bestClarify = result.clarify?.length
        ? result.clarify
        : pickTopClarifications(result.entity, 2);
      provenanceTrail.push(result.entity.provenance);
    }
  }

  // Mark current-info fields — never pretend static knowledge is live
  if (bestEntity && bestEntity.needsCurrentCheck.length) {
    const lookup = lookupCurrentInfo({
      domain: bestEntity.domain,
      query: bestEntity.displayName,
      fields: bestEntity.needsCurrentCheck,
    });
    if (!lookup.resolved) {
      provenanceTrail.push("LOOKUP");
      // Keep needsCurrentCheck; do not invent values
    }
  }

  let context: DomainConversationContext | null = prior;
  if (bestEntity && bestEntity.confidence !== "low") {
    const sticky = stickyFromEntity(bestEntity);
    if (opts.conversationKey) {
      context = setDomainContext(opts.conversationKey, {
        domain: bestEntity.domain,
        sticky,
        displayName: bestEntity.displayName,
      });
    } else {
      context = {
        domain: bestEntity.domain,
        sticky,
        displayName: bestEntity.displayName,
        updatedAt: Date.now(),
      };
    }
  }

  const listingHints = mapEntityToListingHints(bestEntity, {
    existingProvenance: {},
  });

  // Low confidence → ask smart clarify, don't hallucinate
  const clarify =
    bestEntity?.confidence === "low" || (bestEntity && bestClarify.length)
      ? bestClarify.slice(0, 2)
      : bestEntity
        ? []
        : pickTopClarifications(null, 1);

  return {
    entity: bestEntity,
    domain: (bestEntity?.domain || "unknown") as MarketplaceDomainId,
    clarify,
    provenanceTrail,
    listingHints,
    context,
  };
}

/** Convenience: primary clarify string for decision layer */
export function marketplaceClarifyQuestion(
  text: string,
  opts?: ResolveMarketplaceOptions
): string | undefined {
  const r = resolveMarketplaceKnowledge(text, opts);
  if (r.entity && r.entity.confidence === "high" && r.clarify.length === 0) {
    return undefined;
  }
  return formatClarifyQuestion(r.clarify);
}
