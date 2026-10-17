/** Public-facing identity — never show raw emails in UI copy. */

import { getListingOwnerId, type ListingOwnerFields } from "./listing-owner";

/**
 * Email matcher used to find and redact addresses in free text.
 *
 * The plain global form, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, is
 * quadratic on a long run of local-part characters with no "@" (it rescans the
 * run from every start offset; 50k chars took ~2.4 s). findEmailMatches() returns
 * exactly the same matches in linear time:
 *  - a match that starts mid-run implies one from the run start (the domain class
 *    is a subset of the local class), so after the previous match only two starts
 *    can win: the scan position itself (EMAIL_AT_RE, sticky) or a position whose
 *    previous char is not a local-part char (EMAIL_SCAN_RE, lookbehind).
 * There is no length cap on purpose: a cap would leave emails past it unredacted.
 */
const EMAIL_BODY = "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}";
const EMAIL_AT_RE = new RegExp(EMAIL_BODY, "y");
const EMAIL_SCAN_RE = new RegExp(`(?<![a-zA-Z0-9._%+-])${EMAIL_BODY}`, "g");

/** Same matches, in order, as `text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)`. */
export function findEmailMatches(text: string): Array<{ index: number; match: string }> {
  const out: Array<{ index: number; match: string }> = [];
  if (!text || text.indexOf("@") === -1) return out;
  let pos = 0;
  while (pos < text.length) {
    EMAIL_AT_RE.lastIndex = pos;
    let m = EMAIL_AT_RE.exec(text);
    if (!m) {
      EMAIL_SCAN_RE.lastIndex = pos;
      m = EMAIL_SCAN_RE.exec(text);
      if (!m) break;
    }
    out.push({ index: m.index, match: m[0] });
    pos = m.index + m[0].length;
  }
  return out;
}

function replaceEmails(text: string, fn: (match: string) => string): string {
  const matches = findEmailMatches(text);
  if (matches.length === 0) return text;
  let out = "";
  let last = 0;
  for (const { index, match } of matches) {
    out += text.slice(last, index) + fn(match);
    last = index + match.length;
  }
  return out + text.slice(last);
}

export type PublicProfileFields = {
  username?: string;
  displayName?: string;
};

export type SellerLinkFields = PublicProfileFields &
  ListingOwnerFields & {
    buyerUsername?: string;
    reportedUsername?: string;
    reporterUsername?: string;
    sellerUsername?: string;
    sellerName?: string;
    sellerEmail?: string;
    buyerEmail?: string;
    buyerId?: string;
    reportedUserId?: string;
    reporterUserId?: string;
    email?: string;
    name?: string;
  };

export function isEmailLike(value: string | undefined | null): boolean {
  if (!value || typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** @username → username, else unchanged */
export function stripAtPrefix(handle: string): string {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}

/**
 * Public handle for chat, notifications, and system messages.
 * Falls back to "Buyer" if no username set.
 */
export function publicHandleFromProfile(
  profile: PublicProfileFields | null | undefined,
  fallback = "Buyer"
): string {
  const username = String(profile?.username || "").trim();
  if (username && !isEmailLike(username)) {
    return username.startsWith("@") ? username : `@${username}`;
  }
  return fallback;
}

/** Stored on purchases as buyerName (no @ prefix). */
export function publicNameFromProfile(
  profile: PublicProfileFields | null | undefined,
  fallback = "Buyer"
): string {
  const handle = publicHandleFromProfile(profile, fallback);
  return handle === fallback ? fallback : stripAtPrefix(handle);
}

/** Path segment for `/seller/[slug]` — username first, then UID. Never expose email publicly. */
export function sellerProfileSlug(
  fields: SellerLinkFields | null | undefined
): string {
  const emailLocalParts = new Set(
    [fields?.sellerEmail, fields?.buyerEmail, fields?.email]
      .map((raw) => String(raw || "").trim())
      .filter((v) => v && isEmailLike(v))
      .map((e) => e.split("@")[0]?.toLowerCase())
      .filter(Boolean)
  );

  for (const raw of [
    fields?.sellerUsername,
    fields?.buyerUsername,
    fields?.reportedUsername,
    fields?.reporterUsername,
    fields?.username,
  ]) {
    const v = String(raw || "").trim();
    if (!v || isEmailLike(v)) continue;
    const handle = stripAtPrefix(v);
    if (emailLocalParts.has(handle.toLowerCase())) continue;
    return handle;
  }
  for (const raw of [
    fields?.sellerId,
    fields?.buyerId,
    fields?.reportedUserId,
    fields?.reporterUserId,
    fields?.userId,
    fields?.ownerId,
    fields?.sellerUid,
    fields?.uid,
  ]) {
    const v = String(raw || "").trim();
    if (v) return v;
  }
  return "";
}

/**
 * True for values that look like Firebase Auth UIDs (not public usernames).
 * Firebase UIDs are typically 28 chars of [A-Za-z0-9]. Do NOT treat shorter
 * alphanumeric handles (e.g. philbrewerton868, e2esellermsjiq5sv) as UIDs —
 * that false-reject caused listing cards to show "Seller" after live enrichment.
 */
export function looksLikeFirebaseUid(value: string | undefined | null): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^uid[-_]/i.test(raw)) return true;
  // Firebase Auth UIDs are almost always 28 chars; allow a narrow band for variants.
  return /^[A-Za-z0-9]{27,29}$/.test(raw);
}

