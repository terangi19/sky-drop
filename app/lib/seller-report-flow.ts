import type { SkyAiHistoryItem } from "./sky-ai-types";
import { isListingDetailMessage } from "./sky-ai-listing-paste";
import { resolveSellerBySlugAdmin } from "./seller-profile-lookup.server";
import type { ResolvedSellerAdmin } from "./seller-profile-lookup.server";
import { REPORT_REASONS, type ReportReason } from "./report-constants";
import { hasReportFillContent, type SkyAiReportFill } from "./sky-ai-report-fill";
import { submitUserReportAdmin } from "./submit-report.server";
import {
  extractSellerUsernameFromMessage,
  hasRecentReportUserContext,
  sellerProfileDisplayLabel,
} from "./seller-profile-nav";
import {
  appendReportDraftTag,
  appendReportTargetTag,
  parseReportDraftTag,
  SKY_AI_REPORT_DRAFT_TAG,
  SKY_AI_REPORT_TARGET_TAG,
} from "./sky-ai-prompt";

const REPORT_TARGET_TAG = SKY_AI_REPORT_TARGET_TAG;

const REASON_ALIASES: [RegExp, ReportReason][] = [
  [/\bscam(?:med|mer|ming|s)?\b|\bfraud\b|\bripped\s+off\b/i, "Scam/fraud"],
  [/\bfake\s+(phone|item|product|listing|goods)\b|\bcounterfeit\b|\bnot\s+(real|genuine)\b/i, "Fake item"],
  [/\bfake\b/i, "Fake item"],
  [/\bsuspicious\s+price\b|\btoo\s+cheap\b/i, "Suspicious price"],
  [/\bstolen\s+images?\b|\bimage\s+theft\b/i, "Stolen images"],
  [/\bharassment\b|\babuse\b|\bthreat/i, "Harassment/abuse"],
];

const REPORT_NAV_FILL_SKIP =
  /^(report(\s+username)?|take\s+me|go\s+to|open|submit|review|yes|no|ok)\b/i;

type ReportDraft = {
  username: string;
  reason: ReportReason;
  details: string;
};

function normalizeReportTarget(raw: string): string | undefined {
  const u = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return u.length >= 3 && u.length <= 30 ? u : undefined;
}

export function extractReportTargetFromHistory(
  history: SkyAiHistoryItem[]
): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "assistant") continue;
    const content = history[i].content;
    const tagMatch = content.match(REPORT_TARGET_TAG);
    if (tagMatch?.[1]) {
      const u = normalizeReportTarget(tagMatch[1]);
      if (u) return u;
    }
    const draft = parseReportDraftTag(content);
    if (draft?.u) {
      const u = normalizeReportTarget(draft.u);
      if (u) return u;
    }
    const atMatch = content.match(/@([a-zA-Z0-9_]{3,30})\b/);
    if (atMatch?.[1] && /\bconfirm\b/i.test(content) && /\breport\b/i.test(content)) {
      const u = normalizeReportTarget(atMatch[1]);
      if (u) return u;
    }
    const boldMatch = content.match(/\breport\s+\*\*([^*]+)\*\*/i);
    if (boldMatch?.[1]) {
      const u = normalizeReportTarget(boldMatch[1]);
      if (u) return u;
    }
  }
  return undefined;
}

export function hasPendingReportReasonContext(history: SkyAiHistoryItem[]): boolean {
  const recent = history.slice(-8);
  return recent.some(
    (h) =>
      h.role === "assistant" &&
      (REPORT_TARGET_TAG.test(h.content) ||
        /\bwhich reason fits best\b/i.test(h.content) ||
        (/\bwhich reason\b/i.test(h.content) && /\breport\b/i.test(h.content)))
  );
}

