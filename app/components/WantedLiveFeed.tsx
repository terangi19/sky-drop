"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import Link from "next/link";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";

interface WantedItem {
  id: string;
  title: string;
  price?: string;
  location?: string;
  createdAt?: Timestamp;
}

interface FeedNotification {
  uid: string;
  item: WantedItem;
  state: "entering" | "visible" | "exiting";
}

const HIDE_KEY = "wantedFeedHidden";

export default function WantedLiveFeed() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => { setHidden(localStorage.getItem(HIDE_KEY) === "true"); }, []);
  const [notifications, setNotifications] = useState<FeedNotification[]>([]);
  const readyRef = useRef(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;

    const q = query(
      collection(db, "listings"),
      where("type", "==", "wanted"),
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!readyRef.current) {
        readyRef.current = true;
        return;
      }

      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        const data = change.doc.data() as Record<string, unknown>;
        if (!isListingVisibleInMarketplace(data)) continue;

        const item: WantedItem = {
          id: change.doc.id,
          title: (data.title as string) || "Untitled",
          price: data.price as string | undefined,
          location: data.location as string | undefined,
          createdAt: data.createdAt as Timestamp | undefined,
        };

        const uid = `wanted-${change.doc.id}-${Date.now()}`;
        setNotifications((prev) => [...prev, { uid, item, state: "entering" }]);

        requestAnimationFrame(() => {
          setNotifications((prev) =>
            prev.map((n) => (n.uid === uid ? { ...n, state: "visible" } : n)),
          );
        });

        const dismissTimer = setTimeout(() => {
          setNotifications((prev) =>
            prev.map((n) => (n.uid === uid ? { ...n, state: "exiting" } : n)),
          );
          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.uid !== uid));
          }, 500);
        }, 20000);

        timers.set(uid, dismissTimer);
      }
    }, (err) => {
      console.error("[WantedLiveFeed] Firestore error:", err);
    });

    return () => {
      unsub();
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    localStorage.setItem(HIDE_KEY, String(next));
  };

  if (hidden) {
    return (
      <button
        onClick={toggleHidden}
        className="fixed left-4 top-20 z-[9998] flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm text-[var(--muted)] hover:text-white hover:border-white/[0.12] transition-all duration-200"
        title="Show wanted feed"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    );
  }

  if (notifications.length === 0) {
    return (
      <button
        onClick={toggleHidden}
        className="fixed left-4 top-20 z-[9998] flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm text-[var(--muted)] hover:text-white hover:border-white/[0.12] transition-all duration-200"
        title="Hide wanted feed"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={toggleHidden}
        className="fixed left-4 top-20 z-[9998] flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm text-[var(--muted)] hover:text-white hover:border-white/[0.12] transition-all duration-200"
        title="Hide wanted feed"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="fixed left-4 top-24 z-[9998] flex flex-col gap-1.5 w-64 pointer-events-none">
        {notifications.map((n) => (
          <Link
            key={n.uid}
            href={`/post/listing/${n.item.id}`}
            onClick={() => {
              const timer = timersRef.current.get(n.uid);
              if (timer) clearTimeout(timer);
              timersRef.current.delete(n.uid);
              setNotifications((prev) => prev.filter((p) => p.uid !== n.uid));
            }}
            className={`pointer-events-auto block rounded-lg border border-white/[0.06] bg-zinc-950/90 backdrop-blur-md px-3 py-2 shadow-lg transition-all duration-500 hover:border-white/[0.12] hover:bg-zinc-950 ${
              n.state === "entering"
                ? "-translate-x-full opacity-0"
                : n.state === "visible"
                  ? "translate-x-0 opacity-100"
                  : "-translate-x-4 opacity-0"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-xs shrink-0">📋</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{n.item.title}</p>
                {n.item.price && (
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">
                    Budget: ${n.item.price}
                    {n.item.location ? ` · ${n.item.location}` : ""}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