/** Heading text on seller pages — never an email address. */
export function sellerProfileDisplayName(
  fields: SellerLinkFields | null | undefined,
  fallback = "Seller"
): string {
  const fromCanonical = getSellerDisplayName(
    {
      username: fields?.username,
      displayName: fields?.displayName || fields?.name,
      sellerUsername: fields?.sellerUsername,
      sellerName: fields?.sellerName,
    },
    ""
  );
  if (fromCanonical) return fromCanonical;

  const slug = sellerProfileSlug(fields);
  if (!slug || isEmailLike(slug) || looksLikeFirebaseUid(slug)) return fallback;
  return slug;
}

export function isSafePublicHandle(value: string | undefined | null): string | null {
  const raw = String(value || "").trim();
  if (!raw || isEmailLike(raw)) return null;
  const handle = stripAtPrefix(raw);
  if (!handle || isEmailLike(handle)) return null;
  // Reject bare Firebase-style UIDs used as labels — not human identity.
  if (looksLikeFirebaseUid(handle)) return null;
  return handle;
}

/**
 * Canonical public marketplace seller label.
 * Priority: username → displayName → legacy sellerUsername → sellerName → fallback.
 * Never email. Username is the Sky Drop public handle.
 */
export function getSellerDisplayName(
  input: {
    displayName?: string | null;
    username?: string | null;
    sellerName?: string | null;
    sellerUsername?: string | null;
  } | null | undefined,
  fallback = "Seller"
): string {
  if (!input) return fallback;
  for (const raw of [
    input.username,
    input.displayName,
    input.sellerUsername,
    input.sellerName,
  ]) {
    const safe = isSafePublicHandle(raw);
    if (safe) return safe;
  }
  return fallback;
}

function lookupKeyedValue(
  map: Record<string, string> | null | undefined,
  ...keys: Array<string | undefined | null>
): string | null {
  if (!map) return null;
  for (const key of keys) {
    const k = String(key || "").trim();
    if (!k) continue;
    const safe = isSafePublicHandle(map[k]);
    if (safe) return safe;
  }
  return null;
}

/**
 * Listing-card seller label. Prefers live public-profile identity over stale listing docs.
 * Never falls back to email.
 *
 * Priority:
 * 1. live sellerHandles[ownerId|email] (username — canonical marketplace identity)
 * 2. live displayNames[ownerId|email] (optional friendly name)
 * 3. listing username → displayName → sellerUsername → sellerName
 * 4. fallback ("Seller")
 */
export function resolveSellerCardDisplayName(
  fields: SellerLinkFields | null | undefined,
  sellerHandles?: Record<string, string> | null,
  fallback = "Seller",
  sellerDisplayNames?: Record<string, string> | null
): string {
  const ownerId = getListingOwnerId(fields);
  const email = String(fields?.sellerEmail || "").trim();

  const liveHandle = lookupKeyedValue(sellerHandles, ownerId, email);
  if (liveHandle) return liveHandle;

  const liveDisplay = lookupKeyedValue(sellerDisplayNames, ownerId, email);
  if (liveDisplay) return liveDisplay;

  const emailLocal =
    email && isEmailLike(email)
      ? email.split("@")[0]?.toLowerCase() || ""
      : "";

  const rejectEmailLocal = (raw: string | null | undefined): string | null => {
    const safe = isSafePublicHandle(raw);
    if (!safe) return null;
    if (emailLocal && safe.toLowerCase() === emailLocal) return null;
    return safe;
  };

  return getSellerDisplayName(
    {
      username: rejectEmailLocal(fields?.username),
      displayName: fields?.displayName || fields?.name,
      sellerUsername: rejectEmailLocal(fields?.sellerUsername),
      sellerName: fields?.sellerName,
    },
    fallback
  );
}

