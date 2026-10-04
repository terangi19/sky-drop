"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";
import Background from "../components/Background";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { AuthGatePlaceholder, useRequireAuth } from "../lib/use-require-auth";
import { showToast } from "../components/Toast";
import { fetchPublicHandle as resolvePublicHandle } from "../lib/fetch-public-profile-client";
import {
  extractEmailsFromText,
  sanitizePublicText,
} from "../lib/public-display";
import {
  NOTIFICATIONS_MAX_LIMIT,
  NOTIFICATIONS_PAGE_SIZE,
} from "../lib/firestore-query-limits";
import { DASHBOARD_POLL_MS, startVisibilityPolledFetch } from "../lib/polled-firestore";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  fromEmail?: string;
  listingId?: string;
  listingTitle?: string;
  read: boolean;
  createdAt?: { seconds: number };
}

const TYPE_META: Record<string, { icon: string; color: string }> = {
  message: { icon: "💬", color: "bg-sky-500/20" },
  offer: { icon: "💰", color: "bg-sky-500/20" },
  sold: { icon: "✅", color: "bg-sky-500/20" },
  verification: { icon: "🔐", color: "bg-sky-500/20" },
  warning: { icon: "⚠️", color: "bg-red-500/20" },
  watchlist: { icon: "⭐", color: "bg-sky-500/20" },
  referral: { icon: "🎉", color: "bg-sky-500/20" },
  purchase_confirmation: { icon: "📦", color: "bg-sky-500/20" },
  offer_accepted: { icon: "✅", color: "bg-sky-500/20" },
  offer_declined: { icon: "❌", color: "bg-red-500/20" },
  counter_offer: { icon: "🔄", color: "bg-sky-500/20" },
  dispute_opened: { icon: "⚠️", color: "bg-red-500/20" },
};

function mapNotificationDocs(docs: QueryDocumentSnapshot[]): NotificationItem[] {
  return docs.map((d) => ({ id: d.id, ...d.data() } as NotificationItem));
}

function formatTime(seconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - seconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const date = new Date(seconds * 1000);
  return date.toLocaleDateString("en-NZ", { month: "short", day: "numeric" });
}

