import { REPORT_REASON_SET } from "./report-constants";

export type SkyAiReportFill = {
  reportedUserEmail?: string;
  reportedUsername?: string;
  reportedUserId?: string;
  reason?: string;
  details?: string;
};

export const PENDING_REPORT_FILL_KEY = "skyAiReportFillPending";
export const SKY_AI_REPORT_FILL_EVENT = "sky-ai-report-fill";

function pickString(raw: unknown, max = 2000): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  return s ? s.slice(0, max) : undefined;
}

export function normalizeSkyAiReportFill(raw: Record<string, unknown>): SkyAiReportFill {
  const out: SkyAiReportFill = {};
  const email = pickString(raw.reportedUserEmail, 200);
  if (email) out.reportedUserEmail = email;
  const username = pickString(raw.reportedUsername, 40);
  if (username) out.reportedUsername = username.replace(/^@/, "");
  const uid = pickString(raw.reportedUserId, 128);
  if (uid) out.reportedUserId = uid;
  const reason = pickString(raw.reason, 80);
  if (reason && REPORT_REASON_SET.has(reason)) out.reason = reason;
  const details = pickString(raw.details, 2000);
  if (details) out.details = details;
  return out;
}

export function hasReportFillContent(fill: SkyAiReportFill | null | undefined): boolean {
  if (!fill) return false;
  return !!(
    fill.reportedUserEmail?.trim() ||
    fill.reportedUsername?.trim() ||
    fill.reason?.trim() ||
    fill.details?.trim()
  );
}

export function mergeReportFill(
  current: SkyAiReportFill,
  incoming: SkyAiReportFill
): SkyAiReportFill {
  return normalizeSkyAiReportFill({ ...current, ...incoming });
}

export function queueReportFill(fill: SkyAiReportFill) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_REPORT_FILL_KEY, JSON.stringify(fill));
  } catch {
    /* ignore */
  }
}

export function consumePendingReportFill(): SkyAiReportFill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_REPORT_FILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_REPORT_FILL_KEY);
    const parsed = normalizeSkyAiReportFill(JSON.parse(raw));
    return hasReportFillContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function dispatchReportFill(fill: SkyAiReportFill) {
  if (typeof window === "undefined") return;
  queueReportFill(fill);
  window.dispatchEvent(
    new CustomEvent<SkyAiReportFill>(SKY_AI_REPORT_FILL_EVENT, { detail: fill })
  );
}
