/**
 * Server-only billed description writer. Client code must import facts/validation
 * from `awhina-description-writer.ts` and must not import this file.
 */
import "server-only";

import { createGatedOpenAI } from "./openai-spend-guard";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  runAwhinaListingDescriptionWriter as runDescriptionWriterCore,
  sellerEvidenceCount,
  type DescriptionWriterFacts,
  type DescriptionWriterRunOptions,
} from "./awhina-description-writer";

const MODEL = process.env.OPENAI_DESCRIPTION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

const DESCRIPTION_WRITER_SYSTEM = `Write buyer-facing marketplace copy from ONLY the supplied JSON facts.
Return JSON exactly as {"description":"..."}.

Evidence priority:
1. sellerEvidence (explicit seller statements — highest authority)
2. canonical structured facts (vehicle, product, condition, collectible)
3. confidently observed extras
4. grounded domain knowledge
Never let generic marketing prose outrank seller evidence.

Writing rules:
- Spend the word budget on real supplied facts. Sparse facts: 1–3 short sentences. Rich sellerEvidence or sellerNotes: write a fuller factual description (typically 4–8 sentences) covering identity, condition details, modifications, maintenance, mechanical disclosure, compliance, included items, and location when present.
- sellerNotes and sellerEvidence are explicit seller-provided facts and have HIGH authority. Preserve as much useful buyer-relevant substance as possible, paraphrasing naturally instead of copying labels.
- Prefer concrete seller facts (modifications, maintenance, accessories, wear, faults, included items, condition details) over generic product praise.
- Compose relationships; never serialize raw metadata keys or labels.
- Compose facts naturally. Preserve meaning, not exact seller wording.
- Never invent praise, era commentary, or enthusiast filler to pad sparse copy.
- Never invent reasons, outcomes, benefits, causality, or conclusions the seller did not state (banned examples: "to ensure its pristine condition", "which keeps it performing perfectly", "making it ideal for…", "ensuring reliability", "well maintained" unless seller evidence explicitly supports that exact claim).
- State protection/usage facts plainly (e.g. "always used with a case and screen protector") without explaining why.
- Never mention asking price, contact actions, "for sale", "for sale in", database labels, or unsupported claims.
- Never write "the seller confirms", "seller states", or that details were not provided.
- Never invent product features, benefits, reliability, or "latest features".
- When colour, storage, battery health, included items, or wear disclosures are in the facts, include them.
- When sellerEvidence.location or location is supplied, you may include it once as a closing fact. Never invent a location.
- For related/bundled items, explain the relationship naturally when facts support it.
- Preserve the most specific supplied collection, group, model, or product-family name; do not replace it with a generic category.
- Treat parentIdentity as a modifier that comes before collection/product: "Parent Collection", never "Collection Parent".
- Format lists as natural prose: "A, B and C", never "A, B, C".
- Let objectType and relationships determine the shape: a bundle should describe its included items; a sealed product should describe its product line/format; a vehicle should foreground confirmed vehicle facts. Do not reuse one sentence skeleton across domains.
- When quantity and multiple related items are supplied, make clear they form one set or bundle, but do not default to the words "featuring", "all ... are in", or "sold together as a set".
- For cards, prioritize set/product, character/player, parallel, numbering, grade, quantity, and condition.
- For sealed card products (box, pack, tin, display), never invent parallels, players, pack counts, or card attributes. A booster product may be described as containing booster packs only when objectType/product format establishes that relationship.
- For electronics, bikes, clothing, vehicles, furniture and tools, prioritise only confirmed useful details.
- Include the supplied condition naturally whenever one is present.
- Condition grammar: "is/are brand new", "is/are new", "is/are in like-new condition", "is/are in good condition", "is/are in good used condition", or "is/are in fair condition". Never write "in brand new".
- Banned phrases: "classic era", "represents a", "standout", "known for its performance and design", "must-have", "perfect for", "great choice", "ideal for enthusiasts", "great addition", "don't miss out", "sure to impress", "rare", "valuable", "iconic", or generic calls to action.
- Never emit raw metadata such as seller_notes:, bundle_quantity:3, listing_type:physical, brand:Nike, modification:exhaust, or any key:value labels.
- Never add facts, specifications, authenticity, working status, or condition not in JSON.`;

export async function generateGatedDescriptionWriterOutput(
  facts: DescriptionWriterFacts
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const client = createGatedOpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.25,
    max_tokens: sellerEvidenceCount(facts) >= 5 ? 520 : sellerEvidenceCount(facts) >= 3 ? 420 : 320,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: DESCRIPTION_WRITER_SYSTEM },
      { role: "user", content: JSON.stringify(facts) },
    ],
  });
  return completion.choices[0]?.message?.content || null;
}

export async function runAwhinaListingDescriptionWriter(
  fill: SkyAiListingFill,
  opts?: DescriptionWriterRunOptions
) {
  return runDescriptionWriterCore(fill, {
    ...opts,
    generateRawOutput: opts?.generateRawOutput ?? generateGatedDescriptionWriterOutput,
  });
}

export async function writeAwhinaListingDescription(
  fill: SkyAiListingFill,
  opts?: DescriptionWriterRunOptions
): Promise<string | null> {
  const attempt = await runAwhinaListingDescriptionWriter(fill, opts);
  return attempt.description || null;
}
