import { getAdminDb, isAdminInitialized } from "./firebase-admin";

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
  const targetUid = targetProfile.empty ? null : targetProfile.docs[0].id;

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

  // Add to notifications collection for target user
  if (targetUid) {
    await db.collection("users").doc(targetUid).collection("notifications").add(notification);
  }

  // Also create a global notification document for email/push workers
  await db.collection("notifications").add(notification);
}
