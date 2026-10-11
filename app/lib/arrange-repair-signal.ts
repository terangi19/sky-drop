/**
 * /api/repair-arrange-sales backfills a purchase for a sold Arrange Purchase (contact) listing.
 * `listing.soldTo` alone is NOT proof of a sale: it is a listing field, and until listings became
 * server-only for client writes (prompt-6) the seller could set `status:"sold"` + `soldTo:<anyone>`
 * from the client, then call the repair to fabricate an order in a stranger's purchases.
 *
 * A purchase is backfilled only when a server-written buyer signal for THAT buyer on THAT listing
 * exists. Clients cannot write `messages` or `conversations` (firestore.rules: create/update false):
 *  - accepted_offer: messages{listingId, type:"offer", sender:buyer, offerStatus:"accepted"}.
 *    `sender` is set by /api/send-message from the caller's token; only /api/accept-offer sets
 *    offerStatus "accepted".
 *  - arrange_conversation: conversations{listingId, participants ⊇ [buyer, seller]} with orderStatus
 *    "arranged" (only /api/arrange-purchase, called with the BUYER's token), "offer_accepted"
 *    (only accept-offer, for the offer's sender) or "seller_confirming" (only confirm-arrange-sale,
 *    which needs an existing purchase).
 * Identity on these docs is email-only (no uid is stored), so matching is by lowercased email.
 */
import type { Firestore } from "firebase-admin/firestore";

export type BuyerSignal = "accepted_offer" | "arrange_conversation";

export const BUYER_SIGNAL_CONVERSATION_STATUSES: ReadonlySet<string> = new Set([
  "arranged",
  "offer_accepted",
  "seller_confirming",
]);

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

export function conversationShowsBuyerRequest(
  conv: Record<string, unknown> | null | undefined,
  input: { listingId: string; buyerEmail: string; sellerEmail: string; conversationDocId?: string; expectedDocId?: string }
): boolean {
  if (!conv) return false;
  const buyer = norm(input.buyerEmail);
  const seller = norm(input.sellerEmail);
  if (!buyer || !seller || buyer === seller) return false;
  const listingMatches =
    String(conv.listingId ?? "") === input.listingId ||
    (!!input.expectedDocId && input.conversationDocId === input.expectedDocId);
  if (!listingMatches) return false;
  const participants = Array.isArray(conv.participants) ? conv.participants.map(norm) : [];
  if (!participants.includes(buyer) || !participants.includes(seller)) return false;
  return BUYER_SIGNAL_CONVERSATION_STATUSES.has(norm(conv.orderStatus));
}

export function messageIsAcceptedOfferFromBuyer(
  msg: Record<string, unknown> | null | undefined,
  input: { listingId: string; buyerEmail: string }
): boolean {
  if (!msg) return false;
  const buyer = norm(input.buyerEmail);
  if (!buyer) return false;
  const status = norm(msg.offerStatus ?? (msg.offer as { status?: unknown } | undefined)?.status);
  return (
    String(msg.listingId ?? "") === input.listingId &&
    msg.type === "offer" &&
    norm(msg.sender) === buyer &&
    status === "accepted"
  );
}

/** First server-written buyer signal for (listing, buyer), or null. Read-only. */
export async function findArrangeBuyerSignal(
  db: Firestore,
  input: { listingId: string; buyerEmail: string; sellerEmail: string; conversationId: string }
): Promise<BuyerSignal | null> {
  const { listingId, buyerEmail, sellerEmail, conversationId } = input;
  if (!listingId || !norm(buyerEmail) || !norm(sellerEmail) || norm(buyerEmail) === norm(sellerEmail)) {
    return null;
  }

  if (conversationId) {
    const convSnap = await db.collection("conversations").doc(conversationId).get();
    if (
      convSnap.exists &&
      conversationShowsBuyerRequest(convSnap.data(), {
        listingId,
        buyerEmail,
        sellerEmail,
        conversationDocId: conversationId,
        expectedDocId: conversationId,
      })
    ) {
      return "arrange_conversation";
    }
  }

  const convs = await db.collection("conversations").where("listingId", "==", listingId).limit(20).get();
  if (convs.docs.some((d) => conversationShowsBuyerRequest(d.data(), { listingId, buyerEmail, sellerEmail }))) {
    return "arrange_conversation";
  }

  // Equality-only filters: served by single-field indexes (no composite needed).
  const offers = await db
    .collection("messages")
    .where("listingId", "==", listingId)
    .where("sender", "==", buyerEmail)
    .limit(50)
    .get();
  if (offers.docs.some((d) => messageIsAcceptedOfferFromBuyer(d.data(), { listingId, buyerEmail }))) {
    return "accepted_offer";
  }
  return null;
}
