/** Public-facing identity — never show raw emails in UI copy. */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export type PublicProfileFields = {
  username?: string;
};

export type SellerLinkFields = PublicProfileFields & {
  sellerUsername?: string;
  sellerEmail?: string;
  email?: string;
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

/** Path segment for `/seller/[slug]` — username first, email only for lookup fallback. */
export function sellerProfileSlug(
  fields: SellerLinkFields | null | undefined
): string {
  for (const raw of [fields?.sellerUsername, fields?.username]) {
    const v = String(raw || "").trim();
    if (v && !isEmailLike(v)) return stripAtPrefix(v);
  }
  return String(fields?.sellerEmail || fields?.email || "").trim();
}

/** Heading text on seller pages — never an email address. */
export function sellerProfileDisplayName(
  fields: SellerLinkFields | null | undefined,
  fallback = "Seller"
): string {
  const slug = sellerProfileSlug(fields);
  return slug && !isEmailLike(slug) ? slug : fallback;
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
