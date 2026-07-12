import type { Firestore } from "firebase-admin/firestore";
import { hiddenConversationDocId } from "./conversation-hide";

/** Remove per-user hide when the other party sends a new message. */
export async function clearHiddenConversationForUser(
  db: Firestore,
  userEmail: string,
  otherEmail: string,
  listingId?: string | null
): Promise<void> {
  const normalizedUser = userEmail.trim().toLowerCase();
  const normalizedOther = otherEmail.trim().toLowerCase();
  if (!normalizedUser || !normalizedOther) return;

  const profileSnap = await db
    .collection("profiles")
    .where("email", "==", normalizedUser)
    .limit(1)
    .get();
  if (profileSnap.empty) return;

  const uid = profileSnap.docs[0].id;
  const docId = hiddenConversationDocId(normalizedOther, listingId);
  await db
    .collection("profiles")
    .doc(uid)
    .collection("inboxHidden")
    .doc(docId)
    .delete()
    .catch(() => {});
}