export function hasPendingReportConfirmContext(history: SkyAiHistoryItem[]): boolean {
  const recent = history.slice(-8);
  return recent.some(
    (h) =>
      h.role === "assistant" &&
      (SKY_AI_REPORT_DRAFT_TAG.test(h.content) ||
        (/\bplease confirm\b/i.test(h.content) && /\breport\b/i.test(h.content)) ||
        (/\bonce you confirm\b/i.test(h.content) && /\breport\b/i.test(h.content)) ||
        (/\breply\s+\*\*submit\*\*/i.test(h.content) && /\breport\b/i.test(h.content)))
  );
}

function normalizeReasonInput(text: string): string {
  return text.trim().replace(/^[\s,.:;-]+/, "").replace(/[.!?]+$/g, "").trim();
}

export function extractReportReasonFromMessage(message: string): ReportReason | undefined {
  const text = normalizeReasonInput(message);
  if (!text) return undefined;

  for (const reason of REPORT_REASONS) {
    if (text.toLowerCase() === reason.toLowerCase()) return reason;
  }

  const forMatch = text.match(/\b(?:for|because|reason[:\s]+)\s+(.+?)$/i);
  const probe = normalizeReasonInput(forMatch?.[1] || text);

  for (const reason of REPORT_REASONS) {
    if (probe.toLowerCase() === reason.toLowerCase()) return reason;
  }

  for (const [pattern, reason] of REASON_ALIASES) {
    if (pattern.test(probe) || pattern.test(text)) return reason;
  }

  if (/^other$/i.test(probe) || /^other$/i.test(text)) return "Other";

  return undefined;
}

function extractReasonFromText(text: string): ReportReason | undefined {
  for (const reason of REPORT_REASONS) {
    if (text.toLowerCase().includes(reason.toLowerCase())) return reason;
  }
  for (const [pattern, reason] of REASON_ALIASES) {
    if (pattern.test(text)) return reason;
  }
  return undefined;
}

function extractReportDetails(message: string, reason: ReportReason): string | undefined {
  const text = message.trim();
  const reasonLower = reason.toLowerCase();
  const idx = text.toLowerCase().indexOf(reasonLower);
  if (idx < 0) return undefined;
  const after = text.slice(idx + reason.length).replace(/^[\s,.:;-]+/, "").trim();
  return after.length >= 3 ? after.slice(0, 2000) : undefined;
}

function collectReportUserMessages(
  history: SkyAiHistoryItem[],
  currentMessage = ""
): string[] {
  return [
    ...history.filter((h) => h.role === "user").map((h) => h.content.trim()),
    currentMessage.trim(),
  ].filter((m) => m.length > 0);
}

function inferReasonFromMessages(messages: string[]): ReportReason | undefined {
  for (const msg of [...messages].reverse()) {
    const fromRules = extractReportReasonFromMessage(msg);
    if (fromRules) return fromRules;
    const fromText = extractReasonFromText(msg);
    if (fromText) return fromText;
  }
  const combined = messages.join(" ");
  return extractReasonFromText(combined) || extractReportReasonFromMessage(combined);
}

function buildUserReportDetails(
  username: string,
  reason: ReportReason,
  userMessage: string
): string {
  const text = userMessage.trim();
  if (text.length >= 12 && !REPORT_NAV_FILL_SKIP.test(text)) {
    const onlyReason =
      extractReportReasonFromMessage(text) &&
      text.length < 48 &&
      !/\b(because|they|sold|fake|phone|got|scam|item|listing)\b/i.test(text);
    if (!onlyReason) return text.slice(0, 2000);
  }
  const afterReason = extractReportDetails(text, reason);
  if (afterReason && afterReason.length >= 8) return afterReason;
  return defaultReportDetails(username, reason);
}

function inferReportDetailsFromMessages(
  username: string,
  reason: ReportReason,
  messages: string[]
): string {
  for (const msg of [...messages].reverse()) {
    if (msg.length < 8 || REPORT_NAV_FILL_SKIP.test(msg)) continue;
    const details = buildUserReportDetails(username, reason, msg);
    if (details.length >= 12) return details;
  }
  return defaultReportDetails(username, reason);
}

