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
  orderBy,
} from "firebase/firestore";

import {
  auth,
  db,
  onAuthStateChanged,
} from "../lib/firebase";

import NotificationBell from "./NotificationBell";
import NotificationDropdown from "./NotificationDropdown";
import SkyDropLogo from "./SkyDropLogo";
import { useProfile } from "../contexts/ProfileContext";
import { NotificationItem } from "../../types/firestore";
import { isAdminEmail } from "../lib/admin-check";
import {
  blockedEmailsFromDocs,
  countInboxUnreadMessages,
  isUnreadMessageForUser,
  messageInInboxList,
} from "../lib/messages-unread";


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

  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = user ? isAdminEmail(user.email) : false;

  function isActive(path: string): boolean {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  }

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
      auth.currentUser?.getIdToken().then((token) => {
        fetch("/api/mark-messages-read", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messageIds: [id] }),
        }).catch((e) => console.error("Failed to mark message read:", e));
      }).catch((e) => console.error("Failed to get token:", e));
    } else {
      updateDoc(doc(db, "notifications", id), { read: true }).catch((e) => console.error("Failed to mark notification read:", e));
    }
  }

  useEffect(() => {
    setDismissedIds(loadDismissed());
    try {
      setBlockedUsers(JSON.parse(localStorage.getItem("blockedUsers") || "[]"));
    } catch {}
    const onBlockedChanged = () => {
      try {
        setBlockedUsers(JSON.parse(localStorage.getItem("blockedUsers") || "[]"));
      } catch {}
    };
    window.addEventListener("blocked-users-changed", onBlockedChanged);
    return () => window.removeEventListener("blocked-users-changed", onBlockedChanged);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const blockedQ = collection(db, "users", user.uid, "blocked");
    const unsub = onSnapshot(
      blockedQ,
      (snap) => {
        const emails = blockedEmailsFromDocs(snap.docs);
        setBlockedUsers(emails);
        localStorage.setItem("blockedUsers", JSON.stringify(emails));
      },
      (err) => console.error("Failed to sync blocked users:", err)
    );
    return () => unsub();
  }, [user?.uid]);

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

  function firestoreErrorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error) {
      return String((error as { code: string }).code);
    }
    return "";
  }

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
    const msgQ = query(
      collection(db, "messages"),
      where("participants", "array-contains", user.email),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const unsub1 = onSnapshot(msgQ, (snap) => {
      msgItems.length = 0;
      const allMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
        Record<string, unknown> & { id: string }
      >;
      const unreadCount = countInboxUnreadMessages(allMsgs, user.email!, blockedUsers, dismissed);
      setInboxUnreadCount(unreadCount);
      const items = allMsgs.filter((msg) => {
        return (
          messageInInboxList(msg as Parameters<typeof messageInInboxList>[0], user.email!, blockedUsers) &&
          isUnreadMessageForUser(msg as Parameters<typeof isUnreadMessageForUser>[0], user.email) &&
          !dismissed.has(msg.id)
        );
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
    }, (err) => {
      const code = firestoreErrorCode(err);
      if (code === "failed-precondition") {
        console.warn("Messages index building or missing — inbox badge paused:", err);
      } else {
        console.error("Msg notification error:", err);
      }
      setInboxUnreadCount(0);
      msgItems.length = 0;
      merge();
    });

    const purchaseQ = query(
      collection(db, "notifications"),
      where("targetEmail", "==", user.email),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub2 = onSnapshot(purchaseQ, (snap) => {
      purchaseItems.length = 0;
      let unreadActivity = 0;
      const items = snap.docs
        .filter((d) => d.data().read === false)
        .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
      for (const n of items) {
        const nType = (n.type as string) || "purchase";
        // Chat duplicates live in messages collection — inbox badge/list use that source of truth.
        if (nType === "message" || nType === "offer") continue;

        unreadActivity += 1;

        if (purchaseItems.length >= 5) continue;
        const fromName = n.fromName as string | undefined;
        const fromEmail = n.fromEmail as string | undefined;
        const listingId = n.listingId as string | undefined;
        const createdAt = n.createdAt as { toDate?: () => Date } | undefined;

        const title = (n.title as string) || "Purchase update";
        const href = (nType === "price_drop" || nType === "saved_search_match")
          ? `/post/listing/${encodeURIComponent(listingId || "")}`
          : `/messages?user=${encodeURIComponent(fromEmail || "")}&listing=${encodeURIComponent(listingId || "")}`;
        purchaseItems.push({
          id: n.id as string,
          sender: title,
          senderEmail: fromEmail || "",
          listingTitle: (n.listingTitle as string) || "",
          listingId: listingId || "",
          type: nType,
          time: createdAt?.toDate ? createdAt.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Now",
          href,
          unread: true,
        });
      }
      setActivityUnreadCount(unreadActivity);
      merge();
    }, (err) => {
      const code = firestoreErrorCode(err);
      if (code === "failed-precondition") {
        console.warn("Notifications index building or missing — activity badge paused:", err);
      } else {
        console.error("Purchase notification error:", err);
      }
      setActivityUnreadCount(0);
      purchaseItems.length = 0;
      merge();
    });

    return () => { unsub1(); unsub2(); };
  }, [user?.email, user?.uid, blockedUsers]);

  const msgCount = Math.max(0, inboxUnreadCount);
  const activityCount = Math.max(0, activityUnreadCount);

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <header className="relative sticky top-0 z-[9999] border-b border-white/[0.04] backdrop-blur-xl" style={{ backgroundColor: "var(--nav-bg)" }}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />
      <div className="mx-auto flex h-16 items-center justify-between px-4 md:px-6 lg:max-w-7xl">

        {/* LEFT */}
        <SkyDropLogo size="md" href="/" />

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-4">

          {/* NAV */}
          {user && (
            <nav className="hidden lg:flex items-center gap-1 text-sm font-medium">
              <Link href="/post/ai" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/post/ai") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.04]"}`}>
                Sell
                {isActive("/post/ai") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
              </Link>
              <div className="relative group px-1">
                <button className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer ${isActive("/digital") || isActive("/services") || isActive("/rentals") || isActive("/wanted") || pathname === "/" ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.04]"}`}>
                  <span>Browse</span>
                  <svg className="h-3 w-3 transition-transform duration-300 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-xl p-2 shadow-2xl shadow-black/40 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-50">
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-t border-l border-white/[0.08] bg-zinc-950/95" />
                  <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 hover:text-white hover:bg-white/[0.06] transition-all duration-200 group/dd">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-xs group-hover/dd:bg-white/[0.08] transition-colors">📦</span>
                    <div><div className="text-sm font-medium">Physical Goods</div><div className="text-[10px] text-gray-400">Electronics, fashion, home</div></div>
                  </Link>
                  <Link href="/digital" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 hover:text-white hover:bg-white/[0.06] transition-all duration-200 group/dd">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-xs group-hover/dd:bg-white/[0.08] transition-colors">📥</span>
                    <div><div className="text-sm font-medium">Digital Store</div><div className="text-[10px] text-gray-400">E-books, software, assets</div></div>
                  </Link>
                  <Link href="/services" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 hover:text-white hover:bg-white/[0.06] transition-all duration-200 group/dd">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-xs group-hover/dd:bg-white/[0.08] transition-colors">🤝</span>
                    <div><div className="text-sm font-medium">Services</div><div className="text-[10px] text-gray-400">Freelance, consulting, gigs</div></div>
                  </Link>
                  <Link href="/rentals" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 hover:text-white hover:bg-white/[0.06] transition-all duration-200 group/dd">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-xs group-hover/dd:bg-white/[0.08] transition-colors">🔑</span>
                    <div><div className="text-sm font-medium">Rentals</div><div className="text-[10px] text-gray-400">Tools, equipment, cameras</div></div>
                  </Link>
                  <Link href="/wanted" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 hover:text-white hover:bg-white/[0.06] transition-all duration-200 group/dd">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-xs group-hover/dd:bg-white/[0.08] transition-colors">📋</span>
                    <div><div className="text-sm font-medium">Wanted</div><div className="text-[10px] text-gray-400">People looking to buy, hire, rent</div></div>
                  </Link>
                </div>
              </div>
              <Link href="/list-list" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/list-list") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.04]"}`}>
                My Listings
                {isActive("/list-list") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
              </Link>
              <Link href="/watchlist" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/watchlist") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.04]"}`}>
                Watchlist
                {isActive("/watchlist") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
              </Link>
              <Link href="/purchases" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/purchases") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.04]"}`}>
                Purchases
                {isActive("/purchases") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
              </Link>
              <Link href="/sales" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/sales") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.04]"}`}>
                Sales
                {isActive("/sales") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
              </Link>
            </nav>
          )}

          {/* HAMBURGER BUTTON */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              className="md:hidden relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nav-ice)] active:scale-90 transition-all duration-200 hover:bg-white/[0.06]"
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
            <div className="absolute top-full left-0 right-0 z-50 border-b border-white/[0.06] bg-zinc-950/98 backdrop-blur-2xl md:hidden animate-fade-in-up shadow-2xl shadow-black/40">
              <div className="flex flex-col gap-1 p-3 max-h-[80vh] overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Actions</div>
                <Link href="/post/ai" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/post/ai") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">💰</span>
                  Sell
                </Link>

                <div className="my-1.5 mx-3 border-t border-white/[0.04]" />
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Browse</div>
                <Link href="/" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/") && pathname === "/" ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm">📦</span><div><div className="font-bold">Physical Goods</div><div className="text-[10px] text-gray-400">Electronics, fashion, home</div></div></Link>
                <Link href="/digital" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/digital") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm">📥</span><div><div className="font-bold">Digital Store</div><div className="text-[10px] text-gray-400">E-books, software, assets</div></div></Link>
                <Link href="/services" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/services") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm">🤝</span><div><div className="font-bold">Services</div><div className="text-[10px] text-gray-400">Freelance, consulting, gigs</div></div></Link>
                <Link href="/rentals" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/rentals") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm">🔑</span><div><div className="font-bold">Rentals</div><div className="text-[10px] text-gray-400">Tools, equipment, cameras</div></div></Link>
                <Link href="/wanted" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/wanted") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm">📋</span><div><div className="font-bold">Wanted</div><div className="text-[10px] text-gray-400">People looking to buy, hire, rent</div></div></Link>

                <div className="my-1.5 mx-3 border-t border-white/[0.04]" />
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Your Stuff</div>
                <Link href="/list-list" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/list-list") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>My Listings</Link>
                <Link href="/watchlist" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/watchlist") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>Watchlist</Link>
                <Link href="/purchases" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/purchases") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>Purchases</Link>
                <Link href="/sales" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/sales") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>Sales</Link>

                <div className="my-1.5 mx-3 border-t border-white/[0.04]" />
                {user ? (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Account</div>
                    <Link href="/dashboard" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/dashboard") ? "text-sky-300 bg-sky-500/10" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">📊</span>
                      Dashboard
                    </Link>
                    {isAdmin && (
                      <Link href="/manage" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/manage") ? "text-red-400 bg-red-500/10" : "text-red-400/60 hover:bg-red-500/10 active:bg-red-500/15"}`} onClick={() => setMobileMenuOpen(false)}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-sm">🛡️</span>
                        Manage
                      </Link>
                    )}
                    <Link href="/messages" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/messages") ? "text-sky-300 bg-sky-500/10" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">💬</span>
                      Messages
                    </Link>
                    <Link href="/profile" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/profile") ? "text-sky-300 bg-sky-500/10" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">👤</span>
                      Profile
                    </Link>
                    <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-colors w-full text-left">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-sm">🚪</span>
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors" onClick={() => setMobileMenuOpen(false)}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">🔐</span>
                      Login
                    </Link>
                    <Link href="/login?signup=1" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-sky-400 hover:text-sky-300 hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors" onClick={() => setMobileMenuOpen(false)}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">✨</span>
                      Create Account
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}

          {/* RIGHT ICONS */}
          <div className="flex items-center gap-1">
            {user && (
              <Link
                href="/messages"
                className={`relative h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 flex group ${isActive("/messages") ? "bg-white/[0.08] text-[var(--nav-ice)]" : "hover:bg-white/[0.06] text-[var(--nav-ice-muted)] hover:text-[var(--nav-ice)]"}`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {msgCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-500 px-1 text-[8px] font-bold text-white shadow-[0_0_6px_rgba(56,189,248,0.4)]">
                    {msgCount > 9 ? "9+" : msgCount}
                  </span>
                )}
              </Link>
            )}

            <button
              onClick={() => {
                const isLight = document.documentElement.classList.toggle("light");
                localStorage.setItem("theme", isLight ? "light" : "dark");
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--nav-ice-muted)] hover:bg-white/[0.06] hover:text-[var(--nav-ice)] transition-all duration-200"
              aria-label="Toggle theme"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </button>

            {user && (
              <div className="relative">
                <div
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`cursor-pointer transition-all duration-200 hover:scale-105 rounded-xl p-1.5 ${showNotifications ? "bg-white/[0.08] text-[var(--nav-ice)]" : "text-[var(--nav-ice-muted)] hover:text-[var(--nav-ice)]"}`}
                >
                  <NotificationBell count={activityCount} />
                </div>

                {showNotifications && (
                  <NotificationDropdown
                    notifications={notifications}
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
          </div>

          {/* PROFILE — desktop only */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <div className="relative group">
                <button className={`inline-flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-sm font-bold transition-all duration-200 active:scale-[0.97] ${isActive("/profile") ? "text-white border-sky-500/30 bg-sky-500/10" : "text-gray-200 hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-white"}`}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  {username || "Profile"}
                  <svg className="h-3 w-3 transition-transform duration-300 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute top-full right-0 mt-2 w-56 rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-xl p-2 shadow-2xl shadow-black/40 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-50">
                  <div className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 border-t border-l border-white/[0.08] bg-zinc-950/95" />
                  <Link href="/dashboard" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${isActive("/dashboard") ? "text-sky-300 bg-sky-500/10" : "text-gray-200 hover:text-white hover:bg-white/[0.06]"}`}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">📊</span>
                    Dashboard
                  </Link>
                  <Link href="/profile" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${isActive("/profile") ? "text-sky-300 bg-sky-500/10" : "text-gray-200 hover:text-white hover:bg-white/[0.06]"}`}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">👤</span>
                    Profile
                  </Link>
                  {isAdmin && (
                    <Link href="/manage" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${isActive("/manage") ? "text-red-400 bg-red-500/10" : "text-red-400/60 hover:text-red-400 hover:bg-red-500/10"}`}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-sm">🛡️</span>
                      Manage
                    </Link>
                  )}
                  <div className="my-1.5 border-t border-white/[0.04]" />
                  <button onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-colors w-full text-left">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-sm">🚪</span>
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/25 hover:brightness-110 active:scale-[0.97]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
      {/* Mobile bottom bar */}
      {user && (
        <nav className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-white/[0.04] bg-zinc-950/90 backdrop-blur-xl md:hidden" style={{ backgroundColor: "var(--nav-bg)" }}>
          <div className="flex items-center justify-around py-1.5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 4px) + 4px)" }}>
            {[
              { href: "/", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
              { href: "/messages", label: "Inbox", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
            ].map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200 active:scale-90 ${active ? "text-sky-300 bg-white/[0.06]" : "text-[var(--nav-ice-faint)] hover:text-[var(--nav-ice-muted)]"}`}>
                  {active && <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-[3px] w-6 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <span className="text-[9px] font-semibold tracking-wide">{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200 active:scale-90 ${showNotifications ? "text-sky-300 bg-white/[0.06]" : "text-[var(--nav-ice-faint)] hover:text-[var(--nav-ice-muted)]"}`}>
              {showNotifications && <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-[3px] w-6 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {activityCount > 0 && (
                <span className="absolute -top-0.5 right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-sky-500 px-1 text-[7px] font-bold text-white shadow-[0_0_4px_rgba(56,189,248,0.3)]">
                  {activityCount > 9 ? "9+" : activityCount}
                </span>
              )}
              <span className="text-[9px] font-semibold tracking-wide">Alerts</span>
            </button>
            <Link href="/post/ai"
              className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200 active:scale-90 ${pathname === "/post/ai" ? "text-sky-300 bg-white/[0.06]" : "text-[var(--nav-ice-faint)] hover:text-[var(--nav-ice-muted)]"}`}>
              {pathname === "/post/ai" && <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-[3px] w-6 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[9px] font-semibold tracking-wide">Sell</span>
            </Link>
            <button onClick={() => setMobileMenuOpen(true)}
              className="relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200 active:scale-90 text-[var(--nav-ice-faint)] hover:text-[var(--nav-ice-muted)]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-[9px] font-semibold tracking-wide">Menu</span>
            </button>
          </div>
        </nav>
      )}
      <style jsx global>{`main { padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)); } @media (min-width: 768px) { main { padding-bottom: 0; } }`}</style>

    </header>
  );
}
