/** Public-facing identity — never show raw emails in UI copy. */

import { getListingOwnerId, type ListingOwnerFields } from "./listing-owner";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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

/** Heading text on seller pages — never an email address. */
export function sellerProfileDisplayName(
  fields: SellerLinkFields | null | undefined,
  fallback = "Seller"
): string {
  const fromCanonical = getSellerDisplayName(
    {
      displayName: fields?.displayName || fields?.name,
      username: fields?.username || fields?.sellerUsername,
      sellerName: fields?.sellerName,
    },
    ""
  );
  if (fromCanonical) return fromCanonical;

  const slug = sellerProfileSlug(fields);
  const looksLikeUid =
    !slug ||
    isEmailLike(slug) ||
    /^[A-Za-z0-9_-]{16,}$/.test(slug) ||
    /^uid[-_]/i.test(slug);
  return looksLikeUid ? fallback : slug;
}

function isSafePublicHandle(value: string | undefined | null): string | null {
  const raw = String(value || "").trim();
  if (!raw || isEmailLike(raw)) return null;
  const handle = stripAtPrefix(raw);
  if (!handle || isEmailLike(handle)) return null;
  // Reject bare Firebase-style UIDs used as labels — not human identity.
  if (/^[A-Za-z0-9_-]{16,}$/.test(handle) || /^uid[-_]/i.test(handle)) return null;
  return handle;
}

/**
 * Canonical public seller label.
 * Priority: displayName → username → legacy sellerName → sellerUsername → fallback.
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
    input.displayName,
    input.username,
    input.sellerName,
    input.sellerUsername,
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
 * 1. live displayNames[ownerId|email]
 * 2. live sellerHandles[ownerId|email] (username / best label)
 * 3. listing displayName / username / sellerName / sellerUsername
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

  const liveDisplay = lookupKeyedValue(sellerDisplayNames, ownerId, email);
  if (liveDisplay) return liveDisplay;

  const liveHandle = lookupKeyedValue(sellerHandles, ownerId, email);
  if (liveHandle) return liveHandle;

  const emailLocal =
    email && isEmailLike(email)
      ? email.split("@")[0]?.toLowerCase() || ""
      : "";

  const listingUsername = isSafePublicHandle(fields?.sellerUsername || fields?.username);
  const listingUsernameOk =
    listingUsername &&
    (!emailLocal || listingUsername.toLowerCase() !== emailLocal)
      ? listingUsername
      : null;

  return getSellerDisplayName(
    {
      displayName: fields?.displayName || fields?.name,
      username: listingUsernameOk,
      sellerName: fields?.sellerName,
      sellerUsername: listingUsernameOk,
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
  const matches = text.match(EMAIL_RE) || [];
  return [...new Set(matches)];
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
  out = out.replace(EMAIL_RE, (match) => {
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
