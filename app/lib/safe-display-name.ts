/**
 * Public labels shown to other people.
 * Email addresses and email-local-part placeholders become a neutral fallback.
 * Profile usernames that are the public /seller slug are handled separately
 * (see resolvePublicProfileName) so seller cards can keep an auto-assigned handle.
 *
 * Email-likeness matches isEmailLike in public-display.ts. The check is local
 * so this module can be imported by public-display without a cycle.
 */

export const SAFE_NAME_FALLBACK = "Sky Drop member";

const MAX_PUBLIC_NAME = 60;
/**
 * Cap before any regex or comparison loop. Callers may pass uncapped request
 * bodies; a few hundred characters is enough for a real name, and the old
 * unanchored email scan was quadratic on long inputs that could never match.
 */
const MAX_NAME_INPUT = 200;

function capNameInput(name: string): string {
  return name.length > MAX_NAME_INPUT ? name.slice(0, MAX_NAME_INPUT) : name;
}

function isEmailLikeValue(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Same algorithm as defaultUsernameFromEmail, without importing username.ts (firebase client). */
function defaultUsernameFromEmailLocal(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[^a-zA-Z0-9_]/g, "");
  const withLetterPrefix = /^[a-zA-Z]/.test(local) ? local : `user${local}`;
  const candidate = (withLetterPrefix || "user").slice(0, 20);
  return candidate.length >= 3 ? candidate : `${candidate}user`.slice(0, 20);
}

function normalizeCandidate(name: string): string {
  let value = name.trim().normalize("NFC");
  if (value.startsWith("@")) value = value.slice(1);
  return value.trim();
}

/**
 * True when `name` is an email, contains "@", or matches the local part of
 * `email` (raw, plus-tag stripped, sanitised, or the auto username including
 * collision suffixes 2..20).
 *
 * Without an email to compare, a plain handle such as "jsmith" is NOT flagged.
 * Callers that have the address (server writes, migration) must pass it.
 * Unicode / Māori names are kept unless they equal the email local part.
 */
export function isEmailDerivedName(name: unknown, email?: string | null): boolean {
  if (typeof name !== "string") return false;
  const capped = capNameInput(name);
  if (!capped.trim()) return false;
  const candidate = normalizeCandidate(capped);
  if (!candidate) return false;
  if (candidate.includes("@") || isEmailLikeValue(candidate) || isEmailLikeValue(capped)) {
    return true;
  }
  if (typeof email !== "string" || !email.includes("@")) return false;

  const emailNfc = email.normalize("NFC");
  const local = (emailNfc.split("@")[0] || "").trim().toLowerCase();
  const localNoTag = (local.split("+")[0] || "").trim();
  const sanitised = local.replace(/[^a-zA-Z0-9_]/g, "");
  const sanitisedNoTag = localNoTag.replace(/[^a-zA-Z0-9_]/g, "");
  const generated = defaultUsernameFromEmailLocal(emailNfc).toLowerCase();
  const nameKey = candidate.toLowerCase();

  const keys = new Set<string>();
  for (const key of [local, localNoTag, sanitised, sanitisedNoTag, generated]) {
    if (key) keys.add(key);
  }
  if (generated) {
    for (let n = 2; n <= 20; n++) {
      const suffix = String(n);
      keys.add(`${generated}${suffix}`);
      const trimmed = `${generated.slice(0, Math.max(0, 30 - suffix.length))}${suffix}`;
      if (trimmed) keys.add(trimmed);
    }
  }
  return keys.has(nameKey);
}

/**
 * True only for the auto-assigned /seller slug (defaultUsernameFromEmail and
 * collision suffixes 2..20). A raw local part that still has dots or plus-tags
 * ("john.smith", "jane+shop") is email-derived but NOT this slug.
 */
export function isAutoAssignedUsername(name: unknown, email?: string | null): boolean {
  if (typeof name !== "string" || typeof email !== "string" || !email.includes("@")) return false;
  const candidate = normalizeCandidate(capNameInput(name)).toLowerCase();
  if (!candidate || candidate.includes("@")) return false;
  const base = defaultUsernameFromEmailLocal(email.normalize("NFC")).toLowerCase();
  if (!base) return false;
  if (candidate === base) return true;
  for (let n = 2; n <= 20; n++) {
    const suffix = String(n);
    if (candidate === `${base}${suffix}`) return true;
    if (candidate === `${base.slice(0, Math.max(0, 30 - suffix.length))}${suffix}`) return true;
  }
  return false;
}

function cleanedPublicLabel(name: unknown): string {
  if (typeof name !== "string") return "";
  const candidate = normalizeCandidate(capNameInput(name));
  if (!candidate || candidate.includes("@") || isEmailLikeValue(candidate)) return "";
  return candidate.slice(0, MAX_PUBLIC_NAME);
}

export function safeDisplayName(
  name: unknown,
  email?: string | null,
  fallback = SAFE_NAME_FALLBACK
): string {
  const cleaned = cleanedPublicLabel(name);
  if (!cleaned || isEmailDerivedName(name, email)) return fallback;
  return cleaned;
}

/**
 * Author label for shouts, replies, Q&A, reviews and notifications.
 * Display name if it is safe, else a user-chosen username, else fallback.
 * An auto-assigned username (equal to the email-derived default) is not used.
 */
export function resolvePublicAuthorName(
  input: { displayName?: unknown; username?: unknown; email?: string | null },
  fallback = SAFE_NAME_FALLBACK
): string {
  const display = safeDisplayName(input.displayName, input.email, "");
  if (display) return display;
  const username = safeDisplayName(input.username, input.email, "");
  if (username) return username;
  return fallback;
}

/**
 * Seller-facing public label (profile APIs, seller cards).
 * Display name if it is not an email, then the profile username even when it
 * was auto-assigned from the email, then fallback. Never returns a value
 * containing "@".
 */
export function resolvePublicProfileName(
  input: { displayName?: unknown; username?: unknown; email?: string | null },
  fallback = SAFE_NAME_FALLBACK
): string {
  const display = safeDisplayName(input.displayName, input.email, "");
  if (display) return display;
  const username = cleanedPublicLabel(input.username);
  if (username) return username;
  return fallback;
}

/** Empty when the candidate is blank or email-derived. Otherwise trimmed, max 60. */
export function sanitizeAuthorNameForWrite(
  candidate: unknown,
  email: string | null | undefined
): string {
  const cleaned = cleanedPublicLabel(candidate);
  if (!cleaned || isEmailDerivedName(candidate, email)) return "";
  return cleaned;
}