/** Profile path segment for cards — prefer live username handle, never email. */
export function resolveSellerCardProfileSlug(
  fields: SellerLinkFields | null | undefined,
  sellerHandles?: Record<string, string> | null
): string {
  const ownerId = getListingOwnerId(fields);
  const email = String(fields?.sellerEmail || "").trim();
  const live = lookupKeyedValue(sellerHandles, ownerId, email);
  if (live) return live;
  return sellerProfileSlug(fields);
}

/** Query value for `/messages?user=` — username first, then UID, then email as fallback. */
export function sellerMessageTarget(
  fields: SellerLinkFields | null | undefined
): string {
  const emails = [
    fields?.sellerEmail,
    fields?.buyerEmail,
    fields?.email,
  ]
    .map((raw) => String(raw || "").trim())
    .filter((v) => v && isEmailLike(v));
  const emailLocalParts = new Set(
    emails.map((e) => e.split("@")[0]?.toLowerCase()).filter(Boolean)
  );

  for (const raw of [
    fields?.sellerUsername,
    fields?.buyerUsername,
    fields?.reportedUsername,
    fields?.reporterUsername,
    fields?.username,
  ]) {
    const v = String(raw || "").trim();
    if (!v || isEmailLike(v)) continue;
    const handle = stripAtPrefix(v);
    // Email local-part placeholders are not real handles — skip so messaging
    // can resolve via uid/email instead of writing undeliverable participants.
    if (emailLocalParts.has(handle.toLowerCase())) continue;
    return handle;
  }
  for (const raw of [
    fields?.sellerId,
    fields?.buyerId,
    fields?.reportedUserId,
    fields?.reporterUserId,
    fields?.userId,
    fields?.ownerId,
    fields?.sellerUid,
    fields?.uid,
  ]) {
    const v = String(raw || "").trim();
    if (v) return v;
  }
  // Fallback to email for messaging (acceptable since messages page handles emails)
  if (emails[0]) return emails[0];
  return "";
}

export function sellerMessagesUrl(
  fields: SellerLinkFields | null | undefined,
  listingId?: string | null,
  extraParams?: Record<string, string | number | boolean | null | undefined>
): string {
  const target = sellerMessageTarget(fields);
  const params = new URLSearchParams();
  if (target) params.set("user", target);
  if (listingId) params.set("listing", listingId);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
  }
  const qs = params.toString();
  return qs ? `/messages?${qs}` : "/messages";
}

export function resolveStoredBuyerName(
  stored: string | undefined | null,
  profile: PublicProfileFields | null | undefined
): string {
  if (stored && !isEmailLike(stored)) {
    return stripAtPrefix(stored);
  }
  return publicNameFromProfile(profile);
}

export function extractEmailsFromText(text: string): string[] {
  return [...new Set(findEmailMatches(text).map((m) => m.match))];
}

/**
 * Replace emails in message/notification text with @handles from a lookup map.
 * Unknown emails become "Buyer" (not the local-part of the address).
 */
export function sanitizePublicText(
  text: string,
  emailToHandle: Record<string, string>
): string {
  if (!text) return text;
  let out = text;
  for (const [email, handle] of Object.entries(emailToHandle)) {
    if (!email) continue;
    const display =
      handle === "Buyer" || handle === "User"
        ? handle
        : handle.startsWith("@")
          ? handle
          : `@${handle}`;
    out = out.split(email).join(display);
  }
  out = replaceEmails(out, (match) => {
    const mapped = emailToHandle[match];
    if (mapped) {
      return mapped === "Buyer" || mapped === "User"
        ? mapped
        : mapped.startsWith("@")
          ? mapped
          : `@${mapped}`;
    }
    return "Buyer";
  });
  return out;
}

/** Resolve seller meta maps by owner UID first, then email. */
export function lookupSellerMetaValue<T>(
  map: Record<string, T> | null | undefined,
  fields: SellerLinkFields | null | undefined
): T | undefined {
  if (!map || !fields) return undefined;
  const ownerId = getListingOwnerId(fields);
  if (ownerId && map[ownerId] !== undefined) return map[ownerId];
  const email = String(fields.sellerEmail || "").trim();
  if (email && map[email] !== undefined) return map[email];
  return undefined;
}
