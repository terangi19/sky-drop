"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { requestNotificationPermission, getFCMToken, saveFCMToken, removeFCMToken } from "../lib/fcm";

export default function PWAProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js").then((reg) => {
        if (!reg) {
          navigator.serviceWorker.register("/firebase-messaging-sw.js").catch(() => {});
        }
      });
    }

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const granted = await requestNotificationPermission();
        if (granted) {
          const token = await getFCMToken();
          if (token) {
            await saveFCMToken(token);
          }
        }
      } else {
        removeFCMToken();
      }
    });

    return () => unsubAuth();
  }, []);

  return null;
}
