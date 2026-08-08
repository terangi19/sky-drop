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

const BROWSE_LINKS = [
  { href: "/", label: "All Items", desc: "Browse the full marketplace" },
  { href: "/vehicles", label: "Vehicles", desc: "Cars, utes, bikes & boats" },
  { href: "/services", label: "Services & Gigs", desc: "Freelance work, consulting, help" },
  { href: "/rentals", label: "Rentals", desc: "Tools, equipment, cameras for rent" },
  { href: "/property", label: "Property", desc: "Homes, rooms & land" },
  { href: "/wanted", label: "Wanted Ads", desc: "Items people are looking for" },
] as const;

const MOBILE_PRIMARY_LINKS = [
  {
    href: "/",
    label: "Browse",
    desc: "Marketplace listings",
    d: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  },
  {
    href: "/wanted",
    label: "Wanted",
    desc: "Buyer requests",
    d: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  },
  {
    href: "/list-list",
    label: "My Listings",
    desc: "Manage your posts",
    d: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
    auth: true,
  },
  {
    href: "/watchlist",
    label: "Watchlist",
    desc: "Saved listings",
    d: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
    auth: true,
  },
  {
    href: "/profile",
    label: "Profile",
    desc: "Your account",
    d: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
    auth: true,
  },
] as const;

