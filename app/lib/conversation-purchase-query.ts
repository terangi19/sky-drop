import {
  and,
  collection,
  limit,
  or,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

/** Upper bound on purchase docs one open chat will ever stream. */
export const CONVERSATION_PURCHASES_LIMIT = 20;

/**
 * Query for the purchase(s) that belong to ONE conversation: the given listing
 * between the signed-in user and the other chat participant, in either role.
 *
 * Why it is shaped this way:
 * - firestore.rules only lets a signed-in user read a purchase when
 *   `buyerEmail` or `sellerEmail` equals their token email. A list query is
 *   only allowed if every possible result satisfies the rule ("rules are not
 *   filters"), so a bare `where("listingId", "==", id)` is rejected with
 *   permission-denied for non-admin users. Each OR branch below pins the
 *   user's own email to buyerEmail or sellerEmail, which the rules accept.
 * - Pinning the counterparty as well keeps the result set to this buyer/seller
 *   pair (normally 0-3 docs), so `limit()` is only a safety ceiling and cannot
 *   drop the matching purchase when a listing has many buyers.
 * - Equality-only filters, no orderBy: served by single-field index merging,
 *   no composite index. `pickConversationPurchase` still sorts client-side.
 */
export function buildConversationPurchasesQuery(
  db: Firestore,
  listingId: string,
  userEmail: string,
  otherEmail: string
) {
  return query(
    collection(db, "purchases"),
    or(
      and(
        where("listingId", "==", listingId),
        where("buyerEmail", "==", userEmail),
        where("sellerEmail", "==", otherEmail)
      ),
      and(
        where("listingId", "==", listingId),
        where("sellerEmail", "==", userEmail),
        where("buyerEmail", "==", otherEmail)
      )
    ),
    limit(CONVERSATION_PURCHASES_LIMIT)
  );
}
