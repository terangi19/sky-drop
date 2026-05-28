"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import Navbar from "./components/Navbar";
import Background from "./components/Background";
import { showToast } from "./components/Toast";
import { cancelPendingXPByListing, trackListingDeleted } from "./lib/xpValidation";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import ThemeToggle from "./components/ThemeToggle";
import PromoteModal from "./components/PromoteModal";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "./lib/firebase";

interface Listing {
  id: string;
  title: string;
  price: string;
  description?: string;
  category?: string;
  image?: string;
  imageUrl?: string;
  createdAt?: { seconds: number };
  userId?: string;
  sellerEmail?: string;
  sellerUsername?: string;
  condition?: string;
  location?: string;
  acceptOffers?: boolean;
  expiresAt?: Timestamp;
  saleType?: string;
  currentBid?: number;
  startingBid?: number;
  [key: string]: unknown;
}

const categories = [
  "All",
  "Cars",
  "Tech",
  "Gaming",
  "Fashion",
  "Home",
  "Sports",
  "Other",
];

const conditions = [
  "All",
  "New",
  "Used - Like New",
  "Used - Good",
  "Used - Fair",
];

const regions = [
  "All",
  "Northland",
  "Auckland",
  "Waikato",
  "Bay of Plenty",
  "Gisborne",
  "Hawke's Bay",
  "Taranaki",
  "Manawatu",
  "Wellington",
  "Nelson",
  "Marlborough",
  "West Coast",
  "Canterbury",
  "Otago",
  "Southland",
];

const trendingCategories = [
  { emoji: "🏎️", name: "Cars" },
  { emoji: "🖥️", name: "Tech" },
  { emoji: "🎮", name: "Gaming" },
  { emoji: "👟", name: "Fashion" },
  { emoji: "🏡", name: "Home" },
  { emoji: "🏋️", name: "Sports" },
];

