import type { SkyAiListingFill } from "./sky-ai-listing-fill";

const VEHICLE_FORBIDDEN_COPY_RE =
  /\b(?:sealed|unsealed|unopened|factory[- ]sealed|booster\s*(?:box|display|pack)|hobby\s*box|blaster\s*box|mega\s*box|trading[- ]?card|graded|PSA\s*\d|BGS\s*\d|CGC\s*\d|SGC\s*\d|parallel|serial[- ]?numbered|packaging|card\s*condition)\b/i;

const COLLECTIBLE_FORBIDDEN_COPY_RE =
  /\b(?:odometer|kilometres?|\bkm\b|manual\s+transmission|automatic\s+transmission|petrol\s+fuel|diesel\s+fuel|rego\b|\bWOF\b|coilovers?|intercooler|downpipe|timing\s+belt)\b/i;

/**
 * Category semantic firewall for buyer-facing AI copy.
 * This intentionally rejects cross-domain concepts instead of trying to edit
 * them into place: a vehicle must never inherit collectible/sealed language,
 * and a collectible must never inherit vehicle ownership/spec language.
 */
export function hasCategoryIncompatibleDescription(
  description: string | undefined | null,
  fill: Pick<SkyAiListingFill, "listingType" | "category">
): boolean {
  const text = String(description || "").trim();
  if (!text) return false;

  const type = String(fill.listingType || "").toLowerCase();
  const category = String(fill.category || "").toLowerCase();
  const vehicle = type === "vehicle" || category === "cars";
  const collectible = category === "collectibles";

  if (vehicle && VEHICLE_FORBIDDEN_COPY_RE.test(text)) return true;
  if (collectible && COLLECTIBLE_FORBIDDEN_COPY_RE.test(text)) return true;
  return false;
}
