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

  // Emails disabled to conserve email quota
  // try {
  //   await fetch("/api/send-email", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ to: input.targetEmail, subject: input.title, html: `<p>${input.message}</p>` }),
  //   });
  // } catch {}
}
