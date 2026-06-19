"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function PlatformAnnouncement() {
  const [announcement, setAnnouncement] = useState<any>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "config", "announcement"),
      (snap) => {
        if (!snap.exists()) { setAnnouncement(null); return; }
        const data = snap.data();
        if (data.active) setAnnouncement(data);
        else setAnnouncement(null);
      },
      (err) => {
        const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
        if (code !== "permission-denied") console.error("Announcement listener error:", err);
      }
    );
    return () => unsub();
  }, []);

  if (!announcement) return null;

  const typeStyles: Record<string, string> = {
    info: "bg-sky-500/10 text-sky-300 border-sky-500/20",
    warning: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    alert: "bg-red-500/10 text-red-300 border-red-500/20",
  };

  return (
    <div className={`fixed top-16 left-0 right-0 z-[9999] border-b ${typeStyles[announcement.type as string] || typeStyles.info} backdrop-blur-md`}>
      <div className="mx-auto max-w-7xl px-6 py-2.5 text-center text-sm font-medium">
        {announcement.message}
      </div>
    </div>
  );
}
