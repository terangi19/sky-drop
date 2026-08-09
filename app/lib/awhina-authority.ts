/**
 * Unified field authority for Āwhina.
 * Priority: USER_CORRECTED > USER_CONFIRMED > USER > EDITED > IMAGE(readable) >
 * LOCAL_DATA > LOOKUP > AWHINA/MODEL > DEFAULT.
 *
 * Later AI/vision MUST NEVER silently overwrite a USER* fact.
 */

export type FieldAuthority =
  | "USER_CORRECTED"
  | "USER_CONFIRMED"
  | "USER"
  | "EDITED_EXISTING_LISTING"
  | "IMAGE_READABLE"
  | "IMAGE"
  | "LOCAL_DATA"
  | "LOOKUP"
  | "AWHINA"
  | "MODEL_INFERENCE"
  | "DEFAULT_UNTOUCHED";

/** Numeric rank — higher wins. Equal rank: prefer incoming only when forced. */
export const AUTHORITY_RANK: Record<FieldAuthority, number> = {
  USER_CORRECTED: 120,
  USER_CONFIRMED: 110,
  USER: 100,
  EDITED_EXISTING_LISTING: 95,
  IMAGE_READABLE: 88,
  IMAGE: 85,
  LOCAL_DATA: 80,
  LOOKUP: 60,
  AWHINA: 40,
  MODEL_INFERENCE: 20,
  DEFAULT_UNTOUCHED: 0,
};

export function isUserAuthority(a: FieldAuthority | undefined): boolean {
  return (
    a === "USER_CORRECTED" ||
    a === "USER_CONFIRMED" ||
    a === "USER" ||
    a === "EDITED_EXISTING_LISTING"
  );
}

/** Locked identity survives re-photo / AI fills. */
export function isLockedUserAuthority(a: FieldAuthority | undefined): boolean {
  return (
    a === "USER_CORRECTED" ||
    a === "USER_CONFIRMED" ||
    a === "USER" ||
    a === "EDITED_EXISTING_LISTING"
  );
}

export function mayOverwriteAuthority(
  existing: FieldAuthority | undefined,
  incoming: FieldAuthority,
  opts?: { force?: boolean }
): boolean {
  if (opts?.force && isUserAuthority(incoming)) return true;
  if (!existing) return true;
  if (isLockedUserAuthority(existing) && !isUserAuthority(incoming)) {
    return false;
  }
  return AUTHORITY_RANK[incoming] >= AUTHORITY_RANK[existing];
}

export function preferAuthority(
  a: FieldAuthority,
  b: FieldAuthority
): FieldAuthority {
  return AUTHORITY_RANK[a] >= AUTHORITY_RANK[b] ? a : b;
}

/** Map UI listing provenance → authority. */
export function listingProvenanceToAuthority(
  p: string | undefined
): FieldAuthority {
  switch (p) {
    case "USER_CORRECTED":
      return "USER_CORRECTED";
    case "USER_CONFIRMED":
      return "USER_CONFIRMED";
    case "USER":
      return "USER";
    case "EDITED_EXISTING_LISTING":
      return "EDITED_EXISTING_LISTING";
    case "IMAGE":
      return "IMAGE";
    case "AWHINA":
      return "AWHINA";
    case "DEFAULT_UNTOUCHED":
      return "DEFAULT_UNTOUCHED";
    default:
      return "DEFAULT_UNTOUCHED";
  }
}

/** Map knowledge/fact provenance → authority. */
export function factProvenanceToAuthority(
  p: string | undefined,
  opts?: { corrected?: boolean; confirmed?: boolean; readable?: boolean }
): FieldAuthority {
  if (opts?.corrected) return "USER_CORRECTED";
  if (opts?.confirmed) return "USER_CONFIRMED";
  switch (p) {
    case "USER":
      return "USER";
    case "IMAGE":
      return opts?.readable ? "IMAGE_READABLE" : "IMAGE";
    case "LOCAL_DATA":
      return "LOCAL_DATA";
    case "LOOKUP":
      return "LOOKUP";
    case "MODEL_INFERENCE":
      return "MODEL_INFERENCE";
    case "AWHINA":
      return "AWHINA";
    default:
      return "MODEL_INFERENCE";
  }
}

/** Authority → UI listing provenance (client applyFill). */
export function authorityToListingProvenance(
  a: FieldAuthority
):
  | "USER"
  | "USER_CONFIRMED"
  | "USER_CORRECTED"
  | "AWHINA"
  | "IMAGE"
  | "EDITED_EXISTING_LISTING"
  | "DEFAULT_UNTOUCHED" {
  switch (a) {
    case "USER_CORRECTED":
      return "USER_CORRECTED";
    case "USER_CONFIRMED":
      return "USER_CONFIRMED";
    case "USER":
      return "USER";
    case "EDITED_EXISTING_LISTING":
      return "EDITED_EXISTING_LISTING";
    case "IMAGE":
    case "IMAGE_READABLE":
      return "IMAGE";
    case "AWHINA":
    case "LOCAL_DATA":
    case "LOOKUP":
    case "MODEL_INFERENCE":
      return "AWHINA";
    default:
      return "DEFAULT_UNTOUCHED";
  }
}
