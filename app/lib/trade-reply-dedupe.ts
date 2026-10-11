/**
 * Duplicate-reply guard for /api/manage-trade-post `reply`.
 *
 * Quick-reply chips ("Sent offer.", "Still available?", emoji) are plain chat replies, not offers.
 * Clicking the same chip twice used to store two replies, two inbox messages and two seller
 * notifications. A reply whose text matches one the same sender already left on the same post
 * within the window is treated as a repeat click: it is not stored and does not notify again.
 *
 * (Real offers go through /api/trade-offer, which already counts and notifies once per buyer
 * per post per 24h.)
 */

export const REPLY_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

function normalize(text: unknown): string {
  return typeof text === "string" ? text.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

export function isDuplicateReply(
  replies: ReadonlyArray<unknown>,
  by: string | null | undefined,
  text: string,
  nowMs: number,
  windowMs: number = REPLY_DUPLICATE_WINDOW_MS
): boolean {
  const sender = String(by || "").trim().toLowerCase();
  const wanted = normalize(text);
  if (!sender || !wanted) return false;
  return replies.some((r) => {
    if (!r || typeof r !== "object") return false;
    const entry = r as { by?: unknown; text?: unknown; at?: unknown };
    if (String(entry.by || "").trim().toLowerCase() !== sender) return false;
    if (normalize(entry.text) !== wanted) return false;
    const at = typeof entry.at === "string" ? Date.parse(entry.at) : NaN;
    return Number.isFinite(at) && nowMs - at >= 0 && nowMs - at < windowMs;
  });
}
