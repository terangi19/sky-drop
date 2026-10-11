import "server-only";
/**
 * PROMPT-11: who may /api/send-message deliver to?
 *
 * 1. Username / uid -> email resolution must not be an email oracle. The sender can read their own
 *    message doc (`messages` read = participant), which stores `receiver`/`participants` as emails.
 *    A non-email receiver resolves only when the resolved email is already known to the sender or
 *    already public:
 *      - it is a participant of the conversation the sender is posting into, or
 *      - it is the seller of the listing in context (listing.sellerEmail is public-read today), or
 *      - the target has at least one listing (their email is already on public listing docs;
 *        Phase-2 residual), which keeps "Message" on /seller/[username] working.
 *    Otherwise the same generic 404 as an unknown user. Unresolvable receivers are refused instead
 *    of being stored as a fake participant.
 * 2. Inside an existing conversation the receiver must be another participant (no "post into thread
 *    A, deliver to a stranger"), and a message can't claim a different listing than the thread's.
 */
import type { Firestore } from "firebase-admin/firestore";

type AuthLike = { getUser(uid: string): Promise<{ uid: string; email?: string | null }> };

export type ReceiverResult =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string };

const NOT_FOUND: ReceiverResult = { ok: false, status: 404, error: "User not found" };
const lc = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

export async function resolveMessageReceiver(
  db: Firestore,
  auth: AuthLike,
  input: { receiver: string; listingId: string; conversationParticipants: string[] | null }
): Promise<ReceiverResult> {
  const receiver = input.receiver.trim();
  if (!receiver) return { ok: false, status: 400, error: "Receiver is required" };
  if (receiver.includes("@")) return { ok: true, email: receiver };

  const lower = receiver.toLowerCase();
  const [unameSnap, listingSnap, userRec] = await Promise.all([
    db.collection("usernames").doc(lower).get(),
    input.listingId ? db.collection("listings").doc(input.listingId).get().catch(() => null) : Promise.resolve(null),
    auth.getUser(receiver).catch(() => null),
  ]);

  let email = "";
  let uid = "";
  if (unameSnap.exists) {
    uid = String(unameSnap.data()?.uid || "");
    if (uid) {
      const profileSnap = await db.collection("profiles").doc(uid).get();
      const e = String(profileSnap.data()?.email || "").trim();
      if (e.includes("@")) email = e;
    }
  }
  if (!email && userRec?.email) {
    email = userRec.email;
    uid = userRec.uid;
  }

  // Listing context: the listing's own seller, matched by username / uid / email local part.
  if (listingSnap?.exists) {
    const listing = listingSnap.data() || {};
    const listingEmail = String(listing.sellerEmail || "").trim();
    const matchesSeller =
      listingEmail.includes("@") &&
      (lower === lc(listing.sellerUsername) ||
        lower === lc(listing.sellerId) ||
        lower === lc(listingEmail.split("@")[0]) ||
        (!!email && lc(email) === lc(listingEmail)));
    if (matchesSeller) return { ok: true, email: listingEmail };
  }

  if (!email) return NOT_FOUND;

  // Conversation context: already a participant the sender can see.
  if (input.conversationParticipants?.some((p) => lc(p) === lc(email))) return { ok: true, email };

  // Public seller: email is already on their public listing docs.
  if (uid) {
    const listings = await db.collection("listings").where("sellerId", "==", uid).limit(1).get();
    if (!listings.empty) return { ok: true, email };
  }
  return NOT_FOUND;
}

/** Existing conversation: receiver must be another participant; listing must match the thread's. */
export function checkConversationBinding(
  conv: Record<string, unknown>,
  input: { senderEmail: string; receiverEmail: string; listingId: string }
): { ok: true } | { ok: false; status: number; error: string } {
  const participants = Array.isArray(conv.participants) ? (conv.participants as unknown[]).map(lc) : [];
  if (!participants.includes(lc(input.senderEmail))) {
    return { ok: false, status: 403, error: "Not a participant in this conversation" };
  }
  if (lc(input.receiverEmail) === lc(input.senderEmail) || !participants.includes(lc(input.receiverEmail))) {
    return { ok: false, status: 403, error: "Receiver is not in this conversation" };
  }
  const convListing = typeof conv.listingId === "string" ? conv.listingId : "";
  if (convListing && input.listingId && convListing !== input.listingId) {
    return { ok: false, status: 400, error: "Listing does not match this conversation" };
  }
  return { ok: true };
}
