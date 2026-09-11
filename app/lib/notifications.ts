import { auth } from "./firebase";
import { notificationToEmail } from "./email";

interface NotificationInput {
  targetEmail: string;
  fromEmail: string;
  type: string;
  title: string;
  message: string;
  listingId?: string;
  listingTitle?: string;
  listingImage?: string;
  purchaseId?: string;
  total?: number;
  buyerName?: string;
  sellerName?: string;
  orderId?: string;
}

export async function createNotification(input: NotificationInput) {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      console.error("Failed to create notification: not signed in");
      return;
    }
    const res = await fetch("/api/create-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: input.type,
        targetEmail: input.targetEmail,
        fromEmail: input.fromEmail,
        title: input.title,
        message: input.message,
        listingId: input.listingId || null,
        listingTitle: input.listingTitle || null,
        listingImage: input.listingImage || null,
        purchaseId: input.purchaseId || null,
        total: input.total || null,
      }),
    });
    if (!res.ok) {
      console.error("Failed to create notification:", res.status, await res.text().catch(() => ""));
      return;
    }
    const created = (await res.json().catch(() => ({}))) as { skipped?: boolean };
    if (created.skipped) {
      return;
    }
  } catch (e) {
    console.error("Failed to create notification:", e);
    return;
  }

  // Push notification
  try {
    const pushToken = await auth.currentUser?.getIdToken();
    const url = input.listingId ? `/post/listing/${input.listingId}` : "/messages";
    const res = await fetch("/api/send-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(pushToken ? { Authorization: `Bearer ${pushToken}` } : {}),
      },
      body: JSON.stringify({
        targetEmail: input.targetEmail,
        title: input.title,
        message: input.message,
        url,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.note === "push not configured") {
        console.info("[Notification] Push not configured — notification stored in Firestore only");
      }
    } else {
      console.info("[Notification] Push endpoint returned non-OK:", res.status);
    }
  } catch {
    console.info("[Notification] Push endpoint unreachable (expected if push not configured)");
  }

  // Email notification — plaintext only. Server wraps it; clients cannot supply HTML.
  try {
    const email = notificationToEmail(input.type, input.title, input.listingTitle, input.total);
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      await fetch("/api/send-notification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: input.targetEmail,
          subject: email.subject,
          text: input.message || email.message,
        }),
      });
    }
  } catch (e) {
    console.info("[Notification] Email send skipped or failed:", e);
  }
}
