import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY || "BBBG3YmS3r89HxfRIHLD13S4D5ub3CB17tBL0sVDX4ThtXg1TxgF4zrcOXjZRV_y13bkNopn93p1ADCfc1SvlKg";
const FCM_SW_PATH = "/firebase-messaging-sw.js";

let fcmSwRegistration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Register the FCM service worker once; required before getToken or Google returns 401. */
export function ensureFCMServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!fcmSwRegistration) {
    fcmSwRegistration = (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration("/");
        if (existing?.active?.scriptURL?.includes("firebase-messaging-sw")) {
          return existing;
        }
        return await navigator.serviceWorker.register(FCM_SW_PATH);
      } catch {
        return null;
      }
    })();
  }
  return fcmSwRegistration;
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

export async function getFCMToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!VAPID_KEY) return null;

  try {
    if (!(await isSupported())) return null;

    const registration = await ensureFCMServiceWorker();
    if (!registration) return null;

    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fcm] Token registration failed:", err);
    }
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
  } catch {}
}

export function onForegroundMessage(callback: (payload: any) => void): () => void {
  try {
    const messaging = getMessaging();
    return onMessage(messaging, callback);
  } catch {
    return () => {};
  }
}