async function resolveReportFillFromHistory(
  history: SkyAiHistoryItem[],
  currentMessage = ""
): Promise<SkyAiReportFill | null> {
  const username =
    extractReportTargetFromHistory(history) ||
    extractSellerUsernameFromMessage(currentMessage, history);
  if (!username) return null;

  const resolved = await resolveSellerBySlugAdmin(username);
  if (!resolved) return null;

  const userMessages = collectReportUserMessages(history, currentMessage);
  const reason = inferReasonFromMessages(userMessages);
  const fill: SkyAiReportFill = {
    reportedUserEmail: resolved.email,
    reportedUsername: resolved.username,
    reportedUserId: resolved.uid,
  };
  if (reason) {
    fill.reason = reason;
    fill.details = inferReportDetailsFromMessages(resolved.username, reason, userMessages);
  }

  return hasReportFillContent(fill) ? fill : null;
}

function extractReportDraftFromHistory(history: SkyAiHistoryItem[]): ReportDraft | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "assistant") continue;
    const parsed = parseReportDraftTag(history[i].content);
    if (parsed?.u && parsed.r && REPORT_REASONS.includes(parsed.r as ReportReason)) {
      const username = normalizeReportTarget(parsed.u);
      if (!username) continue;
      return {
        username,
        reason: parsed.r as ReportReason,
        details:
          parsed.d?.trim() ||
          defaultReportDetails(username, parsed.r as ReportReason),
      };
    }
  }

  const userMessages = collectReportUserMessages(history);
  const username = extractReportTargetFromHistory(history);
  if (!username) return null;

  const reason = inferReasonFromMessages(userMessages);
  if (!reason) return null;

  return {
    username,
    reason,
    details: inferReportDetailsFromMessages(username, reason, userMessages),
  };
}

function isReportSubmitConfirmation(message: string): boolean {
  const text = normalizeReasonInput(message).toLowerCase();
  return /^(submit|yes|confirm|send it|go ahead|do it|report them|send report)$/.test(text);
}

function isReportReviewIntent(message: string): boolean {
  return /\b(review|edit|open form|check form|my reports|fill the form|pre-?fill)\b/i.test(
    message
  );
}

function wantsReportFormOpen(message: string): boolean {
  return isReportReviewIntent(message) || isReportPageNavigateIntent(message);
}

/** User is in a report conversation (asked to report, picking reason, or confirming). */
function hasRecentReportFlowContext(history: SkyAiHistoryItem[]): boolean {
  if (hasRecentReportUserContext(history)) return true;
  if (hasPendingReportReasonContext(history)) return true;
  if (hasPendingReportConfirmContext(history)) return true;
  const recent = history.slice(-10);
  return recent.some(
    (h) =>
      (h.role === "user" && /\breport\b/i.test(h.content)) ||
      (h.role === "assistant" &&
        /\breport\b/i.test(h.content) &&
        (/\busername\b/i.test(h.content) ||
          /\breason\b/i.test(h.content) ||
          /\bprovide\b/i.test(h.content) ||
          /\bwhich reason\b/i.test(h.content)))
  );
}

/** "take me to the page", "open reports", etc. while reporting. */
function isReportPageNavigateIntent(message: string): boolean {
  const q = message.trim().toLowerCase();
  if (/\b(reports?|report\s+form|report\s+page)\b/i.test(message)) {
    return (
      /\b(take me|go to|open|show me|bring me)\b/i.test(message) || /\blet me\b/i.test(q)
    );
  }
  if (!/\b(take me|go to|open|show me|bring me)\b/i.test(message)) return false;
  return (
    /\b(the\s+)?page\b/i.test(message) ||
    /\bthere\b/.test(q) ||
    /\bthe\s+form\b/i.test(message)
  );
}

function isBareReportHelpRequest(message: string): boolean {
  const q = message.trim().toLowerCase();
  return (
    /^(i\s+want\s+to\s+)?report(\s+a\s+user|\s+someone|\s+them)?[.!?\s]*$/.test(q) ||
    /^i\s+need\s+to\s+report(\s+a\s+user|\s+someone)?[.!?\s]*$/.test(q) ||
    /^help\s+me\s+report(\s+a\s+user|\s+someone)?[.!?\s]*$/.test(q)
  );
}