function MenuIcon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/** Scroll hide/reveal — DOM attrs only, never React state per pixel. */
const SCROLL_TOP_SHOW = 24;
const SCROLL_DOWN_DELTA = 12;
const SCROLL_UP_DELTA = 6;

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { username } = useProfile();
  const { openFeedback } = useFeedback();

  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const blockedUsersRef = useRef<string[]>([]);
  blockedUsersRef.current = blockedUsers;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const toggleLockRef = useRef(false);
  const lockHideRef = useRef(false);
  const focusLockRef = useRef(false);
  const navHiddenRef = useRef(false);

  const revealNav = useCallback(() => {
    const el = headerRef.current;
    if (!el || !navHiddenRef.current) return;
    navHiddenRef.current = false;
    el.dataset.navHidden = "false";
  }, []);

  const setNavHidden = useCallback((hidden: boolean) => {
    if (navHiddenRef.current === hidden) return;
    navHiddenRef.current = hidden;
    const el = headerRef.current;
    if (el) el.dataset.navHidden = hidden ? "true" : "false";
  }, []);

  const toggleMobileMenu = useCallback(() => {
    if (toggleLockRef.current) return;
    toggleLockRef.current = true;
    setMobileMenuOpen((prev) => !prev);
    setTimeout(() => { toggleLockRef.current = false; }, 300);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const closeMobileSearch = useCallback(() => {
    setMobileSearchOpen(false);
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
      setInboxUnreadCount(countInboxUnreadMessages(allMsgs, user.email!, blockedUsersRef.current, dismissed));
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
  }, [user?.email, user?.uid]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isInsideMenu = mobileMenuRef.current?.contains(target);
      const isMenuToggle = Boolean(target.closest("[data-mobile-menu-toggle]"));
      if (!isInsideMenu && !isMenuToggle) {
        closeMobileMenu();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen, closeMobileMenu]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen && !mobileSearchOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeMobileMenu();
        closeMobileSearch();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen, mobileSearchOpen, closeMobileMenu, closeMobileSearch]);

  useEffect(() => {
    closeMobileMenu();
    closeMobileSearch();
  }, [pathname, closeMobileMenu, closeMobileSearch]);

  useEffect(() => {
    if (mobileSearchOpen) {
      mobileSearchInputRef.current?.focus();
    }
  }, [mobileSearchOpen]);

  // Lock hide when menu/search open; always reveal
  useEffect(() => {
    lockHideRef.current = mobileMenuOpen || mobileSearchOpen;
    if (lockHideRef.current) revealNav();
  }, [mobileMenuOpen, mobileSearchOpen, revealNav]);

  // Smart sticky: passive scroll + rAF, desktop unchanged, a11y / focus / keyboard safe
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const desktopMq = window.matchMedia("(min-width: 1024px)");
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastY = window.scrollY;
    let raf = 0;

    const shouldLock = () =>
      desktopMq.matches || reduceMq.matches || lockHideRef.current || focusLockRef.current;

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        if (shouldLock()) {
          setNavHidden(false);
          lastY = y;
          return;
        }
        const delta = y - lastY;
        if (y <= SCROLL_TOP_SHOW) {
          setNavHidden(false);
        } else if (delta > SCROLL_DOWN_DELTA) {
          setNavHidden(true);
        } else if (delta < -SCROLL_UP_DELTA) {
          setNavHidden(false);
        }
        lastY = y;
      });
    };

    const onFocusIn = () => {
      if (header.contains(document.activeElement)) {
        focusLockRef.current = true;
        setNavHidden(false);
      }
    };
    const onFocusOut = () => {
      queueMicrotask(() => {
        focusLockRef.current = header.contains(document.activeElement);
      });
    };

    // visualViewport: keyboard open often shrinks height — keep nav stable while focused in page inputs
    const vv = window.visualViewport;
    let lastVvHeight = vv?.height ?? window.innerHeight;
    const onVvResize = () => {
      if (!vv) return;
      const shrink = lastVvHeight - vv.height;
      lastVvHeight = vv.height;
      // Keyboard likely open — don't animate hide/show thrash
      if (shrink > 80) {
        setNavHidden(false);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    header.addEventListener("focusin", onFocusIn);
    header.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", onVvResize);

    return () => {
      window.removeEventListener("scroll", onScroll);
      header.removeEventListener("focusin", onFocusIn);
      header.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onVvResize);
      if (raf) cancelAnimationFrame(raf);
      setNavHidden(false);
    };
  }, [setNavHidden, mobileMenuOpen, mobileSearchOpen]);

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

  function submitSearch() {
    const q = searchQuery.trim();
    if (!q) {
      router.push("/search");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(q)}`);
    closeMobileSearch();
  }

  const browseActive =
    pathname === "/" ||
    ["/services", "/rentals", "/wanted", "/vehicles", "/property", "/jobs", "/events"].some(
      (p) => pathname.startsWith(p)
    );

  const navLinkBase =
    "relative px-3 py-2 rounded-lg text-[13px] font-medium tracking-tight transition-colors duration-150";
  const navLinkIdle =
    "text-[var(--nav-ice-muted)] hover:text-[var(--nav-ice)] hover:bg-white/[0.06]";
  const navLinkActive =
    "text-[var(--nav-ice)] bg-white/[0.08]";

  const sellHref = user ? "/post/ai" : "/signup?redirect=/post/ai";

  return (
    <>
      <header
        ref={headerRef}
        data-nav-hidden="false"
        className="site-navbar sticky top-0 z-[9999] border-b border-white/[0.06] backdrop-blur-xl light:border-black/[0.08]"
        style={{ backgroundColor: "var(--nav-bg)" }}
      >
        <div className="mx-auto flex h-[52px] items-center gap-2 px-3 md:h-16 md:gap-4 md:px-6 lg:max-w-7xl lg:h-16 lg:gap-4 lg:px-6">

          {/* LEFT */}
          <div className="shrink-0 min-w-0">
            <SkyDropLogo size="sm" href="/" className="lg:hidden" />
            <SkyDropLogo size="lg" href="/" className="hidden lg:flex" />
          </div>

          {/* SEARCH - Desktop (hidden on homepage to avoid duplicate with hero search) */}
          {pathname !== "/" && (
            <div className="hidden lg:block mx-2 flex-1 max-w-sm xl:max-w-md">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--nav-ice-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                  className="w-full rounded-lg bg-white/[0.05] border border-white/[0.08] pl-9 pr-3 py-2 text-sm text-[var(--nav-ice)] placeholder:text-[var(--nav-ice-faint)] outline-none focus:border-sky-500/35 focus:bg-white/[0.07] transition-colors"
                  aria-label="Search listings"
                />
              </div>
            </div>
          )}

          {/* RIGHT SIDE */}
          <div className="ml-auto flex items-center gap-0.5 md:gap-2">

            {/* Desktop NAV — unchanged */}
            <nav className="hidden lg:flex items-center gap-0.5">
              {user && (
                <Link
                  href="/post/ai"
                  className={`${navLinkBase} ${
                    isActive("/post/ai")
                      ? "bg-sky-500 text-white hover:bg-sky-500"
                      : "bg-sky-500/90 text-white hover:bg-sky-500"
                  }`}
                >
                  Sell
                </Link>
              )}
              <div className="relative group px-0.5">
                <Link href="/" className={`flex items-center gap-1 ${navLinkBase} ${browseActive ? navLinkActive : navLinkIdle}`}>
                  <span>Browse</span>
                  <svg className="h-3 w-3 opacity-70 transition-transform duration-200 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </Link>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--dropdown-bg)] p-1.5 shadow-[var(--shadow-lg)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 translate-y-1 group-hover:translate-y-0 z-50">
                  {BROWSE_LINKS.map((item) => (
                    <Link key={item.label} href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--dropdown-hover)] transition-colors duration-150">
                      <div><div className="text-sm font-medium">{item.label}</div><div className="text-[11px] text-[var(--muted)]">{item.desc}</div></div>
                    </Link>
                  ))}
                </div>
              </div>
              {user && (
                <>
                  <Link href="/list-list" className={`${navLinkBase} ${isActive("/list-list") ? navLinkActive : navLinkIdle}`}>
                    My Listings
                  </Link>
                  <Link href="/watchlist" className={`${navLinkBase} ${isActive("/watchlist") ? navLinkActive : navLinkIdle}`}>
                    Watchlist
                  </Link>
                  <Link
                    href="/messages"
                    className={`inline-flex items-center gap-1.5 ${navLinkBase} ${isActive("/messages") ? navLinkActive : navLinkIdle}`}
                    aria-label={msgCount > 0 ? `Messages, ${msgCount} unread` : "Messages"}
                  >
                    Messages
                    {msgCount > 0 && (
                      <span
                        className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sky-500/90 px-1 text-[9px] font-semibold leading-none text-always-white"
                        aria-hidden
                      >
                        {msgCount > 9 ? "9+" : msgCount}
                      </span>
                    )}
                  </Link>
                </>
              )}
            </nav>

            {/* Mobile chrome — Search | Messages | Menu */}
            <div className="flex items-center gap-0.5 lg:hidden">
              <button
                type="button"
                onClick={() => {
                  setMobileSearchOpen((v) => !v);
                  if (!mobileSearchOpen) closeMobileMenu();
                }}
                className={`flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors duration-150 active:scale-[0.97] ${
                  mobileSearchOpen || isActive("/search")
                    ? "bg-white/[0.08] text-[var(--nav-ice)]"
                    : "text-[var(--nav-ice-muted)] hover:bg-white/[0.06] hover:text-[var(--nav-ice)]"
                }`}
                aria-label={mobileSearchOpen ? "Close search" : "Search"}
                aria-expanded={mobileSearchOpen}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </button>

              {!authLoading && user ? (
                <Link
                  href="/messages"
                  aria-label={msgCount > 0 ? `Messages, ${msgCount} unread` : "Messages"}
                  className={`relative flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors duration-150 ${
                    isActive("/messages")
                      ? "bg-white/[0.08] text-[var(--nav-ice)]"
                      : "text-[var(--nav-ice-muted)] hover:bg-white/[0.06] hover:text-[var(--nav-ice)]"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.75 15.75v-.75a5.25 5.25 0 0110.5 0v.75c0 .728-.195 1.413-.536 2.005A8.966 8.966 0 0121 12z" />
                  </svg>
                  {msgCount > 0 && (
                    <span
                      className="absolute right-1.5 top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-sky-500/90 px-0.5 text-[8px] font-bold leading-none text-white"
                      aria-hidden
                    >
                      {msgCount > 9 ? "9+" : msgCount}
                    </span>
                  )}
                </Link>
              ) : !authLoading ? (
                <Link
                  href="/login?redirect=/messages"
                  aria-label="Messages"
                  className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--nav-ice-muted)] hover:bg-white/[0.06] hover:text-[var(--nav-ice)] transition-colors duration-150"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.75 15.75v-.75a5.25 5.25 0 0110.5 0v.75c0 .728-.195 1.413-.536 2.005A8.966 8.966 0 0121 12z" />
                  </svg>
                </Link>
              ) : null}

              <button
                type="button"
                data-mobile-menu-toggle
                onClick={() => {
                  toggleMobileMenu();
                  closeMobileSearch();
                }}
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav-menu"
                className={`flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors duration-150 active:scale-[0.97] ${
                  mobileMenuOpen
                    ? "bg-white/[0.08] text-[var(--nav-ice)]"
                    : "text-[var(--nav-ice-muted)] hover:bg-white/[0.06] hover:text-[var(--nav-ice)]"
                }`}
              >
                {mobileMenuOpen ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                )}
              </button>
            </div>

            {/* Desktop RIGHT ICONS — theme + notifications */}
            <div className="hidden lg:flex items-center gap-0.5">
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

            {/* PROFILE — desktop */}
            <div className="hidden lg:flex items-center gap-2">
              {authLoading ? (
                <div className="h-9 w-28 animate-pulse rounded-xl bg-white/[0.06]" />
              ) : user ? (
                <div className="relative group">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-150 active:scale-[0.98] ${isActive("/profile") || isActive("/dashboard") ? "text-[var(--nav-ice)] bg-white/[0.1]" : "text-[var(--nav-ice-muted)] hover:bg-white/[0.06] hover:text-[var(--nav-ice)]"}`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-bold text-[var(--nav-ice)]">
                      {(username || "P").charAt(0).toUpperCase()}
                    </span>
                    <span className="max-w-[7rem] truncate">{username || "Profile"}</span>
                    <svg className="h-3 w-3 opacity-60 transition-transform duration-200 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
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
                    className="inline-flex items-center rounded-lg border border-white/[0.14] px-3.5 py-2 text-[13px] font-semibold text-[var(--nav-ice-muted)] transition-colors hover:border-white/[0.22] hover:text-[var(--nav-ice)] hover:bg-white/[0.06]"
                  >
                    Sign up
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center rounded-lg bg-sky-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-sky-400 active:scale-[0.98]"
                  >
                    Login
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile search sheet */}
        {mobileSearchOpen && (
          <div className="border-t border-white/[0.06] px-3 py-2 lg:hidden light:border-black/[0.08]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch();
              }}
              className="relative"
            >
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nav-ice-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={mobileSearchInputRef}
                type="search"
                enterKeyHint="search"
                placeholder="Search listings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] py-2.5 pl-10 pr-3 text-[15px] text-[var(--nav-ice)] placeholder:text-[var(--nav-ice-faint)] outline-none focus:border-sky-500/35 focus:bg-white/[0.07]"
                aria-label="Search listings"
              />
            </form>
          </div>
        )}
      </header>

      {/* Mobile menu sheet — outside blurred header so fixed positions to viewport */}
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-[2px] lg:hidden"
          onClick={closeMobileMenu}
        />
      )}
      <div
        id="mobile-nav-menu"
        ref={mobileMenuRef}
        className={`fixed inset-x-0 z-[10001] max-h-[min(85vh,calc(100dvh-var(--site-header-offset,3.5rem)))] overflow-y-auto overscroll-contain border-b border-white/[0.08] bg-[var(--nav-bg)] backdrop-blur-2xl shadow-2xl shadow-black/50 lg:hidden light:border-black/[0.1] light:bg-white/98 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
          mobileMenuOpen
            ? "opacity-100 translate-y-0 visible pointer-events-auto"
            : "opacity-0 -translate-y-2 invisible pointer-events-none"
        }`}
        style={{
          backgroundColor: "var(--nav-bg)",
          top: "var(--site-header-offset, 3.5rem)",
        }}
      >
        <div className="flex flex-col gap-0.5 p-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {/* Primary Sell */}
          <Link
            href={sellHref}
            onClick={closeMobileMenu}
            className="mb-2 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-sky-400 active:scale-[0.99]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Sell
          </Link>

          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 light:text-gray-500">
            Navigate
          </div>
          {MOBILE_PRIMARY_LINKS.filter((item) => !("auth" in item && item.auth) || user).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const href =
              "auth" in item && item.auth && !user
                ? `/login?redirect=${encodeURIComponent(item.href)}`
                : item.href;
            return (
              <Link
                key={item.href}
                href={href}
                onClick={closeMobileMenu}
                className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  active
                    ? "bg-sky-500/15 text-sky-200 border border-sky-500/25"
                    : "text-gray-200 hover:bg-white/[0.06] light:text-gray-800 light:hover:bg-black/[0.04]"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-sky-400 light:bg-black/[0.04]">
                  <MenuIcon d={item.d} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="block text-[11px] text-gray-500">{item.desc}</span>
                </span>
              </Link>
            );
          })}

          {/* Guests still see My Listings / Watchlist / Profile as login redirects */}
          {!user &&
            MOBILE_PRIMARY_LINKS.filter((item) => "auth" in item && item.auth).map((item) => (
              <Link
                key={item.href}
                href={`/login?redirect=${encodeURIComponent(item.href)}`}
                onClick={closeMobileMenu}
                className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 text-gray-200 hover:bg-white/[0.06] light:text-gray-800 light:hover:bg-black/[0.04]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-sky-400 light:bg-black/[0.04]">
                  <MenuIcon d={item.d} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="block text-[11px] text-gray-500">{item.desc}</span>
                </span>
              </Link>
            ))}

          <div className="my-2 mx-3 border-t border-white/[0.06] light:border-black/[0.08]" />
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 light:text-gray-500">
            Account & settings
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-gray-200 hover:bg-white/[0.06] light:text-gray-800 light:hover:bg-black/[0.04]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-sky-400 light:bg-black/[0.04]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </span>
            Toggle theme
          </button>

          {!authLoading && user && (
            <Link
              href="/notifications"
              onClick={closeMobileMenu}
              className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                isActive("/notifications")
                  ? "bg-sky-500/15 text-sky-200 border border-sky-500/25"
                  : "text-gray-200 hover:bg-white/[0.06] light:text-gray-800 light:hover:bg-black/[0.04]"
              }`}
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-sky-400 light:bg-black/[0.04]">
                <NotificationBell count={activityCount} className="h-full w-full bg-transparent hover:bg-transparent" />
              </span>
              Notifications
            </Link>
          )}

          {authLoading ? (
            <div className="px-3 py-3">
              <div className="h-10 animate-pulse rounded-xl bg-white/[0.06]" />
            </div>
          ) : user ? (
            <>
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
              <Link
                href="/faqs"
                onClick={closeMobileMenu}
                className="flex min-h-[48px] items-center rounded-xl px-3 py-2.5 text-sm font-bold text-gray-200 hover:bg-white/[0.06] light:text-gray-800 light:hover:bg-black/[0.04]"
              >
                Help
              </Link>
              <button
                type="button"
                onClick={() => {
                  openFeedback();
                  closeMobileMenu();
                }}
                className="flex min-h-[48px] w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-bold text-gray-200 hover:bg-white/[0.06] light:text-gray-800 light:hover:bg-black/[0.04]"
              >
                Feedback
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                onClick={closeMobileMenu}
                className="flex min-h-[48px] items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-3 text-sm font-bold text-white light:text-gray-900"
              >
                Login
              </Link>
              <Link
                href="/signup"
                onClick={closeMobileMenu}
                className="flex min-h-[48px] items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-3 text-sm font-bold text-white"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
