/**
 * One-call grounded writer for AI-owned marketplace descriptions.
 *
 * Canonical fields remain the source of truth. The model only chooses wording
 * and organisation; it never supplies listing facts.
 */
import OpenAI from "openai";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  BANNED_TEMPLATE_RE,
  IMPLY_CLAIMS_RE,
  SELLER_EDITOR_GUIDANCE_RE,
  cleanDescriptionItemName,
  removeStructuredPriceCopy,
} from "./awhina-listing-description";

const MODEL = process.env.OPENAI_DESCRIPTION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const CTA_RE =
  /\b(message|get in touch|feel free|send me a message|happy to|don't miss|great opportunity)\b/i;
const METADATA_RE = /\battr\s*:|\b(?:condition|location|price|title)\s*:/i;

export type DescriptionWriterFacts = {
  listingType: string;
  title: string;
  condition?: string;
  extras: string[];
  vehicle?: Record<string, string>;
};

export function buildDescriptionWriterFacts(fill: SkyAiListingFill): DescriptionWriterFacts {
  const vehicle = Object.fromEntries(
    [
      ["year", fill.vehicleYear],
      ["make", fill.vehicleMake],
      ["model", fill.vehicleModel],
      ["colour", fill.vehicleColour],
      ["odometer", fill.vehicleOdometer],
      ["transmission", fill.vehicleTransmission],
      ["fuel", fill.vehicleFuelType],
      ["body", fill.vehicleBodyType],
    ].filter(([, value]) => typeof value === "string" && value.trim())
  );

  return {
    listingType: fill.listingType || "physical",
    title: cleanDescriptionItemName(fill.title || ""),
    condition: fill.condition?.trim() || undefined,
    extras: (fill.extras || [])
      .map((value) => String(value).trim())
      .filter(Boolean)
      .slice(0, 20),
    vehicle: Object.keys(vehicle).length ? vehicle : undefined,
  };
}

function hasMeaningfulFacts(facts: DescriptionWriterFacts): boolean {
  return Boolean(
    facts.condition ||
      facts.extras.length ||
      facts.vehicle ||
      facts.title.split(/\s+/).length >= 3
  );
}

export function validateAiListingDescription(
  proposed: string,
  facts: DescriptionWriterFacts
): string | null {
  const description = removeStructuredPriceCopy(proposed)
    .replace(/\s+/g, " ")
    .trim();
  if (
    description.length < 24 ||
    description.length > 900 ||
    CTA_RE.test(description) ||
    METADATA_RE.test(description) ||
    BANNED_TEMPLATE_RE.test(description) ||
    SELLER_EDITOR_GUIDANCE_RE.test(description) ||
    IMPLY_CLAIMS_RE.test(description)
  ) {
    return null;
  }

  // Location and price are UI data for ordinary sale listings, not writing
  // material. Service/rental rates are intentionally handled elsewhere.
  if (
    facts.listingType === "physical" &&
    /\b(?:for sale in|located in|asking\s+\$|priced at\s+\$)\b/i.test(description)
  ) {
    return null;
  }

  // A title with a condition/location tail is exactly the field-stitching this
  // writer exists to prevent. Require a second meaningful sentence when rich
  // facts are available.
  const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (hasMeaningfulFacts(facts) && sentences.length < 2) return null;
  const titleWords = facts.title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  const proseWords = description
    .toLowerCase()
    .replace(new RegExp(facts.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
    .replace(/\b(?:in\s+)?(?:brand new|like-new|good used condition|fair used condition)\b/gi, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  // Reject `TITLE. CONDITION.` and close variants: it adds no buyer meaning.
  if (
    titleWords.length > 0 &&
    proseWords.length < 5 &&
    titleWords.some((word) => description.toLowerCase().includes(word))
  ) {
    return null;
  }
  return description;
}

export async function writeAwhinaListingDescription(
  fill: SkyAiListingFill,
  opts?: { force?: boolean }
): Promise<string | null> {
  if (fill.descriptionSource === "user" && !opts?.force) return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const facts = buildDescriptionWriterFacts(fill);
  if (!apiKey || !facts.title || !hasMeaningfulFacts(facts)) return null;

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.35,
    max_tokens: 260,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Write concise buyer-facing marketplace copy from ONLY the supplied JSON facts.
Return JSON exactly as {"description":"..."}.

Writing rules:
- Use 1–4 useful sentences based on fact richness.
- Compose relationships; never serialize title, condition, price, or location.
- For related/bundled items, explain the relationship naturally when facts support it.
- For cards, prioritize set/product, character/player, parallel, numbering, grade, quantity, and condition.
- For electronics, bikes, clothing, and vehicles, prioritise only confirmed useful details.
- Never mention price, location, contact actions, "for sale", marketing filler, database labels, or unsupported claims.
- Never add facts, specifications, authenticity, working status, or condition not in JSON.`,
      },
      { role: "user", content: JSON.stringify(facts) },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { description?: unknown };
    return typeof parsed.description === "string"
      ? validateAiListingDescription(parsed.description, facts)
      : null;
  } catch {
    return null;
  }
}