async function navigateToReportsPage(
  history: SkyAiHistoryItem[],
  reporter: { uid: string; email: string } | null,
  currentMessage = ""
): Promise<SellerReportFlowResult> {
  if (!reporter) {
    return {
      reply: "Please log in first, then say **take me to Reports** again.",
      source: "rules",
    };
  }
  const draft = extractReportDraftFromHistory(history);
  if (draft) {
    const resolved = await resolveSellerBySlugAdmin(draft.username);
    if (resolved) {
      const label = sellerProfileDisplayLabel(resolved.username);
      return {
        reply: `Opening **Reports** with your report against **${label}** ready to review.`,
        navigateTo: "/reports",
        reportFill: buildReportFill(resolved, draft.reason, draft.details),
        source: "rules",
      };
    }
  }

  const fromHistory = await resolveReportFillFromHistory(history, currentMessage);
  if (fromHistory?.reportedUsername) {
    const label = sellerProfileDisplayLabel(fromHistory.reportedUsername);
    const reasonNote = fromHistory.reason ? ` — **${fromHistory.reason}**` : "";
    return {
      reply: `Opening **Reports** with **${label}**${reasonNote} pre-filled. Review and submit when ready.`,
      navigateTo: "/reports",
      reportFill: fromHistory,
      source: "rules",
    };
  }

  return {
    reply:
      "Taking you to **Reports** now. Give me a **username** and **reason** here (e.g. **report username Name for scam**), or fill in the form on that page.",
    navigateTo: "/reports",
    source: "rules",
  };
}

function formatReasonPrompt(label: string, username: string): string {
  const options = REPORT_REASONS.map((r) => `• ${r}`).join("\n");
  return appendReportTargetTag(
    `I'll report **${label}** for you. Which reason fits best?\n\n${options}\n\nReply with one of the options above (for example **Scam/fraud**), or add a short note after the reason.`,
    username
  );
}

function isReportIntent(message: string, history: SkyAiHistoryItem[]): boolean {
  return (
    /\breport\b/i.test(message) ||
    hasRecentReportUserContext(history) ||
    hasPendingReportReasonContext(history) ||
    hasPendingReportConfirmContext(history) ||
    isReportSubmitConfirmation(message) ||
    isReportReviewIntent(message)
  );
}

function isProfileNavigateIntent(message: string): boolean {
  return (
    /\b(take me to|go to|show me)\b/i.test(message) ||
    /\bopen\s+(?:the|their|@)\b/i.test(message) ||
    /\busername\s+is\b/i.test(message)
  );
}

function isExplicitSellerUsernameMessage(message: string): boolean {
  return /\b(?:report(?:ing)?\s+username|username\s+is|username\s+@|@\w{3,30})\b/i.test(
    message
  );
}

export type SellerReportFlowResult = {
  reply: string;
  navigateTo?: string;
  pendingReportTarget?: string;
  reportFill?: SkyAiReportFill;
  source: "rules";
};

function defaultReportDetails(username: string, reason: ReportReason): string {
  const handle = `@${username}`;
  switch (reason) {
    case "Scam/fraud":
      return `I'm reporting ${handle} because I believe they are running a scam or attempting fraud on Sky Drop.`;
    case "Fake item":
      return `I'm reporting ${handle} for selling or advertising fake, counterfeit, or misleading items.`;
    case "Suspicious price":
      return `I'm reporting ${handle} for suspicious or unrealistic pricing that may be a scam.`;
    case "Stolen images":
      return `I'm reporting ${handle} for using stolen, copied, or misleading photos in their listings.`;
    case "Harassment/abuse":
      return `I'm reporting ${handle} for harassment, threats, or abusive behaviour.`;
    default:
      return `I'm reporting ${handle} for behaviour that breaks Sky Drop marketplace safety guidelines.`;
  }
}

