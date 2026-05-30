"use client";

import { useEffect } from "react";
import { auth, onAuthStateChanged } from "../lib/firebase";

async function setAdminSession(token: string) {
  try {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {}
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        user.getIdToken().then(setAdminSession).catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  return <>{children}</>;
}
