"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  signOut,
  User,
} from "firebase/auth";

import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  limit,
} from "firebase/firestore";

import {
  auth,
  db,
  onAuthStateChanged,
} from "../lib/firebase";

import NotificationBell from "./NotificationBell";
import NotificationDropdown from "./NotificationDropdown";
import { useProfile } from "../contexts/ProfileContext";
import { NotificationItem } from "../../types/firestore";
import { DROP_TOKENS_UI_ENABLED } from "../lib/feature-flags";


export default function Navbar() {
  const pathname = usePathname();
  const { username } = useProfile();
  const [user, setUser] =
    useState<User | null>(
      null
    );

  const [
    notificationCount,
    setNotificationCount,
  ] = useState(0);

  const [
    showNotifications,
    setShowNotifications,
  ] = useState(false);

  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);

  const [dismissedIds, setDismissedIds] =
    useState<Set<string>>(new Set());

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropTokenCount, setDropTokenCount] = useState(0);
  const showDropTokens = DROP_TOKENS_UI_ENABLED;

  function loadDismissed(): Set<string> {
    try {
      let raw = null;
    try { raw = localStorage.getItem("dismissedNotifications"); } catch (e) { console.error("Failed to read dismissed notifications:", e); }
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set<string>(); }
  }

  function markSeen(id: string, type?: string) {
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissedIds(next);
    try {
      try { localStorage.setItem("dismissedNotifications", JSON.stringify([...next])); } catch (e) { console.error("Failed to save dismissed notifications:", e); }
    } catch {}
    if (type === "message" || type === "offer") {
      updateDoc(doc(db, "messages", id), { read: true }).catch((e) => console.error("Failed to mark message read:", e));
    } else {
      updateDoc(doc(db, "notifications", id), { read: true }).catch((e) => console.error("Failed to mark notification read:", e));
    }
  }

  useEffect(() => {
    setDismissedIds(loadDismissed());
  }, []);

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
        }
      );

    return () =>
      unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "dropTokens"), where("ownerId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => setDropTokenCount(snap.docs.filter((d) => d.data().status === "available").length));
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.email) return;

    const msgItems: NotificationItem[] = [];
    const purchaseItems: NotificationItem[] = [];

    function merge() {
      const dismissed = loadDismissed();
      const combined = [...msgItems, ...purchaseItems];
      const seen = new Set<string>();
      const deduped = combined.filter((n) => {
        const key = `${n.listingId}|${n.senderEmail}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const filtered = deduped.filter((n) => !dismissed.has(n.id));
      filtered.sort((a, b) => {
        const ta = a.time === "Now" ? Date.now() : new Date(a.time).getTime();
        const tb = b.time === "Now" ? Date.now() : new Date(b.time).getTime();
        return tb - ta;
      });
      const merged = filtered.slice(0, 10);
      setNotifications(merged);
      setNotificationCount(merged.filter((n) => n.unread).length);
    }

    const dismissed = loadDismissed();
    const msgQ = query(collection(db, "messages"), where("participants", "array-contains", user.email), limit(20));
    const unsub1 = onSnapshot(msgQ, (snap) => {
      msgItems.length = 0;
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
        .filter((msg): msg is Record<string, unknown> => {
          const sender = msg.sender as string | undefined;
          const receiver = msg.receiver as string | undefined;
          const read = msg.read as boolean | undefined;
          const isTarget = receiver ? receiver === user.email : sender !== user.email;
          return isTarget && !read && !dismissed.has(msg.id as string);
        });
      for (const msg of items.slice(0, 5)) {
        const sender = msg.sender as string | undefined;
        const listingId = msg.listingId as string | undefined;
        const offer = msg.offer as boolean | undefined;
        const offerStatus = msg.offerStatus as string | undefined;
        const createdAt = msg.createdAt as { toDate?: () => Date } | undefined;

        msgItems.push({
          id: msg.id as string,
          sender: sender || "",
          senderEmail: sender || "",
          listingTitle: (msg.listingTitle as string) || "",
          listingId: listingId || "",
          type: offer ? (offerStatus === "accepted" ? "sold" : "offer") : "message",
          time: createdAt?.toDate ? createdAt.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Now",
          href: `/messages?user=${encodeURIComponent(sender || "")}&listing=${encodeURIComponent(listingId || "")}`,
          unread: !(msg.read as boolean),
        });
      }
      merge();
    }, (err) => { console.error("Msg notification error:", err); merge(); });

    const purchaseQ = query(collection(db, "notifications"), where("targetEmail", "==", user.email), limit(20));
    const unsub2 = onSnapshot(purchaseQ, (snap) => {
      purchaseItems.length = 0;
      const items = snap.docs.filter((d) => d.data().read === false).map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
      for (const n of items) {
        const fromName = n.fromName as string | undefined;
        const fromEmail = n.fromEmail as string | undefined;
        const listingId = n.listingId as string | undefined;
        const createdAt = n.createdAt as { toDate?: () => Date } | undefined;

        const title = (n.title as string) || "Purchase update";
        purchaseItems.push({
          id: n.id as string,
          sender: title,
          senderEmail: fromEmail || "",
          listingTitle: (n.listingTitle as string) || "",
          listingId: listingId || "",
          type: (n.type as string) || "purchase",
          time: createdAt?.toDate ? createdAt.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Now",
          href: `/messages?user=${encodeURIComponent(fromEmail || "")}&listing=${encodeURIComponent(listingId || "")}`,
          unread: true,
        });
      }
      merge();
    }, (err) => { console.error("Purchase notification error:", err); merge(); });

    return () => { unsub1(); unsub2(); };
  }, [user?.email, user?.uid]);

  const msgCount = Math.max(0, notifications.filter((n) => n.type === "message" || n.type === "offer").length);
  const activityCount = Math.max(0, notifications.filter((n) => n.type !== "message" && n.type !== "offer").length);

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <header className="relative sticky top-0 z-[9999] border-b border-white/10 backdrop-blur-xl text-white" style={{ backgroundColor: "var(--nav-bg)" }}>
        <div className="flex h-16 md:h-24 items-center justify-between px-6">

         {/* LEFT */}
          <Link
            href="/"
            className="flex items-center gap-3 transition-transform duration-200 hover:scale-[1.02]"
          >
            <div className="relative w-10 h-10 md:w-12 md:h-12 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-full h-full">
                <circle cx="16" cy="16" r="14" fill="none" stroke="#38bdf8" strokeWidth="0.4" opacity="0.12" />
                <circle cx="16" cy="16" r="12" fill="none" stroke="#38bdf8" strokeWidth="0.3" opacity="0.08" />
                <path d="M2 9 C2 4, 8 1, 16 1 C24 1, 30 4, 30 9"
                  fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_6px_rgba(56,189,248,0.35)]" />
                <path d="M8 9 C8 5.5, 12 3, 16 3 C20 3, 24 5.5, 24 9"
                  fill="none" stroke="#38bdf8" strokeWidth="0.6" opacity="0.3" strokeLinecap="round" />
                <path d="M5.5 8 C6 5, 10.5 2.5, 16 2.5"
                  fill="none" stroke="#38bdf8" strokeWidth="0.5" opacity="0.2" strokeLinecap="round" />
                <path d="M26.5 8 C26 5, 21.5 2.5, 16 2.5"
                  fill="none" stroke="#38bdf8" strokeWidth="0.5" opacity="0.2" strokeLinecap="round" />
                <line x1="6" y1="9.5" x2="10" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.35" strokeLinecap="round" />
                <line x1="26" y1="9.5" x2="22" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.35" strokeLinecap="round" />
                <line x1="16" y1="9.5" x2="16" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.35" strokeLinecap="round" />
                <rect x="10.5" y="18" width="11" height="9" rx="1.5" ry="1.5"
                  fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(56,189,248,0.25)]" />
                <line x1="11" y1="21" x2="21" y2="21" stroke="#38bdf8" strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
                <path d="M12.5 22.5 L15 22.5" stroke="#38bdf8" strokeWidth="0.8" opacity="0.3" strokeLinecap="round" />
                <path d="M12.5 24.5 L17 24.5" stroke="#38bdf8" strokeWidth="0.8" opacity="0.2" strokeLinecap="round" />
                <path d="M18 23 L21 23 L21 20" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-lg md:text-2xl font-black tracking-[0.02em] text-white">
                SKY<span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">DROP</span>
              </span>
            </div>
          </Link>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-5">

          {/* NAV */}
          {user && (
            <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-white">
              <Link href="/post/ai" className="text-white transition hover:text-white/80">Sell</Link>
              <div className="relative group">
                <button className="flex items-center gap-1 text-white transition hover:text-white/80 cursor-pointer">
                  Browse
                  <svg className="h-3 w-3 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl p-2 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">📦</span> Physical Goods
                  </Link>
                  <Link href="/digital" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">📥</span> Digital Store
                  </Link>
                  <Link href="/services" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">🤝</span> Services
                  </Link>
                  <Link href="/rentals" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">🔑</span> Rentals
                  </Link>
                  <Link href="/vehicles" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">🚗</span> Vehicles
                  </Link>
                </div>
              </div>
              <Link href="/list-list" className="text-white transition hover:text-white/80">My Listings</Link>
              <Link href="/watchlist" className="text-white transition hover:text-white/80">Watchlist</Link>
              <Link href="/purchases" className="text-white transition hover:text-white/80">Purchases</Link>
              <Link href="/sales" className="text-white transition hover:text-white/80">Sales</Link>
            </nav>
          )}

          {/* HAMBURGER BUTTON */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-white active:scale-90 transition-all duration-200"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          {/* MOBILE DROPDOWN */}
          {mobileMenuOpen && (
            <div className="absolute top-full left-0 right-0 z-50 border-b border-zinc-800/50 bg-zinc-950/95 backdrop-blur-xl md:hidden animate-fade-in-up">
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <Link href="/post/ai" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Sell</Link>
                <div className="my-1.5 mx-4 border-t border-zinc-800/40" />
                <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70">Browse</div>
                <Link href="/" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>📦</span> Physical Goods</Link>
                <Link href="/digital" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>📥</span> Digital Store</Link>
                <Link href="/services" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>🤝</span> Services</Link>
                <Link href="/rentals" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>🔑</span> Rentals</Link>
                <Link href="/vehicles" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>🚗</span> Vehicles</Link>
                <div className="my-1.5 mx-4 border-t border-zinc-800/40" />
                <Link href="/list-list" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>My Listings</Link>
                <Link href="/watchlist" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Watchlist</Link>
                <Link href="/purchases" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Purchases</Link>
                <Link href="/sales" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Sales</Link>
                <div className="my-1.5 mx-4 border-t border-zinc-800/40" />
                {user ? (
                  <>
                    <Link href="/dashboard" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                    <Link href="/messages" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Messages</Link>
                    <Link href="/profile" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Profile</Link>
                    <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors">Logout</button>
                  </>
                ) : (
                  <Link href="/login" className="rounded-xl px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Login</Link>
                )}
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {user && (
            <Link href="/dashboard" className="hidden md:flex items-center gap-1.5 text-sm font-medium text-white transition hover:text-white/80">
              Dashboard
            </Link>
          )}

          {/* INBOX — responsive */}
          {user && (
            <Link
              href="/messages"
              className="relative h-9 w-9 items-center justify-center rounded-lg transition hover:bg-zinc-800/50 flex"
            >
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {msgCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-sky-500 px-1 text-[8px] font-bold text-white">
                  {msgCount > 9 ? "9+" : msgCount}
                </span>
              )}
            </Link>
          )}

          {/* DROP TOKENS — desktop only */}
          {user && dropTokenCount > 0 && (
            <Link href="/dashboard" className="hidden md:flex relative h-9 w-9 items-center justify-center rounded-lg transition hover:bg-zinc-800/50" title="Drop Tokens">
              <span className="text-sm">🎁</span>
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[8px] font-bold text-black">{dropTokenCount}</span>
            </Link>
          )}

          {/* NOTIFICATIONS — responsive */}
          {user && (
            <div className="relative">
              <div
                onClick={() =>
                  setShowNotifications(
                    !showNotifications
                  )
                }
                className="cursor-pointer"
              >
                <NotificationBell
                  count={activityCount}
                />
              </div>

              {showNotifications && (
                <NotificationDropdown
                  notifications={
                    notifications
                  }
                  onClose={() => setShowNotifications(false)}
                  onMarkSeen={markSeen}
                  onClearAll={() => {
                    notifications.forEach((n) => markSeen(n.id, n.type));
                    setNotifications([]);
                    setNotificationCount(0);
                  }}
                />
              )}
            </div>
          )}

          {/* PROFILE — desktop only */}
          <div className="hidden md:flex ml-auto items-center gap-5">
          {user ? (
            <>
              <Link
                href="/profile"
                className="hidden md:inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 font-bold text-white transition hover:border-white/30 hover:text-white"
              >
                {username || "Profile"}
              </Link>

              <button
                onClick={handleLogout}
                className="hidden md:inline-flex rounded-2xl border border-white/10 px-5 py-2.5 font-bold text-white transition hover:border-white/30 hover:text-white"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-2xl bg-sky-500 px-5 py-2.5 font-bold text-white transition hover:bg-sky-400"
            >
              Login
            </Link>
          )}
          </div>
        </div>
      </div>
      {/* Mobile bottom bar */}
      {user && (
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-white/[0.04] backdrop-blur-xl text-white md:hidden" style={{ backgroundColor: "var(--nav-bg)" }}>
          <div className="flex items-center justify-around py-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 4px) + 4px)" }}>
            <Link href="/"
              className={`flex flex-col items-center gap-px px-3 py-1.5 rounded-xl text-white transition active:scale-95 ${pathname === "/" ? "" : "opacity-80 hover:opacity-100"}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-[10px] font-semibold">Home</span>
            </Link>
            <Link href="/messages"
              className={`flex flex-col items-center gap-px px-3 py-1.5 rounded-xl text-white transition active:scale-95 ${pathname === "/messages" ? "" : "opacity-80 hover:opacity-100"}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-[10px] font-semibold">Inbox</span>
            </Link>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`flex flex-col items-center gap-px px-3 py-1.5 rounded-xl text-white transition active:scale-95 relative ${showNotifications ? "" : "opacity-80 hover:opacity-100"}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {activityCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-sky-500 px-1 text-[7px] font-bold text-white">
                  {activityCount > 9 ? "9+" : activityCount}
                </span>
              )}
              <span className="text-[10px] font-semibold">Alerts</span>
            </button>
            <Link href="/post/ai"
              className={`flex flex-col items-center gap-px px-3 py-1.5 rounded-xl text-white transition active:scale-95 ${pathname === "/post/ai" ? "" : "opacity-80 hover:opacity-100"}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[10px] font-semibold">Sell</span>
            </Link>
            <button onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center gap-px px-3 py-1.5 rounded-xl text-white opacity-80 hover:opacity-100 transition active:scale-95">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-[10px] font-semibold">Menu</span>
            </button>
          </div>
        </nav>
      )}
      <style jsx global>{`main { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); } @media (min-width: 768px) { main { padding-bottom: 0; } }`}</style>

    </header>
  );
}