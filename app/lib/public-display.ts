/** Public-facing identity — never show raw emails in UI copy. */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export type PublicProfileFields = {
  username?: string;
};

export type SellerLinkFields = PublicProfileFields & {
  buyerUsername?: string;
  reportedUsername?: string;
  reporterUsername?: string;
  sellerUsername?: string;
  sellerEmail?: string;
  buyerEmail?: string;
  sellerId?: string;
  buyerId?: string;
  reportedUserId?: string;
  reporterUserId?: string;
  email?: string;
  uid?: string;
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
  for (const raw of [
    fields?.sellerUsername,
    fields?.buyerUsername,
    fields?.reportedUsername,
    fields?.reporterUsername,
    fields?.username,
  ]) {
    const v = String(raw || "").trim();
    if (v && !isEmailLike(v)) return stripAtPrefix(v);
  }
  for (const raw of [
    fields?.sellerId,
    fields?.buyerId,
    fields?.reportedUserId,
    fields?.reporterUserId,
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
  const slug = sellerProfileSlug(fields);
  const looksLikeUid =
    !slug ||
    isEmailLike(slug) ||
    /^[A-Za-z0-9_-]{16,}$/.test(slug) ||
    /^uid[-_]/i.test(slug);
  return looksLikeUid ? fallback : slug;
}

/** Query value for `/messages?user=` — username first, then UID. Never expose email. */
export function sellerMessageTarget(
  fields: SellerLinkFields | null | undefined
): string {
  return sellerProfileSlug(fields);
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
