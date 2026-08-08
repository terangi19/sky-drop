import {
  AWHINA_DEAD_END_PHRASES,
  AWHINA_NEXT_STEP_SIGNALS,
} from "./sky-ai-task-completion";

export type ReplyQualityResult = {
  pass: boolean;
  failures: string[];
  metrics: {
    questionCount: number;
    wordCount: number;
    hasNextStep: boolean;
    hasDeadEnd: boolean;
    roboticScore: number;
  };
};

const ROBOTIC_PHRASES = [
  "certainly!",
  "i'd be happy to help",
  "as an ai",
  "as a language model",
  "please provide more information",
  "feel free to",
  "don't hesitate to",
  "i understand you want",
  "great question!",
  "thank you for reaching out",
];

const FORM_INTERROGATION =
  /\b(please provide|please provide me with|could you (please )?tell me|fill in the following|complete the form below|step 1:|step 2:)\b/i;

/** Count user-facing questions — more than one often feels like a form. */
export function countQuestions(text: string): number {
  const marks = (text.match(/\?/g) || []).length;
  const prompts = (text.match(/\b(what|which|when|where|how much|could you tell me)\b/gi) || [])
    .length;
  return Math.max(marks, prompts > 2 ? 2 : 0);
}

export function hasOverQuestioning(text: string): boolean {
  const q = countQuestions(text);
  if (q > 1) return true;
  if (FORM_INTERROGATION.test(text)) {
    // Single targeted follow-up after a checklist is OK
    if (/could you tell me which/i.test(text) && (text.match(/\?/g) || []).length <= 1) {
      return false;
    }
    return true;
  }
  const lines = text.split("\n").filter((l) => l.trim().endsWith("?"));
  return lines.length > 1;
}

export function hasNextStepSignal(text: string, listingFill?: unknown): boolean {
  if (listingFill) return true;
  const lower = text.toLowerCase();
  if (/\?\s*$/.test(text.trim())) return true;
  if (/\[\[nav:/i.test(text)) return true;
  if (/\[\[listing_fill\]\]/i.test(text)) return true;
  return AWHINA_NEXT_STEP_SIGNALS.some((s) => lower.includes(s.toLowerCase()));
}

export function hasDeadEndPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return AWHINA_DEAD_END_PHRASES.some((p) => lower.includes(p));
}

export function roboticPhraseCount(text: string): number {
  const lower = text.toLowerCase();
  return ROBOTIC_PHRASES.filter((p) => lower.includes(p)).length;
}

export function hasPricingStructure(text: string): boolean {
  return (
    /\b(quick sale|fair market|optimistic)\b/i.test(text) &&
    /\$\d/.test(text) &&
    /\bconfidence\b/i.test(text)
  );
}

export function scoreConversationReply(
  reply: string,
  opts: {
    requireNextStep?: boolean;
    requirePricing?: boolean;
    requireNavigate?: boolean;
    maxQuestions?: number;
    forbidDeadEnds?: boolean;
    maxRoboticPhrases?: number;
    listingFill?: unknown;
  } = {}
): ReplyQualityResult {
  const {
    requireNextStep = true,
    requirePricing = false,
    requireNavigate = false,
    maxQuestions = 1,
    forbidDeadEnds = true,
    maxRoboticPhrases = 0,
    listingFill,
  } = opts;

  const failures: string[] = [];
  const questionCount = countQuestions(reply);
  const wordCount = reply.trim().split(/\s+/).filter(Boolean).length;
  const hasNextStep = hasNextStepSignal(reply, listingFill);
  const hasDeadEnd = hasDeadEndPhrase(reply);
  const roboticScore = roboticPhraseCount(reply);

  if (forbidDeadEnds && hasDeadEnd) failures.push("dead_end_phrase");
  if (requireNextStep && !hasNextStep) failures.push("missing_next_step");
  if (requireNavigate && !/\[\[nav:/i.test(reply)) failures.push("missing_navigate");
  if (questionCount > maxQuestions) failures.push("over_questioning");
  if (hasOverQuestioning(reply) && maxQuestions <= 1) failures.push("form_like_interrogation");
  if (requirePricing && !hasPricingStructure(reply)) failures.push("missing_pricing_structure");
  if (roboticScore > maxRoboticPhrases) failures.push("robotic_tone");
  if (wordCount > 280) failures.push("too_verbose");
  if (/^Updated:/i.test(reply.trim())) failures.push("legacy_updated_prefix");
  if (/Started a draft for/i.test(reply)) failures.push("legacy_started_draft");
  if (/Facebook Marketplace|Trade Me listing/i.test(reply)) {
    failures.push("legacy_export_menu");
  }

  return {
    pass: failures.length === 0,
    failures,
    metrics: {
      questionCount,
      wordCount,
      hasNextStep,
      hasDeadEnd,
      roboticScore,
    },
  };
}
