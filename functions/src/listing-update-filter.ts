function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null && b == null) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * True when the listing write only touched `views` (page-view increment).
 * Price-drop notifications must not run for view-count noise.
 */
export function isViewsOnlyListingUpdate(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === "views") continue;
    if (!valuesEqual(before[key], after[key])) return false;
  }
  return true;
}