export default function NotificationsPage() {
  const { user, authReady } = useRequireAuth("/notifications");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [publicHandles, setPublicHandles] = useState<Record<string, string>>({});
  const loadedMoreRef = useRef(false);

  async function fetchPublicHandle(email: string) {
    if (!email || publicHandles[email]) return;
    try {
      const handle = await resolvePublicHandle(email, "User");
      setPublicHandles((prev) => ({ ...prev, [email]: handle }));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    const email = user.email;
    let mounted = true;
    loadedMoreRef.current = false;
    setLoading(true);

    const firstPageQuery = query(
      collection(db, "notifications"),
      where("targetEmail", "==", email),
      orderBy("createdAt", "desc"),
      limit(NOTIFICATIONS_PAGE_SIZE)
    );

    async function fetchNotifications() {
      if (!mounted) return;
      try {
        const snap = await getDocs(firstPageQuery);
        if (!mounted) return;
        const items = mapNotificationDocs(snap.docs);
        setNotifications((prev) => {
          if (!loadedMoreRef.current || prev.length <= items.length) return items;
          const ids = new Set(items.map((n) => n.id));
          return [...items, ...prev.filter((n) => !ids.has(n.id))].slice(
            0,
            NOTIFICATIONS_MAX_LIMIT
          );
        });
        if (!loadedMoreRef.current) {
          setLastDoc(snap.docs[snap.docs.length - 1] || null);
          setHasMore(snap.docs.length === NOTIFICATIONS_PAGE_SIZE);
        }
        setLoading(false);
      } catch (err) {
        console.error("Notifications fetch error:", err);
        if (mounted) setLoading(false);
      }
    }

    const stop = startVisibilityPolledFetch(fetchNotifications, DASHBOARD_POLL_MS);
    return () => {
      mounted = false;
      stop();
    };
  }, [user?.email]);

  useEffect(() => {
    notifications.forEach((n) => {
      if (n.fromEmail) fetchPublicHandle(n.fromEmail);
      extractEmailsFromText(n.message || "").forEach((e) => fetchPublicHandle(e));
      extractEmailsFromText(n.title || "").forEach((e) => fetchPublicHandle(e));
    });
  }, [notifications]);

  async function loadMore() {
    if (!lastDoc || !user?.email || loadingMore) return;
    if (notifications.length >= NOTIFICATIONS_MAX_LIMIT) {
      setHasMore(false);
      return;
    }
    setLoadingMore(true);
    try {
      const remaining = NOTIFICATIONS_MAX_LIMIT - notifications.length;
      const pageLimit = Math.min(NOTIFICATIONS_PAGE_SIZE, remaining);
      const q = query(
        collection(db, "notifications"),
        where("targetEmail", "==", user.email),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(pageLimit)
      );
      const snap = await getDocs(q);
      const items = mapNotificationDocs(snap.docs);
      loadedMoreRef.current = true;
      setNotifications((prev) => {
        const ids = new Set(prev.map((n) => n.id));
        const merged = [...prev];
        for (const item of items) {
          if (!ids.has(item.id)) merged.push(item);
        }
        return merged.slice(0, NOTIFICATIONS_MAX_LIMIT);
      });
      setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
      const nextCount = Math.min(
        notifications.length + items.length,
        NOTIFICATIONS_MAX_LIMIT
      );
      setHasMore(snap.docs.length === pageLimit && nextCount < NOTIFICATIONS_MAX_LIMIT);
    } catch (e) {
      console.error("Load more error:", e);
    }
    setLoadingMore(false);
  }

  async function markAllAsRead() {
    if (!user?.email) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    try {
      await Promise.all(
        unreadIds.map((id) => updateDoc(doc(db, "notifications", id), { read: true }))
      );
      setNotifications((prev) =>
        prev.map((n) => (n.read ? n : { ...n, read: true }))
      );
      showToast("All notifications marked as read");
    } catch (e) {
      console.error("Mark all read error:", e);
      showToast("Could not mark notifications as read. Try again.", "error");
    }
  }

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  if (!authReady || !user) {
    return <AuthGatePlaceholder fallbackPath="/notifications" message="Sign in to view your notifications." />;
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><section className="relative z-10 mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="relative text-center sm:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/15 bg-red-500/5 px-3 py-1 text-[10px] font-bold text-red-400 mb-3 tracking-wide uppercase">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
              Alerts
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              <span className="bg-gradient-to-r from-white via-red-200 to-white bg-clip-text text-transparent">Notifications</span>
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{notifications.length} notification{notifications.length !== 1 ? "s" : ""}</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllAsRead}
              className="rounded-lg border border-red-500/15 bg-red-500/5 px-3.5 py-2 text-[11px] font-bold text-red-400 transition hover:bg-red-500/15 active:scale-[0.97]">
              Mark all as read ({unreadCount})
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-white/[0.04]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-48 rounded bg-white/[0.03]" />
                  <div className="h-2.5 w-32 rounded bg-white/[0.02]" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <svg className="h-7 w-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white">No notifications yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Messages, offers, and updates will appear here.</p>
            <Link href="/" className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-red-500 to-red-400 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition hover:shadow-xl active:scale-[0.97]">
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {notifications.map((n) => {
                const meta = TYPE_META[n.type] || { icon: "🔔", color: "bg-zinc-500/20" };
                const href = n.listingId ? `/post/listing/${n.listingId}` : "#";
                return (
                  <Link key={n.id} href={href}
                    className={`group relative flex items-start gap-3 rounded-xl border px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 ${
                      !n.read
                        ? "border-red-500/10 bg-red-500/[0.04] hover:bg-red-500/[0.06] hover:border-red-500/20"
                        : "border-transparent bg-white/[0.01] hover:bg-white/[0.03]"
                    }`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.color}`}>
                      <span className="text-sm">{meta.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${!n.read ? "font-bold text-white" : "text-zinc-300"}`}>{n.title}</p>
                        <span className="shrink-0 text-[10px] text-zinc-500">{n.createdAt?.seconds ? formatTime(n.createdAt.seconds) : ""}</span>
                      </div>
                      {n.message && (
                        <p className="mt-0.5 text-[12px] text-zinc-500 line-clamp-2">
                          {sanitizePublicText(n.message, publicHandles)}
                        </p>
                      )}
                      {n.listingTitle && (
                        <p className="mt-0.5 text-[10px] text-red-400/60">{n.listingTitle}</p>
                      )}
                    </div>
                    {!n.read && (
                      <span className="absolute right-2.5 top-3 h-1.5 w-1.5 rounded-full bg-red-400" />
                    )}
                  </Link>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-6 text-center">
                <button onClick={loadMore} disabled={loadingMore}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 py-2.5 text-sm font-bold text-zinc-400 transition hover:bg-white/[0.04] hover:text-white active:scale-[0.97] disabled:opacity-50">
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
