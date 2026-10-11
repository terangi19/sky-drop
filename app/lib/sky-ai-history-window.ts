/**
 * How many stored chat messages the Sky AI route feeds back into the model
 * context. Sell/profile surfaces keep a few more turns for follow-ups.
 *
 * `/api/sky-ai` used to read the last 30 messages from Firestore (30 billed
 * reads) and then `slice(-keep)` down to this window. Reading only `keep`
 * messages returns the identical rows (same orderBy + limitToLast ordering)
 * for 20–24 fewer reads per signed-in follow-up turn once a chat is long.
 */
export function skyAiHistoryKeep(pathname: string): number {
  return pathname.startsWith("/post/ai") || pathname.startsWith("/profile") ? 10 : 6;
}
