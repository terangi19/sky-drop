/**
 * Smart domain clarifications — specific missing fields, never "please provide more details".
 */

import type { DomainClarifyAsk, MarketplaceEntity } from "./types";
import { MARKETPLACE_DOMAINS } from "./domains";

export function pickTopClarifications(
  entity: MarketplaceEntity | null | undefined,
  limit = 2
): DomainClarifyAsk[] {
  if (!entity) {
    return [
      {
        field: "item",
        question: "What are you listing — vehicle, card, phone, sneakers, or a service?",
        priority: 1,
      },
    ];
  }

  const mod = MARKETPLACE_DOMAINS.find((d) => d.id === entity.domain);
  const fromDomain = mod ? mod.enrichmentPriority(entity) : [];
  const unknownsAsAsks: DomainClarifyAsk[] = entity.unknowns
    .filter((u) => !fromDomain.some((a) => a.field === u))
    .slice(0, 2)
    .map((u, i) => ({
      field: u,
      question: clarifyLabel(entity, u),
      priority: 10 + i,
    }));

  return [...fromDomain, ...unknownsAsAsks]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
}

function clarifyLabel(entity: MarketplaceEntity, field: string): string {
  const name = entity.displayName || "this item";
  switch (field) {
    case "year":
      return entity.domain === "collectibles"
        ? `Year for ${name}? (skip if unsure — I won't guess)`
        : `What year is the ${name}?`;
    case "storage":
      return `Storage size for the ${name}?`;
    case "size":
      return `What size?`;
    case "set":
      return `Which set is the card from?`;
    case "player_or_subject":
      return `Which player or character?`;
    case "make":
      return `Which make?`;
    case "model":
      return `Which model?`;
    case "parallel":
      return `Any parallel/variant? (only if you know — I won't invent one)`;
    case "cardNumber":
      return `Card number if you have it?`;
    case "dailyRate":
      return `Daily hire rate?`;
    case "price":
      return `Asking price?`;
    default:
      return `Quick detail: ${field.replace(/_/g, " ")}?`;
  }
}

export function formatClarifyQuestion(asks: DomainClarifyAsk[]): string | undefined {
  if (!asks.length) return undefined;
  return asks[0].question;
}
