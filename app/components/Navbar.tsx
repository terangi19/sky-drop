"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  signOut,
} from "firebase/auth";

import {
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
} from "../lib/firebase";

import NotificationBell from "./NotificationBell";
import SkyDropLogo from "./SkyDropLogo";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { isAdminEmail } from "../lib/admin-check";
import {
  blockedEmailsFromDocs,
  countInboxUnreadMessages,
} from "../lib/messages-unread";
import { useFeedback } from "../contexts/FeedbackContext";
import AccountMenuContent from "./AccountMenu";
import { AppMenuPanel } from "./ui/AppMenu";

const MOBILE_NAV_ITEMS = [
  {
    href: "/",
    label: "Browse",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    href: "/purchases",
    label: "Buys",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    href: "/post/ai",
    label: "Sell",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    href: "/messages",
    label: "Inbox",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.75 15.75v-.75a5.25 5.25 0 0110.5 0v.75c0 .728-.195 1.413-.536 2.005A8.966 8.966 0 0121 12z" />
      </svg>
    ),
  },
] as const;

const BROWSE_LINKS = [
  { href: "/", label: "All Items", desc: "Browse the full marketplace" },
  { href: "/", label: "Physical Items", desc: "Cars, tech, fashion, home & more" },
  { href: "/services", label: "Services & Gigs", desc: "Freelance work, consulting, help" },
  { href: "/rentals", label: "Rentals", desc: "Tools, equipment, cameras for rent" },
  { href: "/wanted", label: "Wanted Ads", desc: "Items people are looking for" },
] as const;


