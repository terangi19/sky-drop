"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  onAuthStateChanged,
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
  orderBy,
  limit,
} from "firebase/firestore";

import {
  auth,
  db,
} from "../lib/firebase";

import NotificationBell from "./NotificationBell";
import NotificationDropdown from "./NotificationDropdown";
import { useProfile } from "../contexts/ProfileContext";
import { NotificationItem } from "../../types/firestore";


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

  function loadDismissed(): Set<string> {
    try {
      const raw = localStorage.getItem("dismissedNotifications");
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set<string>(); }
  }

  function markSeen(id: string) {
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissedIds(next);
    try {
      localStorage.setItem("dismissedNotifications", JSON.stringify([...next]));
    } catch {}
    updateDoc(doc(db, "notifications", id), { read: true }).catch(() => {});
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
    const q = query(collection(db, "dropTokens"), where("ownerId", "==", user.uid), where("status", "==", "available"));
    const unsub = onSnapshot(q, (snap) => setDropTokenCount(snap.docs.length));
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.email) return;

    const all: NotificationItem[] = [];
    let msgDone = false;
    let purchaseDone = false;

    function merge() {
      if (!msgDone || !purchaseDone) return;
      const dismissed = loadDismissed();
      const filtered = all.filter((n) => !dismissed.has(n.id));
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
      all.length = 0;
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

        all.push({
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
      msgDone = true;
      merge();
    }, (err) => { console.error("Msg notification error:", err); msgDone = true; merge(); });

    const purchaseQ = query(collection(db, "notifications"), where("targetEmail", "==", user.email), where("read", "==", false));
    const unsub2 = onSnapshot(purchaseQ, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
      for (const n of items) {
        const fromName = n.fromName as string | undefined;
        const fromEmail = n.fromEmail as string | undefined;
        const listingId = n.listingId as string | undefined;
        const createdAt = n.createdAt as { toDate?: () => Date } | undefined;

        all.push({
          id: n.id as string,
          sender: fromName || fromEmail || "",
          senderEmail: fromEmail || "",
          listingTitle: (n.listingTitle as string) || "",
          listingId: listingId || "",
          type: "purchase",
          time: createdAt?.toDate ? createdAt.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Now",
          href: `/messages?user=${encodeURIComponent(fromEmail || "")}&listing=${encodeURIComponent(listingId || "")}`,
          unread: true,
        });
      }
      purchaseDone = true;
      merge();
    }, (err) => console.error("Purchase notification error:", err));

    return () => { unsub1(); unsub2(); };
  }, [user]);

  const msgCount = notifications.filter((n) => n.type === "message" || n.type === "offer").length;
  const activityCount = notifications.filter((n) => n.type !== "message" && n.type !== "offer" && !dismissedIds.has(n.id)).length;

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <header className="relative sticky top-0 z-[9999] border-b border-white/10 backdrop-blur-xl" style={{ backgroundColor: "var(--nav-bg)" }}>
      <div className="flex h-16 md:h-24 items-center justify-between px-6">

         {/* LEFT */}
          <Link
            href="/"
            className="flex items-center gap-3 transition-transform duration-200 hover:scale-[1.02]"
          >
            <div className="relative w-10 h-10 md:w-12 md:h-12 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-full h-full">
                {/* Parachute canopy */}
                <path d="M2 10C2 5.5 8 2 16 2s14 3.5 14 8"
                  fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 10c0 1 0.5 2 1 3"
                  fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M30 10c0 1-0.5 2-1 3"
                  fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round"/>
                {/* Parachute strings */}
                <path d="M7 12c2-0.5 5-1 9-1s7 0.5 9 1"
                  fill="none" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5" strokeLinecap="round"/>
                <line x1="7" y1="12" x2="10" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5"/>
                <line x1="25" y1="12" x2="22" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5"/>
                <line x1="16" y1="12" x2="16" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5"/>
                {/* Falling box */}
                <rect x="10" y="18" width="12" height="10" rx="1.5" ry="1.5"
                  fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinejoin="round"/>
                {/* Box lid line */}
                <line x1="10" y1="21" x2="22" y2="21" stroke="#38bdf8" strokeWidth="1.2" opacity="0.6"/>
                {/* Box highlight */}
                <path d="M12 23h3" stroke="#38bdf8" strokeWidth="0.8" opacity="0.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-lg md:text-2xl font-black tracking-tight" style={{ color: "var(--foreground)" }}>
                SKY<span className="text-sky-400">DROP</span>
              </span>
            </div>
          </Link>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-5">

          {/* NAV */}
          {user && (
            <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-[var(--foreground)]">
              <Link href="/trade-feed" className="flex items-center gap-1.5 transition hover:text-sky-400">
                <span className="font-bold">Live Trade</span>
                <span className="flex h-1.5 w-1.5 rounded-full bg-red-500/80" />
              </Link>
              <Link href="/post/ai" className="transition hover:text-sky-400">Quick Post</Link>
              <div className="relative group">
                <button className="flex items-center gap-1 transition hover:text-sky-400 cursor-pointer">
                  Browse
                  <svg className="h-3 w-3 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl p-2 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">📦</span> Physical Goods
                  </Link>
                  <Link href="/digital" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">📥</span> Digital Store
                  </Link>
                  <Link href="/services" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">🤝</span> Services
                  </Link>
                  <Link href="/rentals" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">🔑</span> Rentals
                  </Link>
                  <Link href="/events" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">🎟</span> Events
                  </Link>
                  <Link href="/vehicles" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">🚗</span> Vehicles
                  </Link>
                  <Link href="/jobs" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">💼</span> Jobs
                  </Link>
                  <Link href="/property" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-zinc-800/60 transition-colors">
                    <span className="text-base">🏠</span> Property
                  </Link>
                </div>
              </div>
              <Link href="/list-list" className="transition hover:text-sky-400">My Listings</Link>
              <Link href="/watchlist" className="transition hover:text-sky-400">Watchlist</Link>
              <Link href="/purchases" className="transition hover:text-sky-400">Purchases</Link>
              <Link href="/sales" className="transition hover:text-sky-400">Sales</Link>
            </nav>
          )}

          {/* HAMBURGER BUTTON */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-[var(--foreground)] active:scale-90 transition-all duration-200"
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
            <div className="absolute top-full left-0 right-0 z-50 border-b border-zinc-800/50 bg-zinc-950/95 backdrop-blur-xl md:hidden">
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <Link href="/trade-feed" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>
                    <span className="flex items-center gap-1.5">
                      <span>Live Trade</span>
                      <span className="flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                </Link>
                <Link href="/post/ai" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Quick Post</Link>
                <div className="my-1.5 mx-4 border-t border-zinc-800/40" />
                <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Browse</div>
                <Link href="/" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>📦</span> Physical Goods</Link>
                <Link href="/digital" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>📥</span> Digital Store</Link>
                <Link href="/services" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>🤝</span> Services</Link>
                <Link href="/rentals" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>🔑</span> Rentals</Link>
                <Link href="/events" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>🎟</span> Events</Link>
                <Link href="/vehicles" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>🚗</span> Vehicles</Link>
                <Link href="/jobs" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>💼</span> Jobs</Link>
                <Link href="/property" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}><span>🏠</span> Property</Link>
                <div className="my-1.5 mx-4 border-t border-zinc-800/40" />
                <Link href="/list-list" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>My Listings</Link>
                <Link href="/watchlist" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Watchlist</Link>
                <Link href="/purchases" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Purchases</Link>
                <Link href="/sales" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Sales</Link>
                <div className="my-1.5 mx-4 border-t border-zinc-800/40" />
                {user ? (
                  <>
                    <Link href="/dashboard" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                    <Link href="/messages" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Messages</Link>
                    <Link href="/profile" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Profile</Link>
                    <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-red-400 hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors">Logout</button>
                  </>
                ) : (
                  <Link href="/login" className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-800/60 active:bg-zinc-800/80 transition-colors" onClick={() => setMobileMenuOpen(false)}>Login</Link>
                )}
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {user && (
            <Link href="/dashboard" className="hidden md:flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)] transition hover:text-sky-400">
              Dashboard
            </Link>
          )}

          {/* INBOX — desktop only */}
          {user && (
            <Link
              href="/messages"
              className="hidden md:flex relative h-9 w-9 items-center justify-center rounded-lg transition hover:bg-zinc-800/50"
            >
              <svg className="h-4 w-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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

          {/* NOTIFICATIONS — desktop only */}
          {user && (
            <div className="hidden md:block relative">
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
                className="hidden md:inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 font-bold text-[var(--foreground)] transition hover:border-sky-400 hover:text-sky-400"
              >
                {username || "Profile"}
              </Link>

              <button
                onClick={handleLogout}
                className="hidden md:inline-flex rounded-2xl border border-white/10 px-5 py-2.5 font-bold text-[var(--foreground)] transition hover:border-red-500 hover:text-red-400"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-2xl bg-sky-500 px-5 py-2.5 font-bold text-[var(--foreground)] transition hover:bg-sky-400"
            >
              Login
            </Link>
          )}
          </div>
        </div>
      </div>
      {/* Fixed bottom nav — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-white/[0.04] backdrop-blur-xl md:hidden overflow-x-auto scrollbar-none snap-x snap-mandatory" style={{ backgroundColor: "var(--nav-bg)" }}>
          <div className="flex items-center py-1.5 px-1.5 gap-0.5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 4px) + 4px)" }}>
            {[
                { href: "/", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
                { href: "/profile", label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
                { href: "/dashboard", label: "Dashboard", icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" },
                { href: "/messages", label: "Inbox", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", badge: "msg" },
                { href: "/post/ai", label: "Sell", icon: "M12 4v16m8-8H4" },
              { href: "/list-list", label: "Listings", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
              { href: "/watchlist", label: "Watchlist", icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" },
              { href: "/purchases", label: "Purchases", icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" },
              { href: "/sales", label: "Sales", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
              ...(user
                ? [{ action: "logout", label: "Logout", icon: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" }]
                : [{ href: "/login", label: "Login", icon: "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" }]
              ),
            ].map((item: any) =>
              item.action === "logout" ? (
                <button key="logout" onClick={handleLogout}
                  className="flex flex-col items-center gap-px px-2 py-1.5 rounded-xl shrink-0 snap-start transition active:scale-95 text-red-400/70"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <span className="text-[8px] font-semibold whitespace-nowrap">{item.label}</span>
                </button>
              ) : (
                <Link key={item.href} href={item.href}
                  className={`relative flex flex-col items-center gap-px px-2 py-1.5 rounded-xl shrink-0 snap-start transition active:scale-95 ${
                    pathname === item.href ? "text-sky-400" : "text-[var(--muted)]"
                  }`}
                >
                  {item.badge === "msg" && msgCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-sky-500 px-0.5 text-[7px] font-bold text-white">{msgCount > 9 ? "9+" : msgCount}</span>
                  )}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <span className="text-[8px] font-semibold whitespace-nowrap">{item.label}</span>
                </Link>
              )
            )}
          </div>
        </nav>
        <div className="fixed bottom-0 right-0 z-[9999] w-10 h-14 bg-gradient-to-l from-[var(--nav-bg)] to-transparent pointer-events-none md:hidden" />
      <style jsx global>{`@keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } main { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); } @media (min-width: 768px) { main { padding-bottom: 0; } }`}</style>

    </header>
  );
}