"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import SkyAiChatPanel from "./SkyAiChatPanel";

export default function SkyAiChat() {
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  if (!user) return null;

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/post/ai") ||
    pathname.startsWith("/post/listing") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/create-account") ||
    pathname === "/profile"
  ) {
    return null;
  }

  return <SkyAiChatPanel mode="sheet" />;
}
