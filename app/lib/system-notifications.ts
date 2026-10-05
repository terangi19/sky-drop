import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import { profileAllowsNotificationDelivery } from "./notification-prefs";

interface SystemNotificationInput {
  targetEmail: string;
  fromEmail: string;
  type: string;
  title: string;
  message: string;
  listingId?: string;
  listingTitle?: string;
  listingImage?: string;
}

/** Create a notification from the server side without going through the client API.
 *  This bypasses per-IP rate limits and avoids exposing admin tokens.
 */
export async function createSystemNotification(input: SystemNotificationInput): Promise<void> {
  if (!isAdminInitialized()) return;
  const db = getAdminDb();
  const target = input.targetEmail.trim().toLowerCase();
  const from = input.fromEmail.trim().toLowerCase();
  if (target === from) return;

  const targetProfile = await db.collection("profiles").where("email", "==", target).limit(1).get();
  if (!targetProfile.empty) {
    const prefs = targetProfile.docs[0].data();
    if (!profileAllowsNotificationDelivery(prefs, input.type)) {
      return;
    }
  }

  const notification = {
    type: input.type,
    fromEmail: from,
    targetEmail: target,
    title: input.title,
    message: input.message,
    read: false,
    listingId: input.listingId || null,
    listingTitle: input.listingTitle || null,
    listingImage: input.listingImage || null,
    createdAt: new Date(),
  };

  // The `notifications` collection is the only store anything reads (dropdown, unread
  // counts, mark-read, email/push workers). A per-user `users/{uid}/notifications`
  // copy used to be written here too, but nothing ever read it.
  await db.collection("notifications").add(notification);
}