function buildReportFill(
  resolved: ResolvedSellerAdmin,
  reason: ReportReason,
  details?: string
): SkyAiReportFill {
  const extra = details?.trim();
  return {
    reportedUserEmail: resolved.email,
    reportedUsername: resolved.username,
    reportedUserId: resolved.uid,
    reason,
    details: extra || defaultReportDetails(resolved.username, reason),
  };
}

function formatConfirmPrompt(
  label: string,
  username: string,
  reason: ReportReason,
  details: string
): string {
  return appendReportDraftTag(
    `Please confirm — report **${label}** for **${reason}**.\n\n${details}\n\nReply **submit** to send the report, or **review** to open the form first.`,
    { u: username, r: reason, d: details }
  );
}

async function submitReportDraft(
  draft: ReportDraft,
  reporter: { uid: string; email: string }
): Promise<SellerReportFlowResult> {
  const resolved = await resolveSellerBySlugAdmin(draft.username);
  if (!resolved) {
    return {
      reply: `I couldn't find a seller with username **${draft.username}**. Check the spelling and try again.`,
      source: "rules",
    };
  }

  const result = await submitUserReportAdmin({
    reporterUserId: reporter.uid,
    reporterUserEmail: reporter.email,
    reportedUserId: resolved.uid,
    reportedUserEmail: resolved.email,
    reportedUsername: resolved.username,
    reason: draft.reason,
    details: draft.details,
  });

  const label = sellerProfileDisplayLabel(resolved.username);
  if (!result.ok) {
    return { reply: (result as { error: string }).error, source: "rules" };
  }

  return {
    reply: `Done — I've submitted your report against **${label}** for **${draft.reason}**. Our team will review it shortly.`,
    navigateTo: "/reports",
    source: "rules",
  };
}

