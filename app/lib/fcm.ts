import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, deleteDoc, collection } from "firebase/firestore";
import { auth, db } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY || "BBBG3YmS3r89HxfRIHLD13S4D5ub3CB17tBL0sVDX4ThtXg1TxgF4zrcOXjZRV_y13bkNopn93p1ADCfc1SvlKg";

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

export async function getFCMToken(): Promise<string | null> {
  try {
    const messaging = getMessaging();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token;
  } catch {
    return null;
  }
}

export async function saveFCMToken(token: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const ref = doc(db, "fcmTokens", user.uid);
  await setDoc(ref, {
    token,
    email: user.email,
    updatedAt: new Date().toISOString(),
  });
}

export async function removeFCMToken(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const messaging = getMessaging();
    await deleteDoc(doc(db, "fcmTokens", user.uid));
  } catch (err) {
    console.error("Failed to remove FCM token:", err);
  }
}

export function onForegroundMessage(callback: (payload: any) => void): () => void {
  try {
    const messaging = getMessaging();
    return onMessage(messaging, callback);
  } catch {
    return () => {};
  }
}
