"use client";

import { useEffect, useRef } from "react";
import { auth, onAuthStateChanged } from "../lib/firebase";
import {
  ensureFCMServiceWorker,
  requestNotificationPermission,
  getFCMToken,
  saveFCMToken,
  removeFCMToken,
} from "../lib/fcm";

function isTabDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      /(?:\?|&)debugTabs=1(?:&|$)/.test(window.location.search) ||
      localStorage.getItem("skydrop:debugTabs") === "1"
    );
  } catch {
    return false;
  }
}

export default function PWAProvider() {
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    void ensureFCMServiceWorker();

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (isTabDebugEnabled()) {
        console.warn("[skydrop:debugTabs] PWAProvider auth state:", {
          signedIn: !!user,
          notificationPermission: Notification.permission,
          permissionRequested: permissionRequestedRef.current,
        });
      }

      if (user) {
        if (Notification.permission === "granted") {
          const token = await getFCMToken();
          if (token) {
            await saveFCMToken(token);
          }
          return;
        }

        if (Notification.permission === "default" && !permissionRequestedRef.current) {
          permissionRequestedRef.current = true;
          if (isTabDebugEnabled()) {
            console.warn("[skydrop:debugTabs] PWAProvider requesting notification permission");
          }
          const granted = await requestNotificationPermission();
          if (granted) {
            const token = await getFCMToken();
            if (token) {
              await saveFCMToken(token);
            }
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