/** Resolve username, collect reason, confirm, and submit or pre-fill reports via Āwhina. */
export async function trySellerReportFlowAsync(
  message: string,
  history: SkyAiHistoryItem[],
  reporter: { uid: string; email: string } | null
): Promise<SellerReportFlowResult | null> {
  if (
    isListingDetailMessage(message) &&
    !isExplicitSellerUsernameMessage(message) &&
    !hasRecentReportFlowContext(history)
  ) {
    return null;
  }

  const pendingConfirm = hasPendingReportConfirmContext(history);

  if (pendingConfirm && isReportSubmitConfirmation(message)) {
    if (!reporter) {
      return {
        reply: "Please log in first, then say **submit** again to send your report.",
        source: "rules",
      };
    }
    const draft = extractReportDraftFromHistory(history);
    if (draft) return submitReportDraft(draft, reporter);
    return {
      reply: "I lost track of that report — say **report username Whanau** and the reason again.",
      source: "rules",
    };
  }

  if (pendingConfirm && wantsReportFormOpen(message)) {
    const draft = extractReportDraftFromHistory(history);
    if (draft) {
      const resolved = await resolveSellerBySlugAdmin(draft.username);
      if (!resolved) {
        return {
          reply: `I couldn't find a seller with username **${draft.username}**. Check the spelling and try again.`,
          source: "rules",
        };
      }
      const label = sellerProfileDisplayLabel(resolved.username);
      return {
        reply: `Opening **Reports** with your report against **${label}** ready to review.`,
        navigateTo: "/reports",
        reportFill: buildReportFill(resolved, draft.reason, draft.details),
        source: "rules",
      };
    }
    const fromHistory = await resolveReportFillFromHistory(history, message);
    if (fromHistory) {
      return navigateToReportsPage(history, reporter, message);
    }
  }

  if (
    isReportPageNavigateIntent(message) &&
    (hasRecentReportFlowContext(history) || isReportIntent(message, history))
  ) {
    return navigateToReportsPage(history, reporter, message);
  }

  if (isBareReportHelpRequest(message)) {
    if (!reporter) {
      return {
        reply: "Please log in first, then tell me who you'd like to report.",
        source: "rules",
      };
    }
    return {
      reply:
        "Sure — give me their **username** and **reason** (e.g. **report username Whanau for scam**), or say **take me to Reports** to open the form.",
      source: "rules",
    };
  }

  const reportIntent = isReportIntent(message, history);
  const pendingReason = hasPendingReportReasonContext(history);
  const reason = extractReportReasonFromMessage(message);

  let username =
    extractSellerUsernameFromMessage(message, history) ||
    (pendingReason || pendingConfirm
      ? extractReportTargetFromHistory(history)
      : undefined);

  const inferredReason =
    reason || (pendingReason ? inferReasonFromMessages(collectReportUserMessages(history, message)) : undefined);

  if (pendingReason && inferredReason && username) {
    const resolved = await resolveSellerBySlugAdmin(username);
    if (!resolved) {
      return {
        reply: `I couldn't find a seller with username **${username}**. Check the spelling and try again.`,
        source: "rules",
      };
    }
    if (!reporter) {
      return {
        reply: "Please log in first, then tell me the username and reason again so I can prepare your report.",
        source: "rules",
      };
    }
    const details = buildUserReportDetails(resolved.username, inferredReason, message);
    const label = sellerProfileDisplayLabel(resolved.username);

    if (wantsReportFormOpen(message)) {
      return {
        reply: `Opening **Reports** with **${label}** — **${inferredReason}** pre-filled.`,
        navigateTo: "/reports",
        reportFill: buildReportFill(resolved, inferredReason, details),
        source: "rules",
      };
    }

    return {
      reply: formatConfirmPrompt(label, resolved.username, inferredReason, details),
      pendingReportTarget: resolved.username.toLowerCase(),
      source: "rules",
    };
  }

  if (pendingReason && !inferredReason) {
    if (wantsReportFormOpen(message)) {
      return navigateToReportsPage(history, reporter, message);
    }
    const target = username || extractReportTargetFromHistory(history);
    if (target) {
      const resolved = await resolveSellerBySlugAdmin(target);
      if (resolved) {
        const label = sellerProfileDisplayLabel(resolved.username);
        return {
          reply: `Please pick one of the reasons I listed for **${label}** (for example **Other** or **Scam/fraud**), or say **take me to Reports** to open the form.`,
          pendingReportTarget: resolved.username.toLowerCase(),
          source: "rules",
        };
      }
    }
  }

  if (!username) return null;

  if (!reportIntent && !pendingReason && !pendingConfirm) {
    if (!isProfileNavigateIntent(message)) return null;
    const resolved = await resolveSellerBySlugAdmin(username);
    if (!resolved) {
      return {
        reply: `I couldn't find a seller with username **${username}**. Open their listing and tap their name, or check the spelling.`,
        source: "rules",
      };
    }
    const label = sellerProfileDisplayLabel(resolved.username);
    return {
      reply: `Opening **${label}**'s profile now…`,
      navigateTo: `/seller/${resolved.username.toLowerCase()}`,
      source: "rules",
    };
  }

  const resolved = await resolveSellerBySlugAdmin(username);
  if (!resolved) {
    return {
      reply: `I couldn't find a seller with username **${username}**. Open their listing and tap their name, or check the spelling.`,
      source: "rules",
    };
  }

  const label = sellerProfileDisplayLabel(resolved.username);

  if (!reporter) {
    return {
      reply: `To report **${label}**, please log in first, then say something like **report username ${resolved.username}**.`,
      source: "rules",
    };
  }

  const finalReason = reason || extractReasonFromText(message);
  if (finalReason) {
    const details = buildUserReportDetails(resolved.username, finalReason, message);
    if (wantsReportFormOpen(message)) {
      return {
        reply: `Opening **Reports** with **${label}** — **${finalReason}** pre-filled.`,
        navigateTo: "/reports",
        reportFill: buildReportFill(resolved, finalReason, details),
        source: "rules",
      };
    }
    return {
      reply: formatConfirmPrompt(label, resolved.username, finalReason, details),
      pendingReportTarget: resolved.username.toLowerCase(),
      source: "rules",
    };
  }

  return {
    reply: formatReasonPrompt(label, resolved.username),
    pendingReportTarget: resolved.username.toLowerCase(),
    source: "rules",
  };
}
