/**
 * Shareable /messages thread URLs (MESSAGES-THREAD-URL).
 *
 * URL shape: /messages?user=<counterparty uid>&listing=<listingId>
 *  - `user` is the counterparty's Firebase uid (opaque, non-PII), NEVER an email.
 *  - Inbound links may still carry a username (`?user=sky50`), a uid, a legacy email, or
 *    `?conversation=<id>`; they are resolved, and the URL is then rewritten to the uid form.
 *
 * Message participants are emails, and the public identity API never maps uid/username -> email
 * (it only maps email -> uid for signed-in callers). So a uid/username is resolved by matching it
 * against the identities of the people already in this user's inbox, with the listing's seller as
 * the fallback for a brand-new thread started from a listing.
 */
import { isEmailLike } from "./public-display";

/** Params owned by thread selection (also the legacy listing-card prefill params). */
export const THREAD_URL_PARAMS = ["user", "listing", "conversation", "title", "image", "price"] as const;

type IdentityLike = { uid?: string | null; email?: string | null } | null | undefined;

/** uid to put in the URL for the selected counterparty, or null (never an email). */
export function threadUrlUserId(chatUser: string, peek: (id: string) => IdentityLike): string | null {
  const id = String(chatUser || "").trim();
  if (!id) return null;
  const uid = String(peek(id)?.uid || "").trim();
  if (uid && !isEmailLike(uid)) return uid;
  return null;
}

/**
 * Query string for the current selection, preserving unrelated params.
 * Returns "" or "?a=b..." (ready to append to the pathname).
 */
export function buildThreadSearch(
  currentSearch: string,
  sel: { userId: string | null; listingId: string | null }
): string {
  const params = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  for (const k of THREAD_URL_PARAMS) params.delete(k);
  if (sel.userId && !isEmailLike(sel.userId)) {
    params.set("user", sel.userId);
    if (sel.listingId) params.set("listing", sel.listingId);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export type ResolveThreadDeps = {
  /** Participant emails seen in the user's inbox (counterparties). */
  inboxParticipants: string[];
  /** Public identity for a uid or username (GET single / batch API, cached). */
  resolveIdentity: (idOrSlug: string) => Promise<IdentityLike>;
  /** Batch identities for inbox emails (email -> uid via POST /api/public-profiles, cached). */
  resolveIdentities: (emails: string[]) => Promise<Map<string, IdentityLike>>;
  /** Listing seller for `?listing=` (getDoc listings/{id}); null when unknown. */
  listingSeller?: () => Promise<{ email?: string | null; uid?: string | null } | null>;
  myEmail: string;
};

/**
 * Resolve `?user=` (uid | username | legacy email) to the counterparty's email (the key the
 * inbox uses). Returns null when it can't be resolved; the caller must NOT fall back to the
 * raw param (a username as chatUser opens a broken, unsendable thread).
 */
export async function resolveThreadUserParam(param: string, deps: ResolveThreadDeps): Promise<string | null> {
  const raw = String(param || "").trim();
  if (!raw) return null;
  const me = deps.myEmail.trim().toLowerCase();
  if (isEmailLike(raw)) return raw.toLowerCase() === me ? null : raw;

  let targetUid = "";
  try {
    const identity = await deps.resolveIdentity(raw);
    targetUid = String(identity?.uid || "").trim();
    const known = String(identity?.email || "").trim();
    if (known && isEmailLike(known) && known.toLowerCase() !== me) return known;
  } catch {
    /* fall through to listing */
  }
  if (!targetUid && !/[^A-Za-z0-9]/.test(raw) && raw.length >= 20) targetUid = raw; // looks like a uid

  if (targetUid) {
    const emails = [...new Set(deps.inboxParticipants.filter((e) => isEmailLike(e) && e.toLowerCase() !== me))];
    if (emails.length) {
      try {
        const map = await deps.resolveIdentities(emails);
        for (const email of emails) {
          if (String(map.get(email)?.uid || "") === targetUid) return email;
        }
      } catch {
        /* fall through to listing */
      }
    }
  }

  if (deps.listingSeller) {
    try {
      const seller = await deps.listingSeller();
      const email = String(seller?.email || "").trim();
      const sellerUid = String(seller?.uid || "").trim();
      if (email && isEmailLike(email) && email.toLowerCase() !== me && (!targetUid || !sellerUid || sellerUid === targetUid)) {
        return email;
      }
    } catch {
      /* unresolved */
    }
  }
  return null;
}
