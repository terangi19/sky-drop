"use client";

import { useEffect } from "react";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { requestNotificationPermission, getFCMToken, saveFCMToken, removeFCMToken } from "../lib/fcm";

export default function PWAProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    if ("serviceWorker" in navigator) {
      const swParams = new URLSearchParams({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
      });
      const swUrl = `/firebase-messaging-sw.js?${swParams.toString()}`;
      navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js").then((reg) => {
        if (!reg) {
          navigator.serviceWorker.register(swUrl).catch(() => {});
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
