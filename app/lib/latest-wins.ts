/**
 * "Latest request wins" guard for overlapping async fetches that all write the same state.
 *
 *   const guard = createLatestWins();           // once (useRef)
 *   const isLatest = guard.begin();             // at the start of each fetch
 *   const data = await load();
 *   if (!isLatest()) return;                    // a newer fetch started meanwhile: drop this stale result
 *   setState(data);
 *
 * Used by the trade-feed posts list: the 60s poll and the forced refresh after the user's own
 * create can overlap, and an older response must never overwrite a newer one. After a delete the
 * post is removed locally and `invalidate()` drops any poll that may have read it before the delete.
 */
export function createLatestWins() {
  let seq = 0;
  return {
    begin(): () => boolean {
      const mine = ++seq;
      return () => mine === seq;
    },
    /** Mark every fetch already in flight as stale without starting a new one. */
    invalidate(): void {
      seq++;
    },
  };
}
