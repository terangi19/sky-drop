"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AWHINA_NAME } from "./lib/awhina-brand";
import Navbar from "./components/Navbar";
import Background from "./components/Background";
import { showToast } from "./components/Toast";
import { cancelPendingXPByListing, trackListingDeleted } from "./lib/xpValidation";
import { createNotification } from "./lib/notifications";

import {
  User,
} from "firebase/auth";


import PromoteModal from "./components/PromoteModal";
import MarketplaceListingCard from "./components/MarketplaceListingCard";
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

import { auth, db, storage, onAuthStateChanged } from "./lib/firebase";
import { ref, deleteObject } from "firebase/storage";
import { cdnUrl, cdnUrls } from "./lib/cdn";
import { isListingVisibleInMarketplace } from "./lib/listing-availability";
import { isDemoListing } from "./lib/marketplace-display";
import { adjustListingWatchlistCount } from "./lib/listing-watchlist-count";

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
  paymentType?: string;
  status?: string;
  stockQuantity?: number;
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

  function isInWatchlist(itemId: string): boolean {
    try {
      return JSON.parse(localStorage.getItem("watchlist") || "[]").some((w: any) => w.id === itemId);
    } catch { return false; }
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
  const [watchlistTick, setWatchlistTick] = useState(0);

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
    let listingItems: any[] = [];
    let tradeItems: any[] = [];

    function merge() {
      if (!mounted) return;
      const combined = [...listingItems, ...tradeItems];
      const filtered = combined.filter((i: any) => i.status !== "flagged" && i.status !== "pending_review");
      filtered.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setListings(filtered.slice(0, 100));
      setLoading(false);
    }

    const unsub1 = onSnapshot(
      query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(100)),
      (snap) => {
        if (!mounted) return;
        listingItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        merge();
      },
      () => { merge(); }
    );

    const unsub2 = onSnapshot(
      query(collection(db, "tradePosts"), orderBy("createdAt", "desc"), limit(50)),
      (snap) => {
        if (!mounted) return;
        tradeItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        merge();
      },
      () => { merge(); }
    );

    return () => { mounted = false; unsub1(); unsub2(); };
  }, [user, authReady]);

  // Scroll-to-top visibility
  useEffect(() => {
    const onScroll = () => setShowScrollBtn(window.scrollY > 600 || visibleCount > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visibleCount]);

  // Review stats — refetch when listings data or length changes
  useEffect(() => {
    if (listings.length === 0) return;
    let cancelled = false;
    (async () => {
      const uniqueEmails = [...new Set(listings.map((l: any) => l.sellerEmail).filter(Boolean))] as string[];
      if (uniqueEmails.length === 0 || cancelled) return;
      const chunkSize = 10;
      const stats: Record<string, { avg: number; count: number }> = {};
      for (let i = 0; i < uniqueEmails.length; i += chunkSize) {
        const chunk = uniqueEmails.slice(i, i + chunkSize);
        try {
          const snap = await getDocs(query(collection(db, "reviews"), where("sellerEmail", "in", chunk)));
          if (cancelled) return;
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
      if (!cancelled) setSellerReviewStats(stats);
    })();
    return () => { cancelled = true; };
  }, [listings]);

  // Fetch seller profile badges (legendary/epic)
  useEffect(() => {
    if (listings.length === 0) return;
    let cancelled = false;
    (async () => {
      const uniqueEmails = [...new Set(listings.map((l: any) => l.sellerEmail).filter(Boolean))] as string[];
      if (uniqueEmails.length === 0 || cancelled) return;
      const badges: Record<string, string> = {};
      for (let i = 0; i < uniqueEmails.length; i += 10) {
        const chunk = uniqueEmails.slice(i, i + 10);
        try {
          const snap = await getDocs(query(collection(db, "profiles"), where("email", "in", chunk)));
          if (cancelled) return;
          snap.docs.forEach((d) => {
            const data = d.data();
            const email = data.email as string;
            if (data.profileBadge) badges[email] = data.profileBadge as string;
          });
        } catch (e) { console.error("Badge fetch error:", e); }
      }
      if (!cancelled) setSellerBadges(badges);
    })();
    return () => { cancelled = true; };
  }, [listings]);

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

  function saveSearch() {
    if (!search && selectedCategory === "All") return;
    const label = search || selectedCategory;
    const newSearch = { query: search, category: selectedCategory, label };
    const updated = [newSearch, ...savedSearches.filter(s => s.label !== label)].slice(0, 6);
    setSavedSearches(updated);
    localStorage.setItem("savedSearches", JSON.stringify(updated));
    showToast("Search saved!");
  }

  function removeSavedSearch(label: string) {
    const updated = savedSearches.filter(s => s.label !== label);
    setSavedSearches(updated);
    localStorage.setItem("savedSearches", JSON.stringify(updated));
  }

  function applySavedSearch(saved: { query: string; category: string }) {
    setSearch(saved.query);
    setSelectedCategory(saved.category);
  }

  async function deleteListing(id: string) {



    // Verify ownership
    const listing = listings.find(l => l.id === id);
    if (!listing || listing.sellerEmail !== user?.email) {
      showToast("You can only delete your own listings", "error");
      return;
    }

    try {

      // Delete images from Storage
      const listingImages = (listing.images as string[]) || [];
      const allImages = [listing.imageUrl, listing.image, ...listingImages].filter(Boolean) as string[];
      await Promise.all(allImages.map(async (url) => {
        try {
          const storageRef = ref(storage, url);
          await deleteObject(storageRef);
        } catch {}
      }));

      await deleteDoc(
        doc(
          db,
          "listings",
          id
        )
      );

      cancelPendingXPByListing(user!.uid, id);
      trackListingDeleted(user!.uid, listing.title || "");

      showToast("Listing deleted.");

     } catch (error) {
       console.error(
         error
       );
       showToast("Failed to delete listing.", "error");
     }
   }

    function handleBuyNow(item: Listing) {
        if (!isListingVisibleInMarketplace(item)) return;
        if (item.paymentType === "contact") {
          router.push(`/post/listing/${item.id}`);
          return;
        }
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
       }).catch((e) => { console.error("Watchlist save failed:", e); showToast("Failed to save to watchlist", "error"); });
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
          savedPrice: item.price,
          savedAt: new Date().toISOString(),
        }).catch((e) => { console.error("Watchlist save failed:", e); showToast("Failed to save to watchlist", "error"); });
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

            const isVisible = (search === "" || matchesSearch) && (selectedCategory === "All" || matchesCategory) && (selectedCondition === "All" || matchesCondition) && (selectedRegion === "All" || matchesRegion);

            return (
              isVisible &&
              isListingVisibleInMarketplace(item) &&
              !isDemoListing(item)
            );

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
      showToast("Failed to send offer.", "error");
    }
    setShowOfferModal(false);
    setOfferListing(null);
    setOfferAmount("");
  };

  const hotItems = useMemo(
    () =>
      [...listings]
        .filter((l) => isListingVisibleInMarketplace(l) && !isDemoListing(l))
        .sort((a: any, b: any) => (Number(b.views) || 0) - (Number(a.views) || 0))
        .slice(0, 6) as any[],
    [listings]
  );
  const hotMaxViews = useMemo(() => Math.max(...hotItems.map((i: any) => i.views || 0), 1), [hotItems]);

  const savedSearchMatchCounts = useMemo(() => {
    return savedSearches.map((s) => {
      const q = s.query.toLowerCase();
      const cat = s.category;
      const count = listings.filter((l) => {
        if (!isListingVisibleInMarketplace(l)) return false;
        const matchesQuery = !q || (l.title?.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q) || l.category?.toLowerCase().includes(q));
        const matchesCategory = cat === "All" || l.category === cat;
        return matchesQuery && matchesCategory;
      }).length;
      return { label: s.label, count };
    });
  }, [listings, savedSearches]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">

      <Background />

      <Navbar />

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
                min={1}
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

          <div className="relative overflow-visible px-6 py-10 sm:px-10 sm:py-12">
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="parachute-scene">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" className="w-56 h-72 md:w-72 md:h-96 opacity-[0.05]">
                  <defs>
                    <linearGradient id="canopyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
                    </linearGradient>
                    <linearGradient id="boxGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.2" />
                    </linearGradient>
                  </defs>
                  <g className="canopy-group">
                    <path d="M100 5 C50 5, 10 25, 5 55 L195 55 C190 25, 150 5, 100 5Z" fill="url(#canopyGrad)" stroke="#38bdf8" strokeWidth="1.8" strokeLinejoin="round" className="canopy" />
                    <path d="M55 55 C60 40, 75 28, 100 28" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.4" fill="none" />
                    <path d="M145 55 C140 40, 125 28, 100 28" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.4" fill="none" />
                    <path d="M80 55 C82 42, 90 32, 100 32" stroke="#7dd3fc" strokeWidth="0.6" opacity="0.3" fill="none" />
                    <path d="M120 55 C118 42, 110 32, 100 32" stroke="#7dd3fc" strokeWidth="0.6" opacity="0.3" fill="none" />
                  </g>
                  <g className="lines-group">
                    <line x1="15" y1="55" x2="55" y2="140" stroke="#38bdf8" strokeWidth="0.8" opacity="0.35" className="line-l" />
                    <line x1="185" y1="55" x2="145" y2="140" stroke="#38bdf8" strokeWidth="0.8" opacity="0.35" className="line-r" />
                    <line x1="55" y1="55" x2="80" y2="140" stroke="#38bdf8" strokeWidth="0.6" opacity="0.25" className="line-ml" />
                    <line x1="145" y1="55" x2="120" y2="140" stroke="#38bdf8" strokeWidth="0.6" opacity="0.25" className="line-mr" />
                    <line x1="100" y1="55" x2="100" y2="140" stroke="#38bdf8" strokeWidth="0.6" opacity="0.25" className="line-c" />
                  </g>
                  <g className="box-group">
                    <rect x="62" y="140" width="76" height="50" rx="5" fill="url(#boxGrad)" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" className="box" />
                    <line x1="65" y1="158" x2="135" y2="158" stroke="#38bdf8" strokeWidth="1.2" opacity="0.4" />
                    <line x1="65" y1="175" x2="120" y2="175" stroke="#38bdf8" strokeWidth="0.8" opacity="0.2" />
                    <path d="M135 155 L145 148" stroke="#38bdf8" strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
                    <path d="M135 165 L148 160" stroke="#38bdf8" strokeWidth="0.8" opacity="0.3" strokeLinecap="round" />
                  </g>
                  <g className="glow-group">
                    <ellipse cx="100" cy="200" rx="60" ry="8" fill="#38bdf8" opacity="0.08" className="shadow" />
                  </g>
                </svg>
              </div>
            </div>
            <style>{`@keyframes dropIn { 0% { transform: translateY(-180px) scale(1.3); opacity: 0; } 20% { transform: translateY(10px) scale(0.98); opacity: 1; } 35% { transform: translateY(-15px) scale(1.02); } 50% { transform: translateY(5px) scale(0.99); } 65% { transform: translateY(-5px) scale(1.01); } 80% { transform: translateY(2px) scale(1); } 100% { transform: translateY(0) scale(1); } } @keyframes sway { 0%,100% { transform: translateX(0) rotate(0deg); } 25% { transform: translateX(3px) rotate(0.5deg); } 50% { transform: translateX(-2px) rotate(-0.3deg); } 75% { transform: translateX(2px) rotate(0.4deg); } } @keyframes floatGlow { 0%,100% { opacity: 0.08; transform: scaleX(1); } 50% { opacity: 0.15; transform: scaleX(1.2); } } .parachute-scene { animation: dropIn 5s cubic-bezier(0.22, 1, 0.36, 1) forwards; } .parachute-scene:hover .canopy-group { animation: sway 4s ease-in-out infinite; } .parachute-scene .glow-group { animation: floatGlow 3s ease-in-out infinite; }`}</style>
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/[0.07] px-4 py-1.5 text-[11px] font-bold text-sky-300 mb-6 tracking-wider uppercase backdrop-blur-sm shadow-[0_0_20px_rgba(56,189,248,0.15)] ring-1 ring-sky-400/10">
                NZ Marketplace
              </div>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl leading-none">
                <span className="bg-gradient-to-r from-white via-sky-200 to-white bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(56,189,248,0.25)]">
                  Welcome to Sky Drop
                </span>
              </h1>
              <p className="mt-4 max-w-xl mx-auto text-sm leading-relaxed text-zinc-400">
                {user
                  ? "Manage your listings, connect with buyers, and trade across New Zealand."
                  : "Free listings, Stripe Checkout or Arrange Purchase, live trade feeds, and a community marketplace built for New Zealand."}
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
                    {(search || selectedCategory !== "All") && (
                      <button onClick={saveSearch}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-sky-400"
                        title="Save search">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
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
            <p className="mt-10 mb-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Browse Categories</p>
            <div className="mt-0">
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => setSelectedCategory("All")}
                  className={`flex flex-col items-center gap-2 rounded-2xl border px-6 py-4 transition-all duration-200 min-w-[88px] ${
                    selectedCategory === "All"
                      ? "border-sky-500/40 bg-sky-500/10 shadow-[0_0_25px_rgba(14,165,233,0.15)]"
                      : "border-white/[0.05] bg-white/[0.03] hover:bg-white/[0.06] hover:-translate-y-1 hover:border-white/[0.10]"
                  }`}
                >
                  <span className={`text-2xl ${selectedCategory === "All" ? "" : "opacity-60"}`}>✨</span>
                  <span className={`text-xs font-bold ${selectedCategory === "All" ? "text-sky-400" : "text-zinc-400"}`}>All</span>
                </button>
                {activeCategories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border px-6 py-4 transition-all duration-200 min-w-[88px] ${
                      selectedCategory === cat.name
                        ? "border-sky-500/40 bg-sky-500/10 shadow-[0_0_25px_rgba(14,165,233,0.15)]"
                        : "border-white/[0.05] bg-white/[0.03] hover:bg-white/[0.06] hover:-translate-y-1 hover:border-white/[0.10]"
                    }`}
                  >
                    <span className={`text-3xl ${selectedCategory === cat.name ? "" : "opacity-60"}`}>{cat.emoji}</span>
                    <span className={`text-xs font-bold ${selectedCategory === cat.name ? "text-sky-400" : "text-zinc-400"}`}>{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* SAVED SEARCHES */}
            {savedSearches.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {savedSearches.map((s) => (
                  <div key={s.label} className="group flex items-center gap-1 rounded-full border border-sky-500/15 bg-sky-500/5 px-3 py-1 text-[11px] text-sky-400 transition hover:border-sky-500/30 hover:bg-sky-500/10">
                    <button onClick={() => applySavedSearch(s)} className="flex items-center gap-1">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      {s.label || s.query}
                      {(() => { const m = savedSearchMatchCounts.find(m => m.label === s.label); if (m && m.count > 0) return <span className="ml-1 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-400">{m.count}</span>; return null; })()}
                    </button>
                    <button onClick={() => removeSavedSearch(s.label)} className="text-sky-400/50 hover:text-red-400 ml-0.5" title="Remove saved search">&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* TRUST SIGNALS */}
      <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-1.5">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.03] bg-gradient-to-r from-emerald-500/[0.03] via-transparent to-sky-500/[0.03]">
          <div className="grid grid-cols-2 gap-px divide-x divide-white/[0.03] lg:grid-cols-4">
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-lg">
                🔒
              </div>
              <div>
                <p className="text-[13px] font-bold text-white">Flexible Payments</p>
                <p className="text-[11px] text-zinc-500">Stripe Checkout or Arrange in chat</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-lg">
                🛡️
              </div>
              <div>
                <p className="text-[13px] font-bold text-white">Dispute Protection</p>
                <p className="text-[11px] text-zinc-500">7-day dispute window</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-lg">
                ✓
              </div>
              <div>
                <p className="text-[13px] font-bold text-white">Verified Sellers</p>
                <p className="text-[11px] text-zinc-500">Real profiles with reviews</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-lg">
                🇳🇿
              </div>
              <div>
                <p className="text-[13px] font-bold text-white">NZ Community</p>
                <p className="text-[11px] text-zinc-500">Built for New Zealand</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOT THIS WEEK */}
      {listings.filter((l) => isListingVisibleInMarketplace(l)).length > 0 && (
        <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-1.5">
          <div className="relative mb-4 pt-2">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <div className="flex items-center gap-2 pt-3">
              <div className="h-5 w-1 rounded-full bg-gradient-to-b from-orange-500 to-amber-500" />
              <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-white">🔥 Hot This Week</p>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
            {hotItems.map((item: any) => (
            <div key={item.id} onClick={() => { saveRecentlyViewed(item); router.push(`/post/listing/${item.id}`); }}
              className="listing-card group shrink-0 w-72 cursor-pointer rounded-2xl border border-white/[0.04] bg-white/[0.02] p-3 text-[var(--cream)] transition-all duration-300 hover:bg-white/[0.04] hover:border-orange-500/30 hover:-translate-y-1 hover:shadow-[0_10px_30px_-10px_rgba(251,146,60,0.2)]">
              <div className="relative overflow-hidden rounded-xl">
                {item.images?.[0] || item.imageUrl || item.image ? (
                   <img src={cdnUrl(item.images?.[0] || item.imageUrl || item.image || "")} alt={item.title} loading="lazy" className="h-36 w-full rounded-xl object-cover transition-all duration-500 group-hover:scale-105" />
                ) : (
                  <div className="h-36 rounded-xl bg-gradient-to-br from-orange-500/10 via-red-500/10 to-amber-500/10 flex items-center justify-center text-xs text-[var(--cream)]">SD</div>
                )}
                <div className="absolute top-2 left-2">
                  <span className="rounded-full bg-orange-500/90 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">🔥 Trending</span>
                </div>
              </div>
              <div className="mt-3 flex items-start justify-between gap-2">
                <p className="truncate text-sm font-bold text-[var(--cream)] flex-1">{item.title}</p>
                <p className="shrink-0 text-base font-black text-[var(--cream)]">${item.price}</p>
              </div>
              {item.location && (
                <p className="mt-1 text-[11px] text-[var(--cream)]">📍 {item.location}</p>
              )}
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[var(--cream)]">
                {item.createdAt?.seconds != null && <span>{timeAgo(item.createdAt.seconds)}</span>}
                <span className="flex items-center gap-1">👁 {(item as any).views || 0}</span>
              </div>
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
            {listings.length === 0 ? (
              <>
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/10 to-violet-500/10 border border-sky-500/20">
                  <svg className="h-8 w-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white">Welcome to Sky Drop</h2>
                <p className="mt-2 text-sm text-zinc-500">No listings yet — be the first to list something!</p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/post/ai"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Create a Listing
                  </Link>
                  <Link href="/about"
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-600 px-6 py-3 text-sm font-bold text-zinc-300 transition hover:bg-zinc-800">
                    Learn More
                  </Link>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}

        {!loading && filteredListings.length > 0 && (
        <div key={watchlistTick} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredListings.slice(0, visibleCount).map((item: any, cardIndex: number) => (
            <MarketplaceListingCard
              key={item.id}
              item={item}
              cardIndex={cardIndex}
              user={user}
              isInWatchlist={(id) => {
                void watchlistTick;
                return isInWatchlist(id);
              }}
              onToggleWatchlist={toggleWatchlist}
              onCardClick={() => {
                saveRecentlyViewed(item);
                router.push(`/post/listing/${item.id}`);
              }}
              onBuyNow={handleBuyNow}
              onMakeOffer={(listing) => {
                setOfferListing(listing);
                setShowOfferModal(true);
              }}
              sellerReviewStats={sellerReviewStats}
              sellerBadges={sellerBadges}
              onPromote={(listing) => setPromoteItem(listing)}
              onDelete={(listing) => setDeleteConfirm(listing)}
            />
          ))}
        </div>
        )}

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
                     className="listing-card group shrink-0 w-56 rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-3 text-[var(--cream)] cursor-pointer hover:border-sky-500/40 hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(0,0,0,0.25)] transition-all duration-300"
                >
                {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={cdnUrl(item.images?.[0] || item.imageUrl || item.image || "")} alt={item.title} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).classList.add("hidden"); }} className="h-20 w-full rounded-lg object-cover" />
                ) : (
                    <div className="h-20 w-full rounded-lg bg-gradient-to-br from-sky-500/15 via-violet-500/15 to-purple-600/15 flex items-center justify-center text-[var(--cream)] text-xs">
                        <div className="text-center">
                            <div className="text-xl font-bold mb-0.5">SD</div>
                            <div className="text-xs">Sky Drop</div>
                        </div>
                    </div>
                )}
                 <p className="mt-2.5 truncate text-[15px] font-bold text-[var(--cream)]">{item.title}</p>
                 <p className="mt-0.5 text-base font-black text-[var(--cream)]">${item.price}</p>
                  <p className="mt-1 text-[10px] text-[var(--cream)]">👁 {(item as any).views || 0} views</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* RECENTLY SOLD */}
      {listings.filter((l) => !isListingVisibleInMarketplace(l)).length > 0 && (
        <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-1.5">
          <div className="relative mb-3 pt-2">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
            <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-[var(--foreground)]">Recently Sold</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {listings.filter((l) => !isListingVisibleInMarketplace(l)).slice(0, 6).map((item) => (
              <div key={item.id} className="listing-card shrink-0 w-44 rounded-xl border border-zinc-800/40 bg-zinc-900/50 p-3 text-[var(--cream)] opacity-80">
                {item.images?.[0] || item.imageUrl || item.image ? (
                   <img src={cdnUrl(item.images?.[0] || item.imageUrl || item.image || "")} alt={item.title} loading="lazy" className="h-20 w-full rounded-lg object-cover" />
                ) : (
                  <div className="h-20 w-full rounded-lg bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-purple-600/10 flex items-center justify-center text-xs text-[var(--cream)]">SD</div>
                )}
                <p className="mt-2 truncate text-xs font-bold text-[var(--cream)]">{item.title}</p>
                <p className="text-xs font-bold text-[var(--cream)]">Sold · ${item.price}</p>
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