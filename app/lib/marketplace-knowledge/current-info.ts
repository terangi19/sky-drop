/**
 * Current-info / web lookup LAYER — controlled capability stub.
 * Static model knowledge must NEVER be presented as live market/spec truth.
 */

export type CurrentInfoLookupRequest = {
  domain: string;
  query: string;
  fields: string[];
};

export type CurrentInfoLookupResult = {
  available: boolean;
  /** Always false in stub — forces honest "needs checking" */
  resolved: boolean;
  message: string;
  fieldsNeedingCheck: string[];
};

/**
 * Stub: no live lookup wired yet.
 * Callers must surface needs-checking rather than inventing values.
 */
export function lookupCurrentInfo(
  request: CurrentInfoLookupRequest
): CurrentInfoLookupResult {
  const fields = request.fields.filter(Boolean);
  return {
    available: false,
    resolved: false,
    message:
      fields.length > 0
        ? `${fields.join(", ")} need checking — live market/spec lookup is not available yet.`
        : "Current market/spec lookup is not available yet.",
    fieldsNeedingCheck: fields,
  };
}

export function markNeedsCurrentCheck(
  fields: string[],
  reason = "static knowledge is not live"
): { fields: string[]; note: string } {
  return {
    fields: fields.filter(Boolean),
    note: `Needs checking (${reason}).`,
  };
}
