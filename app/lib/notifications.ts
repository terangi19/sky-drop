import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

interface NotificationInput {
  targetEmail: string;
  fromEmail: string;
  type: string;
  title: string;
  message: string;
  listingId?: string;
  listingTitle?: string;
  listingImage?: string;
  total?: number;
}

export async function createNotification(input: NotificationInput) {
  try {
    await addDoc(collection(db, "notifications"), {
      type: input.type,
      targetEmail: input.targetEmail,
      fromEmail: input.fromEmail,
      title: input.title,
      message: input.message,
      listingId: input.listingId || null,
      listingTitle: input.listingTitle || null,
      listingImage: input.listingImage || null,
      total: input.total || null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to create notification:", e);
  }

  // Push notification
  try {
    const url = input.listingId ? `/post/listing/${input.listingId}` : "/messages";
    const res = await fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
}