export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { username } = useProfile();
  const { openFeedback } = useFeedback();

  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const toggleLockRef = useRef(false);

  const toggleMobileMenu = useCallback(() => {
    if (toggleLockRef.current) return;
    toggleLockRef.current = true;
    setMobileMenuOpen(prev => !prev);
    setTimeout(() => { toggleLockRef.current = false; }, 300);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

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

  useEffect(() => {
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
    const blockedQ = query(collection(db, "users", user.uid, "blocked"), limit(100));
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

  function firestoreErrorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error) {
      return String((error as { code: string }).code);
    }
    return "";
  }

  useEffect(() => {
    if (!user?.email) return;

    const dismissed = loadDismissed();
    const msgQ = query(
      collection(db, "messages"),
      where("participants", "array-contains", user.email),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const unsub1 = onSnapshot(msgQ, (snap) => {
      const allMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
        Record<string, unknown> & { id: string }
      >;
      setInboxUnreadCount(countInboxUnreadMessages(allMsgs, user.email!, blockedUsers, dismissed));
    }, (err) => {
      const code = firestoreErrorCode(err);
      if (code === "failed-precondition") {
        console.warn("Messages index building or missing — inbox badge paused:", err);
      } else {
        console.error("Msg notification error:", err);
      }
      setInboxUnreadCount(0);
    });

    const purchaseQ = query(
      collection(db, "notifications"),
      where("targetEmail", "==", user.email),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub2 = onSnapshot(purchaseQ, (snap) => {
      let unreadActivity = 0;
      for (const d of snap.docs) {
        const data = d.data();
        if (data.read !== false) continue;
        const nType = (data.type as string) || "purchase";
        if (nType === "message" || nType === "offer") continue;
        unreadActivity += 1;
      }
      setActivityUnreadCount(unreadActivity);
    }, (err) => {
      const code = firestoreErrorCode(err);
      if (code === "failed-precondition") {
        console.warn("Notifications index building or missing — activity badge paused:", err);
      } else {
        console.error("Purchase notification error:", err);
      }
      setActivityUnreadCount(0);
    });

    return () => { unsub1(); unsub2(); };
  }, [user?.email, user?.uid, blockedUsers]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const isInsideMenu = mobileMenuRef.current?.contains(target);
      const isInsideToggle = hamburgerRef.current?.contains(target);
      if (!isInsideMenu && !isInsideToggle) {
        closeMobileMenu();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen, closeMobileMenu]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMobileMenu();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen, closeMobileMenu]);

  useEffect(() => {
    closeMobileMenu();
  }, [pathname, closeMobileMenu]);

  const msgCount = Math.max(0, inboxUnreadCount);
  const activityCount = Math.max(0, activityUnreadCount);

  async function handleLogout() {
    await signOut(auth);
  }

  function toggleTheme() {
    const isLight = document.documentElement.classList.toggle("light");
    try {
      localStorage.setItem("theme", isLight ? "light" : "dark");
    } catch {}
  }

  const browseActive =
    pathname === "/" ||
    ["/services", "/rentals", "/wanted", "/vehicles", "/property", "/jobs", "/events"].some(
      (p) => pathname.startsWith(p)
    );

  return (
    <header className="relative sticky top-0 z-[9999] border-b border-white/[0.04] backdrop-blur-xl light:border-black/[0.08]" style={{ backgroundColor: "var(--nav-bg)" }}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/30 to-transparent light:via-sky-600/20" />
      <div className="mx-auto flex h-16 items-center justify-between px-4 md:px-6 lg:max-w-7xl">

        {/* LEFT */}
        <SkyDropLogo size="lg" href="/" />

        {/* SEARCH - Desktop (hidden on homepage to avoid duplicate with hero search) */}
        {pathname !== "/" && (
          <div className="hidden lg:block mx-8 flex-1 max-w-md">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search listings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                  }
                }}
                className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] pl-10 pr-4 py-2 text-sm text-white placeholder:text-[var(--nav-ice-muted)] outline-none focus:border-sky-500/30 focus:bg-white/[0.06] transition-all"
                aria-label="Search listings"
              />
            </div>
          </div>
        )}

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-2">

          {/* NAV */}
          <nav className="hidden lg:flex items-center gap-1 text-sm font-medium">
            {user && (
              <Link href="/post/ai" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/post/ai") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.04] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.04]"}`}>
                Sell
                {isActive("/post/ai") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
              </Link>
            )}
            <div className="relative group px-1">
              <Link href="/" className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200 ${browseActive ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.04] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.04]"}`}>
                <span>Browse</span>
                <svg className="h-3 w-3 transition-transform duration-300 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </Link>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-xl p-2 shadow-2xl shadow-black/40 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-50 light:border-black/[0.12] light:bg-white/95 light:shadow-black/20">
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-t border-l border-white/[0.08] bg-zinc-950/95 light:border-black/[0.12] light:bg-white/95" />
                {BROWSE_LINKS.map((item) => (
                  <Link key={item.label} href={item.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-200 hover:text-white hover:bg-white/[0.06] transition-all duration-200 group/dd light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.04]">
                    <div><div className="text-sm font-medium">{item.label}</div><div className="text-[10px] text-gray-400 light:text-gray-500">{item.desc}</div></div>
                  </Link>
                ))}
              </div>
            </div>
            {user && (
              <>
                <Link href="/list-list" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/list-list") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.04] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.04]"}`}>
                  My Listings
                  {isActive("/list-list") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
                </Link>
                <Link href="/watchlist" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/watchlist") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.04] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.04]"}`}>
                  Watchlist
                  {isActive("/watchlist") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
                </Link>
                <Link href="/purchases" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/purchases") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.04] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.04]"}`}>
                  Purchases
                  {isActive("/purchases") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
                </Link>
                <Link href="/sales" className={`relative px-3 py-2 rounded-lg transition-all duration-200 ${isActive("/sales") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.04] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.04]"}`}>
                  Sales
                  {isActive("/sales") && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />}
                </Link>
              </>
            )}
          </nav>

          {/* HAMBURGER BUTTON */}
            <button
              ref={hamburgerRef}
              onClick={toggleMobileMenu}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="lg:hidden relative flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.05] text-[var(--nav-ice)] active:scale-95 transition-all duration-200 hover:bg-white/[0.1] hover:border-white/[0.15]"
            >
              <div className="relative h-5 w-5">
                <svg
                  className={`absolute inset-0 h-5 w-5 transition-all duration-200 ${
                    mobileMenuOpen ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'
                  }`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <svg
                  className={`absolute inset-0 h-5 w-5 transition-all duration-200 ${
                    mobileMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'
                  }`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </button>
          {/* MOBILE DROPDOWN */}
            <div
              ref={mobileMenuRef}
              className={`absolute top-full left-0 right-0 z-50 border-b border-white/[0.06] bg-zinc-950/98 backdrop-blur-2xl lg:hidden shadow-2xl shadow-black/40 light:border-black/[0.12] light:bg-white/98 light:shadow-black/20 transition-all duration-200 ease-out ${
                mobileMenuOpen
                  ? 'opacity-100 translate-y-0 visible pointer-events-auto'
                  : 'opacity-0 -translate-y-1.5 invisible pointer-events-none'
              }`}>
              <div className="flex flex-col gap-1 p-3 max-h-[80vh] overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 light:text-gray-500">Actions</div>
                <Link href={user ? "/post/ai" : "/signup?redirect=/post/ai"} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/post/ai") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm light:bg-sky-500/10">Sell</span>
                  Sell
                </Link>

                <div className="my-1.5 mx-3 border-t border-white/[0.04] light:border-black/[0.08]" />
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 light:text-gray-500">Browse</div>
                <Link href="/" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/") && pathname === "/" ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm light:bg-black/[0.04]">Box</span><div><div className="font-bold">Physical Goods</div><div className="text-[10px] text-gray-400 light:text-gray-500">Electronics, fashion, home</div></div></Link>
                <Link href="/services" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/services") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm light:bg-black/[0.04]">Service</span><div><div className="font-bold">Services</div><div className="text-[10px] text-gray-400 light:text-gray-500">Freelance, consulting, gigs</div></div></Link>
                <Link href="/rentals" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/rentals") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm light:bg-black/[0.04]">Key</span><div><div className="font-bold">Rentals</div><div className="text-[10px] text-gray-400 light:text-gray-500">Tools, equipment, cameras</div></div></Link>
                <Link href="/wanted" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive("/wanted") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm light:bg-black/[0.04]">List</span><div><div className="font-bold">Wanted</div><div className="text-[10px] text-gray-400 light:text-gray-500">People looking to buy, hire, rent</div></div></Link>

                <div className="my-1.5 mx-3 border-t border-white/[0.04] light:border-black/[0.08]" />
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 light:text-gray-500">Your Stuff</div>
                <Link href="/list-list" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/list-list") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>My Listings</Link>
                <Link href="/watchlist" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/watchlist") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>Watchlist</Link>
                <Link href="/purchases" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/purchases") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>Purchases</Link>
                <Link href="/sales" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/sales") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>Sales</Link>

                <div className="my-1.5 mx-3 border-t border-white/[0.04] light:border-black/[0.08]" />
                <button
                  onClick={toggleTheme}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-sm light:bg-black/[0.04]">☀</span>
                  Toggle theme
                </button>
                <div className="my-1.5 mx-3 border-t border-white/[0.04] light:border-black/[0.08]" />
                {authLoading ? (
                  <div className="px-3 py-3">
                    <div className="h-10 animate-pulse rounded-xl bg-white/[0.06]" />
                  </div>
                ) : user ? (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 light:text-gray-500">Account</div>
                    <div className="px-1">
                      <AccountMenuContent
                      pathname={pathname}
                      username={username}
                      userEmail={user.email}
                      isAdmin={isAdmin}
                      onLogout={handleLogout}
                        onNavigate={closeMobileMenu}
                      />
                    </div>
                    <div className="my-1.5 mx-3 border-t border-white/[0.04] light:border-black/[0.08]" />
                    <Link href="/messages" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/messages") ? "text-white bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.3)] light:text-white light:bg-sky-600" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>
                      Messages
                      {msgCount > 0 && (
                        <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">
                          {msgCount > 9 ? "9+" : msgCount}
                        </span>
                      )}
                    </Link>
                    <Link href="/faqs" className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${isActive("/faqs") ? "text-sky-300 bg-sky-500/10 light:text-sky-600 light:bg-sky-500/10" : "text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]"}`} onClick={() => setMobileMenuOpen(false)}>
                      Help
                    </Link>
                    <button onClick={() => { openFeedback(); setMobileMenuOpen(false); }} className="flex w-full rounded-xl px-3 py-3 text-left text-sm font-bold text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]">
                      Feedback
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-gray-200 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors light:text-gray-700 light:hover:text-gray-900 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]" onClick={() => setMobileMenuOpen(false)}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm light:bg-sky-500/10">Key</span>
                      Login
                    </Link>
                    <Link href="/signup" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-sky-400 hover:text-sky-300 hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors light:text-sky-600 light:hover:text-sky-700 light:hover:bg-black/[0.06] light:active:bg-black/[0.08]" onClick={() => setMobileMenuOpen(false)}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">Plus</span>
                      Create Account
                    </Link>
                  </>
                )}
              </div>
            </div>

          {/* RIGHT ICONS */}
          <div className="hidden md:flex items-center gap-1">
            {authLoading ? (
              <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
            ) : user ? (
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
            ) : null}

            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--nav-ice-muted)] hover:bg-white/[0.06] hover:text-[var(--nav-ice)] transition-all duration-200"
              aria-label="Toggle theme"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </button>

            {!authLoading && user && (
              <Link
                href="/notifications"
                aria-label="Notifications"
                className={`relative h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 flex group ${isActive("/notifications") ? "bg-white/[0.08] text-[var(--nav-ice)]" : "hover:bg-white/[0.06] text-[var(--nav-ice-muted)] hover:text-[var(--nav-ice)]"}`}
              >
                <NotificationBell count={activityCount} className="h-full w-full bg-transparent hover:bg-transparent" />
              </Link>
            )}
          </div>

          {/* PROFILE — desktop only */}
          <div className="hidden md:flex items-center gap-2">
            {authLoading ? (
              <div className="h-9 w-28 animate-pulse rounded-xl bg-white/[0.06]" />
            ) : user ? (
              <div className="relative group">
                <button
                  type="button"
                  aria-haspopup="menu"
                  className={`inline-flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-sm font-bold transition-all duration-200 active:scale-[0.97] ${isActive("/profile") || isActive("/dashboard") ? "text-white border-sky-500/30 bg-sky-500/10" : "text-gray-200 hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-white"}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  {username || "Profile"}
                  <svg className="h-3 w-3 transition-transform duration-300 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute top-full right-0 z-50 mt-2 w-[220px] opacity-0 invisible translate-y-2 transition-all duration-200 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0">
                  <AppMenuPanel arrow="top-right">
                      <AccountMenuContent
                      pathname={pathname}
                      username={username}
                      userEmail={user.email}
                      isAdmin={isAdmin}
                      onLogout={handleLogout}
                    />
                  </AppMenuPanel>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-300 transition-all duration-200 hover:bg-sky-500/20 hover:text-white active:scale-[0.97] light:text-sky-600 light:hover:text-sky-700"
                >
                  Sign up
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/25 hover:brightness-110 active:scale-[0.97]"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Mobile bottom bar — icon + label, 44px+ touch targets */}
      {!authLoading && user && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-white/[0.06] bg-zinc-950/95 backdrop-blur-xl lg:hidden"
          style={{ backgroundColor: "var(--nav-bg)" }}
          aria-label="Primary"
        >
          <div
            className="mx-auto flex max-w-lg items-stretch justify-around px-1"
            style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom, 0px))" }}
          >
            {MOBILE_NAV_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/" ||
                    ["/services", "/rentals", "/wanted", "/vehicles", "/property", "/jobs", "/events", "/search"].some(
                      (p) => pathname.startsWith(p)
                    )
                  : pathname.startsWith(item.href);
              const showBadge = item.href === "/messages" && msgCount > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-[52px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pt-1.5 transition-colors duration-200 active:scale-[0.96] ${
                    active
                      ? "text-sky-300"
                      : "text-[var(--nav-ice-faint)] hover:text-[var(--nav-ice-muted)]"
                  }`}
                >
                  {active && (
                    <span className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-gradient-to-r from-sky-400 to-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.45)]" />
                  )}
                  <span className={`relative ${active ? "text-sky-300" : ""}`}>
                    {item.icon}
                    {showBadge && (
                      <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[9px] font-bold text-white">
                        {msgCount > 9 ? "9+" : msgCount}
                      </span>
                    )}
                  </span>
                  <span className={`text-[10px] font-semibold tracking-wide ${active ? "text-sky-200" : ""}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      {user ? (
        <style jsx global>{`
          :root {
            --mobile-nav-height: 56px;
          }
          @media (max-width: 1023px) {
            main {
              padding-bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px) + 8px);
            }
          }
          @media (min-width: 1024px) {
            :root {
              --mobile-nav-height: 0px;
            }
            main {
              padding-bottom: 0;
            }
          }
        `}</style>
      ) : (
        <style jsx global>{`
          :root {
            --mobile-nav-height: 0px;
          }
        `}</style>
      )}

    </header>
  );
}