function timeAgo(seconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - seconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

function getRecentlyViewed(): any[] {
  try {
    return JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
  } catch { return []; }
}

function saveRecentlyViewed(item: any) {
  const recent = getRecentlyViewed().filter(r => r.id !== item.id);
  recent.unshift({ id: item.id, title: item.title, price: item.price, images: item.images, imageUrl: item.imageUrl });
  localStorage.setItem("recentlyViewed", JSON.stringify(recent.slice(0, 8)));
}

export default function Home() {
  const router = useRouter();

  const [listings, setListings] =
    useState<Listing[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [visibleCount, setVisibleCount] = useState(20);

  const [selectedCategory, setSelectedCategory] =
    useState("All");

  const [selectedCondition, setSelectedCondition] =
    useState("All");

  const [selectedRegion, setSelectedRegion] =
    useState("All");

  const [sortBy, setSortBy] =
    useState("newest");

  const [user, setUser] =
    useState<User | null>(null);

  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerListing, setOfferListing] = useState<Listing | null>(null);
  const [offerAmount, setOfferAmount] = useState("");

  const lastOfferTime = useRef(0);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [sellerReviewStats, setSellerReviewStats] = useState<Record<string, { avg: number; count: number }>>({});
  const [sellerBadges, setSellerBadges] = useState<Record<string, string>>({});
  const [savedSearches, setSavedSearches] = useState<Array<{query: string; category: string; label: string}>>([]);
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Listing | null>(null);
  const [promoteItem, setPromoteItem] = useState<any>(null);

  const activeCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    const top3 = new Set(["Cars", "Tech", "Gaming"]);
    for (const l of listings) {
      const cat = l.category;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    return trendingCategories.filter((c) => top3.has(c.name) || (counts[c.name] || 0) > 0);
  }, [listings]);
  const [animatedCount, setAnimatedCount] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    setRecentlyViewed(getRecentlyViewed());
    try {
      const saved = JSON.parse(localStorage.getItem("savedSearches") || "[]");
      setSavedSearches(saved.slice(0, 6));
    } catch {}
    try {
    } catch {}
  }, []);

  // Recently viewed cleanup — remove deleted/expired items
  useEffect(() => {
    if (listings.length === 0) return;
    const validIds = new Set(listings.map((l) => l.id));
    setRecentlyViewed((prev) => {
      const cleaned = prev.filter((r) => validIds.has(r.id));
      if (cleaned.length !== prev.length) {
        localStorage.setItem("recentlyViewed", JSON.stringify(cleaned));
      }
      return cleaned;
    });
  }, [listings]);

  useEffect(() => {
    let mounted = true;
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!mounted) return;
      if (!currentUser) {
        try { localStorage.removeItem("recentlyViewed"); } catch {}
      }
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let mounted = true;

    const allItems: any[] = [];
    let done1 = false, done2 = false;

    function merge() {
      if (!done1 || !done2 || !mounted) return;
      const physical = allItems.filter((i: any) => i.type !== "digital" && i.type !== "service" && i.type !== "event" && i.type !== "vehicle" && i.type !== "job" && i.type !== "property" && i.type !== "rental");
      physical.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setListings(physical.slice(0, 50));
      setLoading(false);
    }

    const unsub1 = onSnapshot(
      query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(50)),
      (snap) => {
        if (!mounted) return;
        allItems.length = 0;
        for (const d of snap.docs) allItems.push({ id: d.id, ...d.data() });
        done1 = true;
        merge();
      },
      () => { done1 = true; merge(); }
    );

    const unsub2 = onSnapshot(
      query(collection(db, "tradePosts"), orderBy("createdAt", "desc"), limit(50)),
      (snap) => {
        if (!mounted) return;
        for (const d of snap.docs) allItems.push({ id: d.id, ...d.data() });
        done2 = true;
        merge();
      },
      () => { done2 = true; merge(); }
    );

    return () => { mounted = false; unsub1(); unsub2(); };
  }, [user, authReady]);

  // Scroll-to-top visibility
  useEffect(() => {
    const onScroll = () => setShowScrollBtn(window.scrollY > 600 || visibleCount > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visibleCount]);

  // Review stats + live toast feed
  useEffect(() => {
    // Fetch seller review stats for visible listings
    const fetchReviewStats = async () => {
      const uniqueEmails = [...new Set(listings.map((l: any) => l.sellerEmail).filter(Boolean))] as string[];
      if (uniqueEmails.length === 0) return;
      const chunkSize = 10;
      const stats: Record<string, { avg: number; count: number }> = {};
      for (let i = 0; i < uniqueEmails.length; i += chunkSize) {
        const chunk = uniqueEmails.slice(i, i + chunkSize);
        try {
          const snap = await getDocs(query(collection(db, "reviews"), where("sellerEmail", "in", chunk)));
          const grouped: Record<string, number[]> = {};
          snap.docs.forEach((d) => {
            const data = d.data();
            const email = data.sellerEmail as string;
            if (!grouped[email]) grouped[email] = [];
            grouped[email].push(data.rating || 0);
          });
          for (const email of chunk) {
            const ratings = grouped[email] || [];
            if (ratings.length > 0) {
              stats[email] = {
                avg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
                count: ratings.length,
              };
            }
          }
        } catch (e) { console.error(e); }
      }
      setSellerReviewStats(stats);
    };
    if (listings.length > 0) fetchReviewStats();
  }, []);

  // Fetch seller profile badges (legendary/epic)
  useEffect(() => {
    if (listings.length === 0) return;
    const fetchBadges = async () => {
      const uniqueEmails = [...new Set(listings.map((l: any) => l.sellerEmail).filter(Boolean))] as string[];
      if (uniqueEmails.length === 0) return;
      const badges: Record<string, string> = {};
      for (let i = 0; i < uniqueEmails.length; i += 10) {
        const chunk = uniqueEmails.slice(i, i + 10);
        try {
          const snap = await getDocs(query(collection(db, "profiles"), where("email", "in", chunk)));
          snap.docs.forEach((d) => {
            const data = d.data();
            const email = data.email as string;
            if (data.profileBadge) badges[email] = data.profileBadge as string;
          });
        } catch (e) { console.error("Badge fetch error:", e); }
      }
      setSellerBadges(badges);
    };
    fetchBadges();
  }, [listings.length]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount(prev => prev + 20);
    }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  async function deleteListing(id: string) {



    // Verify ownership
    const listing = listings.find(l => l.id === id);
    if (!listing || listing.sellerEmail !== user?.email) {
      alert("You can only delete your own listings");
      return;
    }

    try {

      await deleteDoc(
        doc(
          db,
          "listings",
          id
        )
      );

      cancelPendingXPByListing(user!.uid, id);
      trackListingDeleted(user!.uid, listing.title || "");

      alert(
        "Listing deleted."
      );

     } catch (error) {
       console.error(
         error
       );
       alert(
         "Failed to delete listing."
       );
     }
   }

    function handleBuyNow(item: Listing) {
        if (item.status === "sold") return;
        router.push(`/post/listing/${item.id}?buy=1`);
      }

    async function saveToWatchlist(
     item: any
   ) {
     // Check Firestore for duplicate (in case user is on a different device)
     if (user?.uid) {
       try {
         const snap = await getDoc(doc(db, "users", user.uid, "watchlist", item.id));
         if (snap.exists()) {
           showToast("Already in watchlist", "info");
           return;
         }
        } catch (e) { console.error(e); }
      }

      const existingWatchlist =
       JSON.parse(
         localStorage.getItem(
           "watchlist"
         ) || "[]"
       );

     const alreadySaved =
       existingWatchlist.find(
         (fav: any) =>
           fav.id === item.id
       );

     if (alreadySaved) {
       showToast("Already in watchlist", "info");
       return;
     }

     const updatedWatchlist =
       [
         ...existingWatchlist,
         item,
       ];

     localStorage.setItem(
       "watchlist",
       JSON.stringify(
         updatedWatchlist
       )
     );

     if (user?.uid) {
       setDoc(doc(db, "users", user.uid, "watchlist", item.id), {
         id: item.id, title: item.title, price: item.price, imageUrl: item.imageUrl || item.image || "",
         savedAt: new Date().toISOString(),
       });
     }

     showToast("Added to watchlist!");

   }

  async function toggleWatchlist(item: any) {
    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "watchlist", item.id));
        if (snap.exists()) {
          const { deleteDoc } = await import("firebase/firestore");
          await deleteDoc(doc(db, "users", user.uid, "watchlist", item.id));
        }
        } catch (e) { console.error(e); }
    }

    const existing = JSON.parse(localStorage.getItem("watchlist") || "[]");
    const index = existing.findIndex((fav: any) => fav.id === item.id);

    if (index >= 0) {
      existing.splice(index, 1);
      localStorage.setItem("watchlist", JSON.stringify(existing));
      showToast("Removed from watchlist", "info");
    } else {
      existing.unshift(item);
      localStorage.setItem("watchlist", JSON.stringify(existing));
      if (user?.uid) {
        setDoc(doc(db, "users", user.uid, "watchlist", item.id), {
          id: item.id, title: item.title, price: item.price, imageUrl: item.imageUrl || item.image || "",
          savedAt: new Date().toISOString(),
        });

      }
      showToast("Added to watchlist!");
    }
  }

  const filteredListings =
    useMemo(() => {

      let filtered =
        listings.filter(
          (item) => {

            const matchesSearch =
              item.title
                ?.toLowerCase()
                .includes(
                  search.toLowerCase()
                ) ||
              item.description
                ?.toLowerCase()
                .includes(
                  search.toLowerCase()
                ) ||
              item.category
                ?.toLowerCase()
                .includes(
                  search.toLowerCase()
                );

            const matchesCategory =
              selectedCategory ===
                "All" ||
              item.category ===
                selectedCategory;

            const matchesCondition =
              selectedCondition ===
                "All" ||
              item.condition ===
                selectedCondition;

            const matchesRegion =
              selectedRegion ===
                "All" ||
              item.location ===
                selectedRegion;

            const isSold = item.status === "sold";

            const isVisible = (search === "" || matchesSearch) && (selectedCategory === "All" || matchesCategory) && (selectedCondition === "All" || matchesCondition) && (selectedRegion === "All" || matchesRegion);

            return isVisible && !isSold;

          }
        );

      // Promoted first
      const now = Date.now();
      filtered.sort((a: any, b: any) => {
        const aProm = a.promotedUntil?.toMillis?.() > now ? 1 : 0;
        const bProm = b.promotedUntil?.toMillis?.() > now ? 1 : 0;
        return bProm - aProm;
      });

      if (
        sortBy ===
        "low-high"
      ) {

        filtered.sort(
          (a, b) =>
            Number(
              a.price
            ) -
            Number(
              b.price
            )
        );

      }

      if (
        sortBy ===
        "high-low"
      ) {

        filtered.sort(
          (a, b) =>
            Number(
              b.price
            ) -
            Number(
              a.price
            )
        );

      }

      if (
        sortBy ===
        "oldest"
      ) {

        filtered.reverse();

      }

      if (sortBy === "trending") {
        filtered.sort((a: any, b: any) => (Number(b.views) || 0) - (Number(a.views) || 0));
      }

      return filtered;

    }, [
      listings,
      search,
      selectedCategory,
      selectedCondition,
      selectedRegion,
      sortBy,
    ]);

  // Animate listing count
  useEffect(() => {
    const target = filteredListings.length;
    const start = animatedCount;
    const diff = target - start;
    if (diff === 0) return;
    const duration = 300;
    const startTime = performance.now();
    const tick = () => {
      const pct = Math.min((performance.now() - startTime) / duration, 1);
      setAnimatedCount(Math.round(start + diff * pct));
      if (pct < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [filteredListings.length]);

  const submitOffer = async () => {
    if (!offerAmount || !offerListing || !user?.email) return;
    if (Date.now() - lastOfferTime.current < 5000) {
      showToast("Please wait before sending another offer", "info");
      return;
    }
    lastOfferTime.current = Date.now();
    try {
      await addDoc(collection(db, "messages"), {
        sender: user.email,
        receiver: offerListing.sellerEmail,
        participants: [user.email, offerListing.sellerEmail],
        type: "offer",
        text: `Offer: $${offerAmount}`,
        offer: { amount: Number(offerAmount), status: "pending" },
        listingId: offerListing.id,
        listingTitle: offerListing.title,
        listingImage: offerListing.images?.[0] || offerListing.imageUrl || "",
        listingPrice: offerListing.price,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to send offer:", e);
      alert("Failed to send offer.");
    }
    setShowOfferModal(false);
    setOfferListing(null);
    setOfferAmount("");
  };

  const hotItems = useMemo(() => [...listings].filter(l => l.status !== "sold").slice(0, 6) as any[], [listings]);
  const hotMaxViews = useMemo(() => Math.max(...hotItems.map((i: any) => i.views || 0), 1), [hotItems]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">

      <Background />

      <Navbar />

      <ThemeToggle />

      {/* OFFER MODAL */}
      {showOfferModal && offerListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-xl font-black text-[var(--foreground)]">Make an Offer</h3>
            <p className="mt-2 text-[var(--muted)]">Make an offer for "{offerListing.title}"</p>
            <div className="mt-6">
              <label className="block text-sm font-bold text-[var(--muted)]">Your Offer ($)</label>
              <input
                type="number"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder={`e.g. ${Math.floor(Number(offerListing.price) * 0.8)}`}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-[var(--foreground)] outline-none focus:border-sky-500"
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setShowOfferModal(false); setOfferListing(null); setOfferAmount(""); }}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 font-bold text-[var(--foreground)] hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={submitOffer}
                className="flex-1 rounded-xl bg-sky-500 py-3 font-bold text-[var(--foreground)] hover:bg-sky-400"
              >
                Send Offer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HERO / SEARCH SECTION */}
      <section className="relative z-10 mx-auto max-w-[1920px] px-4 pt-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent shadow-[0_0_150px_-20px_rgba(14,165,233,0.12)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(14,165,233,0.12),transparent)] pointer-events-none" />

          {/* LIVE BAR */}
          <div className="relative flex items-center justify-center px-6 py-2.5 text-[12px] text-[var(--muted)] border-b border-white/[0.04]">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-medium text-emerald-400/60 uppercase tracking-widest">Live</span>
            </span>
            {(() => {
              const top = [...listings].filter((l: any) => (l.views || 0) > 0 || (l.bidCount || 0) > 0).sort((a: any, b: any) => (b.views || 0) + (b.bidCount || 0) - (a.views || 0) - (a.bidCount || 0)).slice(0, 3);
              if (top.length > 0) {
                return <span className="truncate text-[11px] font-medium text-zinc-400">🔥 {top.map((l: any) => l.title).join(" · ")}</span>;
              }
              return <span className="text-[11px] text-zinc-500 font-medium">🔥 Trending listings across New Zealand</span>;
            })()}
          </div>

          <div className="relative px-6 py-10 sm:px-10 sm:py-12">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/15 bg-sky-500/5 px-3.5 py-1 text-[10px] font-semibold text-sky-400 mb-5 tracking-wider uppercase">
                {filteredListings.length} listings available
              </div>

              <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl leading-none">
                <span className="bg-gradient-to-r from-white via-sky-200 to-white bg-clip-text text-transparent">
                  {user ? "Discover what you need" : "Welcome to Sky Drop"}
                </span>
              </h1>
              <p className="mt-4 max-w-xl mx-auto text-sm leading-relaxed text-zinc-400">
                {user
                  ? `${filteredListings.length} listings from trusted sellers across New Zealand`
                  : "Browse listings, message sellers, and buy with confidence. All payments are protected."}
              </p>
            </div>

            {/* SEARCH */}
            <div className="mx-auto mt-8 max-w-xl">
              <div className="group relative">
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-sky-500/40 via-violet-500/40 to-sky-500/40 opacity-0 blur-lg transition duration-500 group-focus-within:opacity-100" />
                <div className="relative flex items-center rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm ring-0 transition-all duration-300 focus-within:ring-2 focus-within:ring-sky-500/30 focus-within:border-sky-500/40">
                  <div className="ml-4 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                    <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search listings..."
                    value={search}
                    ref={searchRef}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 bg-transparent px-3 py-3.5 text-[15px] text-white outline-none placeholder:text-zinc-500"
                  />
                  <div className="mr-1.5 flex gap-1.5">
                    {search && (
                      <button onClick={() => setSearch("")} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    <button onClick={() => searchRef.current?.focus()}
                      className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-2 text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.97]">
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      <span className="hidden sm:inline">Search</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* BROWSE CATEGORIES */}
            <div className="mt-6">
              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-3">Browse Categories</p>
              <div className="flex flex-wrap justify-center gap-2.5">
                <button
                  onClick={() => setSelectedCategory("All")}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3.5 transition-all duration-200 ${
                    selectedCategory === "All"
                      ? "border-sky-500/40 bg-sky-500/10 shadow-[0_0_25px_rgba(14,165,233,0.15)]"
                      : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] hover:-translate-y-0.5"
                  }`}
                >
                  <span className={`text-lg ${selectedCategory === "All" ? "" : "opacity-50"}`}>✨</span>
                  <span className={`text-[10px] font-bold ${selectedCategory === "All" ? "text-sky-400" : "text-zinc-400"}`}>All</span>
                </button>
                {activeCategories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3.5 transition-all duration-200 ${
                      selectedCategory === cat.name
                        ? "border-sky-500/40 bg-sky-500/10 shadow-[0_0_25px_rgba(14,165,233,0.15)]"
                        : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] hover:-translate-y-0.5"
                    }`}
                  >
                    <span className={`text-2xl ${selectedCategory === cat.name ? "" : "opacity-50"}`}>{cat.emoji}</span>
                    <span className={`text-[11px] font-bold ${selectedCategory === cat.name ? "text-sky-400" : "text-zinc-400"}`}>{cat.name}</span>
                  </button>
                ))}
                <Link href="/digital"
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-sky-500/10 bg-sky-500/[0.03] px-4 py-3.5 transition-all duration-200 hover:border-sky-500/30 hover:bg-sky-500/[0.06] hover:-translate-y-0.5">
                  <span className="text-2xl opacity-70">📥</span>
                  <span className="text-[11px] font-bold text-sky-400">Digital</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOT THIS WEEK */}
      {listings.filter(l => l.status !== "sold").length > 0 && (
        <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-1.5">
          <div className="relative mb-4 pt-2">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <div className="flex items-center gap-2 pt-3">
              <div className="h-5 w-1 rounded-full bg-gradient-to-b from-orange-500 to-amber-500" />
              <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-white">🔥 Hot This Week</p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {hotItems.map((item: any) => (
            <div key={item.id} onClick={() => { saveRecentlyViewed(item); router.push(`/post/listing/${item.id}`); }}
              className="group shrink-0 w-56 cursor-pointer rounded-2xl border border-white/[0.04] bg-white/[0.02] p-3 transition-all duration-300 hover:bg-white/[0.04] hover:border-orange-500/30 hover:-translate-y-1 hover:shadow-[0_10px_30px_-10px_rgba(251,146,60,0.2)]">
              <div className="relative overflow-hidden rounded-xl">
                {item.images?.[0] || item.imageUrl || item.image ? (
                  <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" loading="lazy" className="h-20 w-full rounded-xl object-cover transition-all duration-500 group-hover:scale-110" />
                ) : (
                  <div className="h-20 rounded-xl bg-gradient-to-br from-orange-500/10 via-red-500/10 to-amber-500/10 flex items-center justify-center text-xs text-zinc-500">SD</div>
                )}
                <div className="absolute top-2 left-2">
                  <span className="rounded-full bg-orange-500/90 px-2 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm">🔥 Trending</span>
                </div>
              </div>
              <div className="mt-2.5 flex items-start justify-between gap-2">
                <p className="truncate text-sm font-bold text-white flex-1">{item.title}</p>
                <p className="shrink-0 text-sm font-black text-orange-400">${item.price}</p>
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">👁 {(item as any).views || 0} views</p>
            </div>
          ))}
          </div>
        </section>
      )}

      {/* LISTINGS */}
      <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-10">

        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-1 rounded-full bg-gradient-to-b from-sky-500 to-violet-500" />
            <div>
              <h2 className="text-lg font-black tracking-tight text-white">
                {selectedCategory !== "All" ? selectedCategory : "Latest Listings"}
              </h2>
              <p className="text-[11px] text-zinc-500">
                {animatedCount} listing{animatedCount !== 1 ? "s" : ""} found
                {selectedCategory !== "All" && ` in ${selectedCategory}`}
                {selectedRegion !== "All" && ` · ${selectedRegion}`}
              </p>
            </div>
          </div>
        </div>

          {/* FILTERS ROW */}
          <div className="mt-4 flex flex-wrap items-center gap-2 pb-1">
            <div className="relative">
              <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)}
                className="appearance-none rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 pr-7 text-[11px] text-white outline-none transition focus:border-sky-500/40 cursor-pointer">
                <option value="All" className="bg-zinc-900">Condition</option>
                {["New", "Used - Like New", "Used - Good", "Used - Fair"].map((c) => (
                  <option key={c} value={c} className="bg-zinc-900">{c}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </div>
            <div className="relative">
              <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}
                className="appearance-none rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 pr-7 text-[11px] text-white outline-none transition focus:border-sky-500/40 cursor-pointer">
                <option value="All" className="bg-zinc-900">Region</option>
                {["Northland","Auckland","Waikato","Bay of Plenty","Gisborne","Hawke's Bay","Taranaki","Manawatu","Wellington","Nelson","Marlborough","West Coast","Canterbury","Otago","Southland"].map((r) => (
                  <option key={r} value={r} className="bg-zinc-900">{r}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </div>
            <div className="relative">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 pr-7 text-[11px] text-white outline-none transition focus:border-sky-500/40 cursor-pointer">
                <option value="newest" className="bg-zinc-900">Newest</option>
                <option value="oldest" className="bg-zinc-900">Oldest</option>
                <option value="low-high" className="bg-zinc-900">Price Low → High</option>
                <option value="high-low" className="bg-zinc-900">Price High → Low</option>
                <option value="trending" className="bg-zinc-900">🔥 Trending</option>
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </div>
            {(selectedCategory !== "All" || selectedCondition !== "All" || selectedRegion !== "All" || search) && (
              <button onClick={() => { setSelectedCategory("All"); setSelectedCondition("All"); setSelectedRegion("All"); setSearch(""); setSortBy("newest"); }}
                className="rounded-lg border border-white/[0.06] px-3 py-2 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-white">
                ✕ Clear
              </button>
            )}
          </div>

          {loading && (
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1,2,3,4,5,6,7,8].map((_, i) => (
                <div key={i} className="relative overflow-hidden rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="aspect-[4/3] w-full bg-gradient-to-r from-white/[0.02] via-white/[0.04] to-white/[0.02] bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite]" />
                  <div className="p-4 space-y-3">
                    <div className="flex gap-2">
                      <div className="h-4 w-14 rounded-md bg-white/[0.04]" />
                      <div className="h-4 w-10 rounded-md bg-white/[0.04]" />
                    </div>
                    <div className="h-5 w-3/4 rounded bg-white/[0.04]" />
                    <div className="h-4 w-1/2 rounded bg-white/[0.02]" />
                    <div className="flex gap-2">
                      <div className="h-9 flex-1 rounded-lg bg-white/[0.04]" />
                      <div className="h-9 w-20 rounded-lg bg-white/[0.04]" />
                    </div>
                  </div>
               </div>
            ))}
          </div>
          )}

        {!loading && filteredListings.length === 0 && (
          <div className="relative mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <svg className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No listings found</h2>
            <p className="mt-2 text-sm text-zinc-500">Try adjusting your filters or search.</p>
            <button onClick={() => { setSelectedCategory("All"); setSelectedCondition("All"); setSelectedRegion("All"); setSearch(""); }}
              className="mt-5 rounded-lg border border-sky-500/20 bg-sky-500/5 px-5 py-2.5 text-sm font-bold text-sky-400 transition hover:bg-sky-500/10 hover:border-sky-500/30">
              Clear all filters
            </button>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

          {(() => {
            const visible = filteredListings.slice(0, visibleCount);
            const maxViews = Math.max(...visible.map((i: any) => i.views || 0), 1);
            return visible.map((item: any) => {

              const isPopular = item.status !== "sold";

              return (
              <div
                key={item.id}
                className={`group relative overflow-hidden rounded-2xl transition-all duration-300 cursor-pointer ${
                  isPopular
                    ? "bg-gradient-to-b from-orange-500/[0.04] to-transparent border border-orange-500/20 shadow-[0_0_30px_rgba(251,146,60,0.12)] hover:border-orange-500/40 hover:shadow-[0_0_40px_rgba(251,146,60,0.25)] hover:-translate-y-1"
                    : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-sky-500/30 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(14,165,233,0.15)]"
                }`}
                onClick={() => { saveRecentlyViewed(item); router.push(`/post/listing/${item.id}`); }}
              >
                {!isPopular && <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/[0.01] pointer-events-none" />}

                {item.images?.[0] || item.imageUrl || item.image ? (
                  <>
                  <div className="relative overflow-hidden">
                      <img
                        src={item.images?.[0] || item.imageUrl || item.image || ""}
                        alt={item.title}
                        loading="lazy"
                        onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = "1"; }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        className="aspect-[4/3] w-full object-cover transition-all duration-500 group-hover:scale-105 opacity-0"
                      />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                     {item.status === "sold" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                          <span className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-lg">Sold · ${item.price}</span>
                        </div>
                      )}
                      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                        {item.status !== "sold" && (item.views || 0) > 3 && (
                          <span className="rounded-full bg-orange-500/90 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm shadow-lg">🔥 Hot</span>
                        )}
                        {(item as any).promotedUntil?.toMillis?.() > Date.now() && (
                          <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm shadow-lg">📈 Promoted</span>
                        )}
                        {item.status !== "sold" && item.createdAt?.seconds && (Date.now() / 1000 - item.createdAt.seconds) < 86400 && (
                          <span className="rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm shadow-lg">New</span>
                        )}
                        {item.status !== "sold" && item.saleType && String(item.saleType).includes("auction") && (
                          <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm shadow-lg">⏰ Auction</span>
                        )}
                        {(item as any).type === "digital" && item.status !== "sold" && (
                          <span className="rounded-full bg-sky-500/90 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm shadow-lg">📥 Digital</span>
                        )}
                      </div>
                      {item.status !== "sold" && item.expiresAt?.toMillis?.() < Date.now() && (
                        <div className="absolute top-3 right-3">
                          <span className="rounded-full bg-zinc-800/90 px-2.5 py-0.5 text-[9px] font-bold text-zinc-400 backdrop-blur-sm">Expired</span>
                        </div>
                      )}
                  </div>

                  {(item as any).images?.length > 1 && (
                    <div className="flex justify-center gap-1.5 py-2">
                      {(item as any).images.slice(0, 5).map((_: string, i: number) => (
                        <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === 0 ? "w-4 bg-sky-400" : "w-1 bg-zinc-700"}`} />
                      ))}
                    </div>
                  )}
                  </>

                ) : (

                   <div className="relative aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-zinc-800/50 via-zinc-800/30 to-zinc-800/50">
                     <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                       <div className="text-center">
                         <div className="text-3xl font-black tracking-tighter mb-1">SD</div>
                         <div className="text-[10px] uppercase tracking-widest opacity-50">Sky Drop</div>
                       </div>
                     </div>
                     {item.status === "sold" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                          <span className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-lg">
                            Sold · ${item.price}
                          </span>
                        </div>
                      )}
                     <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                       {item.status !== "sold" && item.createdAt?.seconds && (Date.now() / 1000 - item.createdAt.seconds) < 86400 && (
                         <span className="rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm shadow-lg">New</span>
                       )}
                       {item.status !== "sold" && item.saleType && String(item.saleType).includes("auction") && (
                         <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm shadow-lg">⏰ Auction</span>
                       )}
                     </div>
                   </div>

                )}

                <div className="p-4">

                  <div className="flex items-center justify-between gap-2">

                   <div className="flex gap-1.5 flex-wrap">
                       <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-500/10">
                          {item.category || "Other"}
                        </span>
                        {(item as any).promotedUntil?.toMillis?.() > Date.now() && (
                          <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/10">📈 Promoted</span>
                        )}
                        {item.condition && (
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                            item.condition === "New"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/10"
                              : "bg-zinc-800/60 text-zinc-400 border-zinc-700/30"
                          }`}>
                            {item.condition === "New" ? "🆕 New" : item.condition}
                          </span>
                        )}
                     </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); toggleWatchlist(item); }}
                        className={`relative text-base transition-all duration-200 hover:scale-110 active:scale-95 ${
                          JSON.parse(localStorage.getItem("watchlist") || "[]").some((w: any) => w.id === item.id)
                            ? "text-red-400" : "text-zinc-500 hover:text-red-400"
                        }`}
                      >
                        {JSON.parse(localStorage.getItem("watchlist") || "[]").some((w: any) => w.id === item.id) ? "❤️" : "♡"}
                      </button>

                  </div>

                  <h2 className="mt-2.5 line-clamp-1 text-[17px] font-black tracking-tight text-white group-hover:text-sky-400 transition-colors duration-150">
                    {item.title}
                  </h2>

                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-zinc-500">
                    {item.description}
                  </p>

                    <div className="mt-3 flex items-baseline gap-2">
                      <p className="text-2xl font-black tracking-tight text-white">
                       ${item.price}
                      </p>
                     {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                       <span className="text-sm font-bold text-amber-400">Bid: ${item.currentBid || item.startingBid || 0}</span>
                     )}
                   </div>

                   <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500">
                    {item.location && <span className="flex items-center gap-1">📍 {item.location}</span>}
                    {item.createdAt?.seconds && <span>{timeAgo(item.createdAt.seconds)}</span>}
                    {item.pickupAvailable && <span>📍 Pickup</span>}
                    {item.shippingAvailable && <span>📦 Shipping</span>}
                    <span className="ml-auto flex items-center gap-1">👁 {item.views || 0}</span>
                  </div>

                    <div className="mt-3 flex gap-2">

                      {user && user.email !== item.sellerEmail && (
                        <>
                          {(item.category === "Cars" || item.category === "Property") && item.acceptOffers ? (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); setOfferListing(item); setShowOfferModal(true); }}
                                className="flex-1 rounded-md border border-sky-500/25 bg-sky-500/5 py-2.5 text-[12px] font-semibold text-sky-400/70 transition-all duration-150 hover:bg-sky-500/15 hover:text-sky-400 hover:border-sky-500/40 hover:shadow-[0_0_14px_rgba(14,165,233,0.12)] active:scale-95"
                              >
                                Make Offer
                              </button>
                              {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                                <Link
                                  href={`/post/listing/${item.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex flex-1 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 py-2.5 text-[12px] font-semibold text-amber-400/70 transition-all duration-150 hover:bg-amber-500/20 hover:text-amber-400 hover:border-amber-500/50 hover:shadow-[0_0_14px_rgba(245,158,11,0.12)] active:scale-95"
                                >
                                  Bid Now
                                </Link>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleBuyNow(item); }}
                                className="flex-1 rounded-md border border-sky-500/25 bg-sky-500/5 py-2.5 text-[12px] font-semibold text-sky-400/70 transition-all duration-150 hover:bg-sky-500/15 hover:text-sky-400 hover:border-sky-500/40 hover:shadow-[0_0_14px_rgba(14,165,233,0.12)] active:scale-95"
                              >
                                Buy Now
                              </button>
                              {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                                <Link
                                  href={`/post/listing/${item.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex flex-1 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 py-2.5 text-[12px] font-semibold text-amber-400/70 transition-all duration-150 hover:bg-amber-500/20 hover:text-amber-400 hover:border-amber-500/50 hover:shadow-[0_0_14px_rgba(245,158,11,0.12)] active:scale-95"
                                >
                                  Bid Now
                                </Link>
                              )}
                              {item.acceptOffers && (
                                <Link
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setOfferListing(item);
                                    setShowOfferModal(true);
                                  }}
                                  className="ml-1 text-[11px] text-sky-400 underline underline-offset-2 hover:text-sky-300"
                                >
                                  Offer
                                </Link>
                              )}
                            </>
                          )}

                          <Link
                            href={`/post/listing/${item.id}#contact`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-1 items-center justify-center rounded-md border border-zinc-700/30 py-2.5 text-[12px] font-semibold text-[var(--muted)] transition-all duration-150 hover:border-zinc-600/50 hover:text-[var(--foreground)] active:scale-95"
                          >
                            Message
                           </Link>
                        </>
                       )}
                      {user && user.email === item.sellerEmail && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPromoteItem(item); }}
                          className="rounded-md bg-amber-500/10 px-4 py-2.5 text-[12px] font-semibold text-amber-400 transition-all duration-150 hover:bg-amber-500/20 active:scale-95"
                        >
                          📈 Boost
                        </button>
                        <Link
                          href={`/post/ai?edit=${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                           className="rounded-md bg-sky-500/10 px-4 py-2.5 text-[12px] font-semibold text-sky-400 transition-all duration-150 hover:bg-sky-500/20 active:scale-95"
                         >
                           Edit
                        </Link>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item); }}
                           className="rounded-md bg-zinc-800/60 px-4 py-2.5 text-[12px] font-semibold text-[var(--foreground)] transition-all duration-150 hover:bg-zinc-700 active:scale-95"
                         >
                           Remove
                        </button>
                      </>
                    )}

                  </div>

                    {/* SELLER CARD */}
                    <Link
                      href={user?.email === item.sellerEmail ? "#" : `/seller/${item.sellerUsername || item.sellerEmail}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block hover:cursor-pointer"
                    >
                     {(() => {
                        const email = item.sellerEmail;
                        const username = item.sellerUsername || email?.split("@")[0] || "—";
                        const initial = username.charAt(0).toUpperCase();
                        const stats = sellerReviewStats[email || ""];
                        const avgRating = stats ? stats.avg : 0;
                        const reviewCount = stats ? stats.count : 0;
                        const fullStars = Math.floor(avgRating);
                        const hasHalf = avgRating - fullStars >= 0.5;
                        return (
                          <div className="group mt-2 rounded-lg border border-zinc-800/30 bg-zinc-800/20 p-3 transition-all duration-200 hover:border-sky-500/40 hover:bg-zinc-800/30 hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(0,0,0,0.2)]">
                            <div className="flex items-center gap-2">
                              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-violet-500 to-purple-600 text-[13px] font-bold text-[var(--foreground)] shadow-[0_0_10px_rgba(139,92,246,0.2)] ring-1 ring-white/10">
                                {initial}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="truncate text-[14px] font-semibold text-[var(--foreground)]">{username}</span>
                                  {sellerBadges[email || ""] === "legendary" && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 animate-pulse">👑 The Five</span>}
                                  {sellerBadges[email || ""] === "epic" && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-400">💎 Epic</span>}
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                                  {reviewCount > 0 ? (
                                    <>
                                      <span className="text-amber-400">{'★'.repeat(fullStars)}{hasHalf ? '½' : ''}</span>
                                      <span>{avgRating.toFixed(1)}</span>
                                      <span>·</span>
                                      <span>{reviewCount} review{reviewCount > 1 ? "s" : ""}</span>
                                    </>
                                  ) : (
                                    <span>No reviews yet</span>
                                  )}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[10px] text-[var(--muted)]">View profile</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                   </Link>

                </div>

              </div>

            );
          });
        })()}

        </div>

        {visibleCount < filteredListings.length ? (
          <div ref={sentinelRef} className="h-4" />
        ) : filteredListings.length > 0 && (
          <p className="mt-8 text-center text-xs text-[var(--muted)]">All {filteredListings.length} listings loaded</p>
        )}

      </section>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Delete listing?</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={async () => { await deleteListing(deleteConfirm.id); setDeleteConfirm(null); }} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Delete</button>
            </div>
          </div>
        </div>
      )}

      {promoteItem && (
        <PromoteModal
          listing={promoteItem}
          onClose={() => setPromoteItem(null)}
        />
      )}

      {/* RECENTLY VIEWED */}
      {recentlyViewed.length > 0 && (
        <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-1.5">
          <div className="relative mb-3 pt-2">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
            <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-[var(--foreground)]">Recently Viewed</p>
          </div>
           <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
             {recentlyViewed.map((item) => (
               <div
                 key={item.id}
onClick={() => router.push(`/post/listing/${item.id}`)}
                     className="group shrink-0 w-56 rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-3 cursor-pointer hover:border-sky-500/40 hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(0,0,0,0.25)] transition-all duration-300"
                >
                {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).classList.add("hidden"); }} className="h-20 w-full rounded-lg object-cover" />
                ) : (
                    <div className="h-20 w-full rounded-lg bg-gradient-to-br from-sky-500/15 via-violet-500/15 to-purple-600/15 flex items-center justify-center text-[var(--foreground)] text-xs">
                        <div className="text-center">
                            <div className="text-xl font-bold mb-0.5">SD</div>
                            <div className="text-xs">Sky Drop</div>
                        </div>
                    </div>
                )}
                 <p className="mt-2.5 truncate text-[15px] font-bold text-[var(--foreground)]">{item.title}</p>
                 <p className="mt-0.5 text-base font-black" style={{ color: "var(--foreground)" }}>${item.price}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">👁 {(item as any).views || 0} views</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* RECENTLY SOLD */}
      {listings.filter(l => l.status === "sold").length > 0 && (
        <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-1.5">
          <div className="relative mb-3 pt-2">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
            <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-[var(--foreground)]">Recently Sold</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {listings.filter(l => l.status === "sold").slice(0, 6).map((item) => (
              <div key={item.id} className="shrink-0 w-44 rounded-xl border border-zinc-800/40 bg-zinc-900/50 p-3 opacity-80">
                {item.images?.[0] || item.imageUrl || item.image ? (
                  <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" loading="lazy" className="h-20 w-full rounded-lg object-cover" />
                ) : (
                  <div className="h-20 w-full rounded-lg bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-purple-600/10 flex items-center justify-center text-xs text-[var(--muted)]">SD</div>
                )}
                <p className="mt-2 truncate text-xs font-bold text-[var(--foreground)]">{item.title}</p>
                <p className="text-xs font-bold text-emerald-400">Sold · ${item.price}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Scroll-to-top */}
      {showScrollBtn && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 md:bottom-8 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg transition hover:bg-sky-400 active:scale-95"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}



    </main>
  );
}