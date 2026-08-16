/**
 * Active-draft command grammar for sell conversations.
 * Commands operate on the ACTIVE listing draft — never become title/model/item seeds.
 */

export type ActiveDraftCommand =
  | "regenerate_description"
  | "improve_title"
  | "list_publish"
  | "save_draft"
  | "start_over"
  | "cancel";

export type ActiveDraftCommandResult = {
  commands: ActiveDraftCommand[];
  /** True when message is primarily an action (list it / publish it) with no product seed. */
  isActionOnly: boolean;
  /** Message with command phrases stripped — for fact/slot extraction. */
  residualMessage: string;
  /** Pronoun-only residue that must never become a title. */
  isPronounOnly: boolean;
};

const DESC_REWRITE_RE =
  /\b((?:please\s+)?(?:can\s+you\s+)?(?:write|rewrite|improve|update|regenerate|draft|make|create)\s+(?:me\s+)?(?:a\s+|the\s+)?(?:good\s+|better\s+|nicer\s+|premium\s+)?(?:description|desc)|(?:make|improve|rewrite|update)\s+(?:the\s+|my\s+)?description(?:\s+(?:better|good|nicer))?|description\s+(?:please|better)|write\s+(?:me\s+)?(?:a\s+)?(?:good\s+|better\s+)?desc(?:ription)?)\b/gi;

const TITLE_IMPROVE_RE =
  /\b((?:please\s+)?(?:can\s+you\s+)?(?:improve|rewrite|update|fix|make|give)\s+(?:me\s+|it\s+)?(?:a\s+|the\s+|my\s+)?(?:better\s+|clearer\s+|good\s+|shorter\s+|more\s+descriptive\s+)?title|(?:make|improve|rewrite|update)\s+(?:the\s+|my\s+)?title(?:\s+(?:better|clearer|good|shorter|more\s+descriptive))?|better\s+title|title\s+it)\b/gi;

const LIST_PUBLISH_RE =
  /\b((?:please\s+)?(?:just\s+)?(?:list|post|publish|create|put)\s+(?:it|this|that)(?:\s+up)?(?:\s+now)?|go\s+live|submit\s+(?:the\s+)?listing|make\s+it\s+live)\b/gi;

const SAVE_RE = /\b(save\s+(?:it|this|the\s+draft|draft))\b/gi;
const START_OVER_RE = /\b(start\s+over|reset\s+(?:the\s+)?(?:draft|listing)|new\s+listing\s+from\s+scratch)\b/gi;
const CANCEL_RE = /\b(cancel\s+(?:it|this|the\s+draft|listing)|never\s*mind|forget\s+it)\b/gi;

/** Bare pronouns / debris that must never become listing titles. */
const PRONOUN_ONLY_RE =
  /^(?:it|this|that|them|these|those)(?:\.{0,3}|!+|\?+)?$/i;

/** "list it" / "post this" style — action, not product. */
export function isListPublishActionMessage(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (LIST_PUBLISH_RE.test(t)) {
    LIST_PUBLISH_RE.lastIndex = 0;
    return true;
  }
  return /^(?:list|post|publish|create)\s+(?:it|this|that)\b/i.test(t);
}

export function isPronounTitleForbidden(token: string): boolean {
  const t = token.trim().replace(/[.!?]+$/g, "");
  return PRONOUN_ONLY_RE.test(t) || /^(?:it|this|that)$/i.test(t);
}

/**
 * Detect active-draft commands and peel them off so remaining text can fill slots/facts.
 */
export function detectActiveDraftCommands(message: string): ActiveDraftCommandResult {
  let residual = message.trim();
  const commands: ActiveDraftCommand[] = [];

  const take = (re: RegExp, cmd: ActiveDraftCommand) => {
    re.lastIndex = 0;
    if (re.test(residual)) {
      commands.push(cmd);
      residual = residual.replace(re, " ").replace(/\s+/g, " ").trim();
    }
    re.lastIndex = 0;
  };

  take(DESC_REWRITE_RE, "regenerate_description");
  take(TITLE_IMPROVE_RE, "improve_title");
  take(LIST_PUBLISH_RE, "list_publish");
  take(SAVE_RE, "save_draft");
  take(START_OVER_RE, "start_over");
  take(CANCEL_RE, "cancel");

  // Trailing punctuation / connectors left by stripping
  residual = residual
    .replace(/^[,\s.;:\-–—]+|[,\s.;:\-–—]+$/g, "")
    .replace(/\b(?:and|then|also|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const isPronounOnly = !residual || isPronounTitleForbidden(residual);
  const isActionOnly =
    commands.includes("list_publish") ||
    commands.includes("save_draft") ||
    commands.includes("cancel") ||
    commands.includes("start_over")
      ? isPronounOnly || residual.length === 0
      : commands.length > 0 && isPronounOnly;

  return {
    commands: [...new Set(commands)],
    isActionOnly: Boolean(commands.length) && (isActionOnly || residual.length === 0),
    residualMessage: isPronounOnly ? "" : residual,
    isPronounOnly,
  };
}

/** True when message has draft-command language (even mid-compound). */
export function hasActiveDraftCommandLanguage(message: string): boolean {
  return detectActiveDraftCommands(message).commands.length > 0;
}
