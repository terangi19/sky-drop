/**
 * Temporary safe description mode — deterministic factual composer only.
 * Re-enable premium AI writer by setting AWHINA_SAFE_DESCRIPTION_MODE=0 after
 * the fact/evidence regression suite passes.
 */
export const AWHINA_SAFE_DESCRIPTION_MODE =
  process.env.AWHINA_SAFE_DESCRIPTION_MODE !== "0";

export function shouldUseSafeDescriptionMode(): boolean {
  return AWHINA_SAFE_DESCRIPTION_MODE;
}
