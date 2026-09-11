/**
 * Canonical listing condition parsing.
 * "like-new" / "like new" must win before any bare "new" match.
 */

export const LISTING_CONDITIONS = [
  "New",
  "Used - Like New",
  "Used - Good",
  "Used - Fair",
] as const;

export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

const LIKE_NEW_RE = /\blike[\s-]*new\b/;
const BRAND_NEW_RE = /\bbrand[\s-]*new\b|\bfactory[\s-]+sealed\b|\b(?:still\s+)?sealed\b|\bunopened\b/;
const BARE_NEW_RE = /(?:^|[^\w]|_)new(?:\s+condition)?\b/;
/** NZ places that start with "new" must not count as listing condition New. */
const NEW_PLACE_RE = /\bnew\s+(?:plymouth|lynn|brighton|zealand)\b/gi;
/** "new oil / new filters / new tyres" is maintenance — not listing condition New. */
const NEW_PARTS_RE =
  /\b(?:needs?\s+)?new\s+(?:chain|tyres?|tires?|brakes?|batter(?:y|ies)|filters?|oil|wheels?|exhaust|pads?|intake|clutch|rotors?|spark\s+plugs?|wipers?|bladder|valve|belt|hose|gasket|screen|display|hinge|charger|cable)\b/gi;

export function parseListingCondition(
  raw: string | undefined | null,
  opts?: { hasDefects?: boolean }
): ListingCondition | undefined {
  const source = String(raw || "").trim();
  if (!source) return undefined;
  if ((LISTING_CONDITIONS as readonly string[]).includes(source)) {
    return source as ListingCondition;
  }
  let t = source.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  // Scrub maintenance "new X" and NZ "New X" places before bare-new matching.
  t = t.replace(NEW_PARTS_RE, " ");
  t = t.replace(NEW_PLACE_RE, " ");
  const sealed = BRAND_NEW_RE.test(t);
  const explicitLikeNew = LIKE_NEW_RE.test(t);
  const mintConditionPhrase =
    /\b(?:mint|excellent)\s+condition\b/.test(t) || /\bin\s+(?:mint|excellent)\b/.test(t);
  const shortMintReply = /^(?:it'?s\s+|its\s+)?(?:mint|excellent)(?:\s+condition)?$/.test(t);
  const colloquialMint = /\bworks?\s+mint\b|\bstill\s+works?\s+mint\b|\bmint\s+got\b/.test(t);
  const defectContradiction =
    Boolean(opts?.hasDefects) ||
    /\b(?:smash(?:ed)?|crack(?:ed)?|dent(?:ed)?|scratch(?:ed)?|water\s+damaged?|knock(?:s|ing)?)\b/i.test(t);
  // like-new must beat bare "new" (hyphen trap), but factory-sealed/unopened wins over mint.
  if (explicitLikeNew && !sealed && !defectContradiction) return "Used - Like New";
  if (explicitLikeNew && !sealed && defectContradiction) return "Used - Good";
  if (sealed && defectContradiction) {
    return /\bfair|rough|smash|water\s+damage/i.test(t) ? "Used - Fair" : "Used - Good";
  }
  if (sealed && !/\bpaid\b.{0,20}\bnew\b|\bbought\b.{0,20}\bnew\b|\bwas\s+new\b/i.test(t)) {
    return "New";
  }
  // Do not upgrade colloquial "still works mint" / mint-in-a-rant to like-new.
  if (colloquialMint || (opts?.hasDefects && !mintConditionPhrase && !shortMintReply)) {
    if (/\bfair\b|\brough\b/.test(t)) return "Used - Fair";
    if (
      /\b(?:used|good|works?|working|mint|excellent)\b/.test(t) ||
      /\bworking\s+order\b/.test(t)
    ) {
      return "Used - Good";
    }
  }
  if ((mintConditionPhrase || shortMintReply) && !opts?.hasDefects) {
    return "Used - Like New";
  }
  if (BARE_NEW_RE.test(t) && !LIKE_NEW_RE.test(t) && !/\bnew zealand\b/.test(t) && !/\bpaid\b.{0,24}\bnew\b|\bbought\b.{0,24}\bnew\b/.test(t)) {
    if (defectContradiction) return /\bfair|rough|smash/i.test(t) ? "Used - Fair" : "Used - Good";
    return "New";
  }
  if (/\bfair\b|\brough\b/.test(t)) return "Used - Fair";
  if (
    /\b(?:used|good)\b/.test(t) ||
    /\bworking\s+order\b/.test(t) ||
    /\bworks?\s+(?:well|ok|fine|mint)\b/.test(t)
  ) {
    return "Used - Good";
  }
  return undefined;
}

const DEFECT_WORD =
  "(?:cracks?|faults?|repairs?|damage|dents?|scratch(?:ed|es)?|scuffs?|chips?|dings?|issues?|marks?|drift|runtime|smash(?:ed)?|worn|wobbly|knock(?:s|ing)?)";

/** Wear/damage that the seller actually reported — ignore "no cracks" / "no damage". */
export function hasAffirmativeWear(text: string): boolean {
  // "No cracks, faults or repairs" / "No faults or damage" must not leave
  // residual defect words that look affirmative after a partial strip.
  const stripped = String(text || "")
    .replace(
      new RegExp(
        `\\b(?:no|without|zero|none|not any|free from|free of)\\s+(?:known\\s+)?${DEFECT_WORD}(?:\\s*(?:,|/|and|or)\\s*(?:known\\s+)?${DEFECT_WORD})*\\b`,
        "gi"
      ),
      " "
    )
    .replace(
      new RegExp(
        `\\b(?:no|without|zero|none|not any|free from|free of)\\s+(?:known\\s+)?${DEFECT_WORD}\\b`,
        "gi"
      ),
      " "
    );
  return new RegExp(
    `\\b${DEFECT_WORD}|\\bwear\\b|\\bworn\\b|\\bdamaged?\\b|\\bdoesn'?t\\s+last\\b|\\bstick\\s+drift\\b|\\breduced\\s+runtime\\b`,
    "i"
  ).test(stripped);
}

export function looksLikeColourFinish(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || t.split(/\s+/).length > 4) return false;
  if (/\d/.test(t)) return false;
  if (
    /\b(?:comes|used|always|battery|original|crack|fault|repair|box|cable|controller|servic|pickup|shipping|asking)\b/i.test(
      t
    )
  ) {
    return false;
  }
  return /^(?:(?:natural|space|midnight|pearl|matte|metallic|starlight|graphite|alpine|gunmetal|dark|light|racing|forest|navy)\s+)?(?:black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|beige|purple|pink|bronze|maroon|navy|titanium|graphite|starlight)$/i.test(
    t
  );
}
