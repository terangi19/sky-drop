"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  useCallback,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AWHINA_NAME } from "./lib/awhina-brand";
import Navbar from "./components/Navbar";
import Background from "./components/Background";
import PageTransition from "./components/PageTransition";
import { showToast } from "./components/Toast";
import { cancelPendingXPByListing, trackListingDeleted } from "./lib/xpValidation";
import { createNotification } from "./lib/notifications";

import {
  User,
} from "firebase/auth";


const PromoteModal = lazy(() => import("./components/PromoteModal"));
const MarketplaceListingCard = lazy(() => import("./components/MarketplaceListingCard"));
const ArrangePurchaseModal = lazy(() => import("./components/ArrangePurchaseModal"));
const HotThisWeek = lazy(() => import("./components/HotThisWeek"));
import { LISTING_GRID, LISTING_GRID_MT, PAGE_SHELL_MARKETPLACE, PAGE_SHELL_WIDE } from "./lib/page-layout";
import { sellerHasStripeConfigured } from "./lib/seller-payments";
import { funnel } from "./lib/funnel-events";
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
import { isHomeBrowseListing, isPhysicalHomeCategoryListing } from "./lib/listing-types";
import { isDemoListing } from "./lib/marketplace-display";
import { adjustListingWatchlistCount } from "./lib/listing-watchlist-count";
import { HOME_MARKETPLACE_THEME as t } from "./lib/browse-category-config";
import { useSellerListingMeta } from "./lib/useSellerListingMeta";

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
  type?: string;
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
  { emoji: "", name: "Cars" },
  { emoji: "", name: "Tech" },
  { emoji: "", name: "Gaming" },
  { emoji: "", name: "Fashion" },
  { emoji: "", name: "Home" },
  { emoji: "", name: "Sports" },
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

  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);

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
  const [showArrangeModal, setShowArrangeModal] = useState(false);
  const [arrangeListing, setArrangeListing] = useState<Listing | null>(null);

  const lastOfferTime = useRef(0);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const { sellerReviewStats, sellerBadges, sellerFullyVerified, sellerJoinedDate, sellerListingCount } = useSellerListingMeta(listings);
  const [savedSearches, setSavedSearches] = useState<Array<{query: string; category: string; label: string}>>([]);
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Listing | null>(null);
  const [promoteItem, setPromoteItem] = useState<any>(null);
  const [watchlistTick, setWatchlistTick] = useState(0);

  const activeCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    const top3 = new Set(["Cars", "Tech", "Gaming"]);
    for (const l of listings) {
      if (!isPhysicalHomeCategoryListing(l)) continue;
      const cat = l.category;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    return trendingCategories.filter((c) => top3.has(c.name) || (counts[c.name] || 0) > 0);
  }, [listings]);
  const [animatedCount, setAnimatedCount] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showAttentionModal, setShowAttentionModal] = useState(false);
  const [showAttentionBanner, setShowAttentionBanner] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounced search suggestions
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim().length >= 2) {
        // Generate simple suggestions from saved searches and categories
        const suggestions: string[] = [];
        
        // Add matching saved searches
        savedSearches.forEach((saved) => {
          if (saved.query.toLowerCase().includes(search.toLowerCase()) && suggestions.length < 5) {
            suggestions.push(saved.query);
          }
        });
        
        // Add matching categories
        categories.forEach((cat) => {
          if (cat.toLowerCase().includes(search.toLowerCase()) && cat !== "All" && suggestions.length < 8) {
            suggestions.push(cat);
          }
        });
        
        setSearchSuggestions(suggestions);
        setShowSearchSuggestions(suggestions.length > 0);
      } else {
        setShowSearchSuggestions(false);
        setSearchSuggestions([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [search, savedSearches]);

  useEffect(() => {
    setRecentlyViewed(getRecentlyViewed());
    try {
      const saved = JSON.parse(localStorage.getItem("savedSearches") || "[]");
      setSavedSearches(saved.slice(0, 6));
    } catch {}
    try {
      const dismissed = localStorage.getItem("attentionBannerDismissed");
      if (dismissed === "true") setShowAttentionBanner(false);
    } catch {}

    const handleShowAnnouncement = () => {
      try { localStorage.removeItem("attentionBannerDismissed"); } catch {}
      setShowAttentionBanner(true);
      setShowAttentionModal(true);
    };
    window.addEventListener("show-sky-drop-announcement", handleShowAnnouncement);
    return () => window.removeEventListener("show-sky-drop-announcement", handleShowAnnouncement);
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

  // Fetch listings with getDocs + polling (60 seconds) instead of real-time for cost optimization
  useEffect(() => {
    if (!authReady) return;
    let mounted = true;

    async function fetchListings() {
      if (!mounted) return;
      try {
        // Select only needed fields to reduce data transfer and Firestore read costs
        const listingsSnap = await getDocs(
          query(
            collection(db, "listings"),
            orderBy("createdAt", "desc"),
            limit(100)
          )
        );
        const tradePostsSnap = await getDocs(
          query(
            collection(db, "tradePosts"),
            orderBy("createdAt", "desc"),
            limit(50)
          )
        );

        if (!mounted) return;

        // Map only essential fields to reduce memory usage
        const listingItems = listingsSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title,
            price: data.price,
            image: data.image,
            imageUrl: data.imageUrl,
            category: data.category,
            sellerEmail: data.sellerEmail,
            sellerUsername: data.sellerUsername,
            createdAt: data.createdAt,
            status: data.status,
            type: data.type,
          };
        });
        const tradeItems = tradePostsSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title,
            price: data.price,
            image: data.image,
            sellerEmail: data.sellerEmail,
            sellerUsername: data.sellerUsername,
            createdAt: data.createdAt,
            status: data.status,
            type: data.type,
          };
        });

        const combined = [...listingItems, ...tradeItems];
        const filtered = combined.filter((i: any) => i.status !== "flagged" && i.status !== "pending_review");
        filtered.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
        setListings(filtered.slice(0, 100));
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch listings:", error);
        if (mounted) setLoading(false);
      }
    }

    fetchListings();
    // Refresh every 5 minutes instead of 60 seconds to reduce Firestore reads
    // Also refetch when tab becomes visible (user returns to app)
    const interval = setInterval(fetchListings, 300000); // 5 minutes

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mounted) {
        fetchListings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, authReady]);

  // Scroll-to-top visibility
  useEffect(() => {
    const onScroll = () => setShowScrollBtn(window.scrollY > 600 || visibleCount > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visibleCount]);

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

  async function saveSearch() {
    if (!search && selectedCategory === "All") return;
    const label = search || selectedCategory;
    const newSearch = { query: search, category: selectedCategory, label };
    const updated = [newSearch, ...savedSearches.filter(s => s.label !== label)].slice(0, 6);
    setSavedSearches(updated);
    localStorage.setItem("savedSearches", JSON.stringify(updated));
    if (user?.uid && user.email) {
      try {
        await setDoc(doc(db, "savedSearches", `${user.uid}_${label}`), {
          ...newSearch,
          userId: user.uid,
          userEmail: user.email,
          createdAt: new Date().toISOString(),
        });
      } catch (e) { console.error("Failed to save search to Firestore:", e); }
    }
    showToast("Search saved!");
  }

  async function removeSavedSearch(label: string) {
    const updated = savedSearches.filter(s => s.label !== label);
    setSavedSearches(updated);
    localStorage.setItem("savedSearches", JSON.stringify(updated));
    if (user?.uid) {
      try {
        await deleteDoc(doc(db, "savedSearches", `${user.uid}_${label}`));
      } catch (e) { console.error("Failed to remove saved search:", e); }
    }
  }

  const applySavedSearch = useCallback((saved: { query: string; category: string }) => {
    setSearch(saved.query);
    setSelectedCategory(saved.category);
  }, []);

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

    const handleBuyNow = useCallback(async (item: Listing) => {
    if (!isListingVisibleInMarketplace(item)) return;
    
    // Check if seller has Stripe configured for Pay Now
    if (item.paymentType === "contact") {
      setArrangeListing(item);
      setShowArrangeModal(true);
      return;
    }
    
    // For Stripe payments, check if seller has Stripe configured
    if (item.sellerEmail) {
      try {
        const sellerSnap = await getDoc(doc(db, "profiles", item.sellerEmail.split("@")[0]));
        if (sellerSnap.exists()) {
          const sellerData = sellerSnap.data();
          if (!sellerHasStripeConfigured(sellerData)) {
            // Seller doesn't have Stripe, default to Arrange Purchase
            setArrangeListing(item);
            setShowArrangeModal(true);
            return;
          }
        }
      } catch (e) {
        console.error("Failed to check seller Stripe status:", e);
        // On error, try Stripe checkout
      }
    }
    
    router.push(`/post/listing/${item.id}?buy=1`);
  }, [router]);

    const saveToWatchlist = useCallback(async (item: any) => {
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
  }, [user]);

  async function toggleWatchlist(item: any) {
    const now = new Date().toISOString();
    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "watchlist", item.id));
        if (snap.exists()) {
          const { deleteDoc } = await import("firebase/firestore");
          await deleteDoc(doc(db, "users", user.uid, "watchlist", item.id));
          await deleteDoc(doc(db, "watchlist", `${user.uid}_${item.id}`));
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
        const watchData = {
          id: item.id, title: item.title, price: item.price, imageUrl: item.imageUrl || item.image || "",
          savedPrice: item.price,
          savedAt: now,
        };
        setDoc(doc(db, "users", user.uid, "watchlist", item.id), watchData).catch((e) => { console.error("Watchlist save failed:", e); showToast("Failed to save to watchlist", "error"); });
        setDoc(doc(db, "watchlist", `${user.uid}_${item.id}`), {
          ...watchData,
          userId: user.uid,
          userEmail: user.email,
          listingId: item.id,
        }).catch((e) => { console.error("Watchlist index save failed:", e); });
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
              !isDemoListing(item) &&
              isPhysicalHomeCategoryListing(item)
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
      const sendToken = await user.getIdToken();
      await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sendToken}` },
        body: JSON.stringify({
          type: "offer", receiver: offerListing.sellerEmail,
          text: `Offer: $${offerAmount}`,
          offerType: "make", offerAmount: String(offerAmount), offerStatus: "pending",
          listingId: offerListing.id, listingTitle: offerListing.title,
          listingImage: offerListing.images?.[0] || offerListing.imageUrl || "",
          listingPrice: offerListing.price,
        }),
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in-backdrop">
          <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in-scale">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
            <h3 className="text-xl font-black text-white">Make an Offer</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">Make an offer for "{offerListing.title}"</p>
            <div className="mt-6">
              <label className="block text-sm font-bold text-[var(--muted)]">Your Offer ($)</label>
              <input
                type="number"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                min={1}
                placeholder={`e.g. ${Math.floor(Number(offerListing.price) * 0.8)}`}
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] outline-none transition focus:border-sky-500/50 focus:bg-[var(--card-hover)] focus:ring-2 focus:ring-sky-500/10"
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setShowOfferModal(false); setOfferListing(null); setOfferAmount(""); }}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] py-3 font-bold text-[var(--foreground)] transition hover:bg-[var(--card-hover)] hover:border-[var(--border-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={submitOffer}
                className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98]"
              >
                Send Offer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARRANGE PURCHASE MODAL */}
      {showArrangeModal && arrangeListing && user?.email && (
        <Suspense fallback={null}>
          <ArrangePurchaseModal
            listing={arrangeListing}
            buyerEmail={user.email}
            onClose={() => { setShowArrangeModal(false); setArrangeListing(null); }}
            onSuccess={(conversationId) => {
              setShowArrangeModal(false);
              setArrangeListing(null);
              router.push(`/messages?user=${encodeURIComponent(arrangeListing.sellerUsername || arrangeListing.sellerEmail || "")}&listing=${arrangeListing.id}`);
            }}
          />
        </Suspense>
      )}

      {/* ATTENTION USERS MODAL */}
      {showAttentionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in-backdrop" onClick={() => setShowAttentionModal(false)}>
          <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/30 bg-[var(--card)] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 ring-1 ring-amber-500/30">
              <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-white">Welcome to Sky Drop</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]">
              We're building the quickest, easiest marketplace for Aotearoa. Buy, sell, and connect with Kiwis in just a few taps.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]">
              This is just the beginning — loads more features are on the way to make Sky Drop even better for New Zealand.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]">
              Spotted something off or have an idea? We'd love to hear from you.
            </p>
            <div className="mt-4 rounded-xl bg-amber-500/10 p-4">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Report bugs or feedback</p>
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=support@skydrop.co.nz"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-amber-300 transition hover:text-amber-200 hover:underline"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                support@skydrop.co.nz
              </a>
            </div>
            <div className="mt-6">
              <button
                onClick={() => setShowAttentionModal(false)}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HERO / SEARCH SECTION */}
      <section className={`${PAGE_SHELL_WIDE} pt-1 sm:pt-2`}>
        <div className="relative overflow-hidden rounded-[2rem] bg-[var(--card)]">
          <div className="absolute inset-0 backdrop-blur-[2px]" />
          <div className="relative z-10 px-5 py-3 sm:px-6 sm:py-4">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)] shadow-[0_0_24px_rgba(14,165,233,0.1)]">
                NZ Marketplace
              </div>
              <h1 className="text-xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">
                New Zealand's Fastest Growing Marketplace
              </h1>
              <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
                Buy & sell anything with secure payments and buyer protection
              </p>
              {user ? (
                <div className="mt-4 flex justify-center">
                  <Link
                    href="/post/ai"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Start Selling
                  </Link>
                </div>
              ) : (
                <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    Join Free
                  </Link>
                  <Link
                    href="/#listings"
                    className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:bg-white/[0.06]"
                  >
                    Browse Items
                  </Link>
                </div>
              )}
            </div>

            {/* Search and Category Pills - solid background to block gradient */}
            <div className="relative mx-auto mt-3 max-w-2xl rounded-2xl bg-[var(--background)] px-4 py-3 shadow-xl border border-white/[0.08]">
              {/* Search */}
              <div className="relative">
                <div className="relative flex items-center rounded-xl bg-[var(--card)] shadow-xl backdrop-blur-md transition-all duration-300 group-focus-within:bg-[var(--card-hover)] ring-1 ring-sky-500/20">
                  <svg className="ml-4 h-5 w-5 shrink-0 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search listings..."
                    value={search}
                    ref={searchRef}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && search.trim()) {
                        if (user?.uid) {
                          funnel.searchUsed(user.uid, search.trim(), selectedCategory);
                        }
                        router.push(`/search?q=${encodeURIComponent(search.trim())}`);
                      }
                    }}
                    className="flex-1 bg-transparent px-3 py-3.5 text-[16px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] transition-colors"
                  />
                  <div className="mr-2 flex items-center gap-2">
                    {search && (
                      <button onClick={() => setSearch("")} className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--muted)] transition-all duration-200 hover:bg-[var(--card-hover)] hover:text-[var(--foreground)] hover:scale-110 active:scale-95" aria-label="Clear search">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (search.trim()) {
                          if (user?.uid) {
                            funnel.searchUsed(user.uid, search.trim(), selectedCategory);
                          }
                          router.push(`/search?q=${encodeURIComponent(search.trim())}`);
                        }
                      }}
                      disabled={!search.trim()}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-sky-400 transition-all duration-200 hover:bg-sky-500/20 hover:text-sky-300 hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-sky-400 disabled:hover:scale-100"
                      title="Search"
                      aria-label="Search"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                    {(search || selectedCategory !== "All") && (
                      <button onClick={saveSearch} className="flex h-11 w-11 items-center justify-center rounded-lg text-sky-400 transition-all duration-200 hover:bg-sky-500/20 hover:text-sky-300 hover:scale-110 active:scale-95" title="Save search" aria-label="Save search">
                        <svg className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {showSearchSuggestions && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--card)] shadow-xl">
                    {searchSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSearch(suggestion);
                          setShowSearchSuggestions(false);
                          router.push(`/search?q=${encodeURIComponent(suggestion)}`);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-sky-500/10 hover:text-sky-300"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category pills - inside solid background for uniform contrast */}
              <div className="mt-3 flex justify-center">
                <div className="relative flex max-w-full gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-none">
                  <button
                    onClick={() => setSelectedCategory("All")}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-medium transition-all duration-200 active:scale-95 ${
                      selectedCategory === "All"
                        ? "border-sky-400/30 bg-sky-500/10 text-white shadow-[0_0_24px_rgba(14,165,233,0.1)] hover:shadow-[0_0_32px_rgba(14,165,233,0.15)]"
                        : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)]"
                    }`}
                  >
                    All
                  </button>
                  {activeCategories.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => setSelectedCategory(cat.name)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-medium transition-all duration-200 active:scale-95 ${
                        selectedCategory === cat.name
                          ? "border-sky-400/30 bg-sky-500/10 text-white shadow-[0_0_24px_rgba(14,165,233,0.1)] hover:shadow-[0_0_32px_rgba(14,165,233,0.15)]"
                          : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)]"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* SAVED SEARCHES */}
              {savedSearches.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {savedSearches.map((s) => (
                    <div key={s.label} className="group flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-500/10 to-sky-500/5 px-3.5 py-1.5 text-[11px] text-white transition-all duration-200 hover:bg-sky-500/15 hover:shadow-lg hover:shadow-sky-500/10">
                      <button onClick={() => applySavedSearch(s)} className="flex items-center gap-1.5">
                        <svg className="h-3 w-3 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        <span className="font-medium">{s.label || s.query}</span>
                        {(() => { const m = savedSearchMatchCounts.find(m => m.label === s.label); if (m && m.count > 0) return <span className="ml-1 rounded-full bg-sky-500/30 px-2 py-0.5 text-[9px] font-bold text-sky-300 border border-sky-500/30">{m.count}</span>; return null; })()}
                      </button>
                      <button onClick={() => removeSavedSearch(s.label)} className="flex h-5 w-5 items-center justify-center text-sky-400/60 hover:text-red-400 ml-0.5 transition-colors rounded hover:bg-sky-500/10" title="Remove saved search">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Attention Users banner */}
      {showAttentionBanner && (
        <section className={`${PAGE_SHELL_WIDE} pt-1 pb-0.5`}>
          <div className="group flex w-full items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-amber-400/10 px-4 py-2 text-sm font-bold text-amber-300 transition-all duration-200 hover:from-amber-500/25 hover:to-amber-400/20 hover:shadow-[0_0_24px_rgba(245,158,11,0.12)] active:scale-[0.99]">
            <button
              onClick={() => setShowAttentionModal(true)}
              className="flex flex-1 items-center justify-center gap-2 text-amber-300"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/30 text-[10px]">!</span>
              <span>Welcome to Sky Drop — More features coming soon</span>
              <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            <button
              onClick={() => {
                setShowAttentionBanner(false);
                try { localStorage.setItem("attentionBannerDismissed", "true"); } catch {}
              }}
              className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-amber-300/70 transition hover:bg-amber-500/20 hover:text-amber-300"
              aria-label="Dismiss attention banner"
              title="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section className={`${PAGE_SHELL_WIDE} py-1`}>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl bg-gradient-to-br from-sky-500/[0.03] via-sky-500/[0.01] to-transparent px-5 py-3 sm:gap-x-12 lg:gap-x-16 backdrop-blur-md relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-400/[0.02] to-transparent" />
          <div className="absolute inset-0 backdrop-blur-sm" />
          {[
            { label: "Flexible payments", sub: "Stripe or Arrange Purchase", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /> },
            { label: "Dispute protection", sub: "7-day window", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /> },
            { label: "Verified sellers", sub: "Profiles & reviews", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
            { label: "NZ community", sub: "Built for Aotearoa", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /> },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 ring-1 ring-sky-500/20">
                <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{item.icon}</svg>
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] font-bold text-white">{item.label}</p>
                <p className="text-[10px] text-[var(--muted)]">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Suspense fallback={
        <div className={`${PAGE_SHELL_WIDE} py-2`}>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[1,2,3].map((i) => (
              <div key={i} className="shrink-0 w-72 h-40 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
            ))}
          </div>
        </div>
      }>
        <HotThisWeek
          items={hotItems}
          timeAgo={timeAgo}
          saveRecentlyViewed={saveRecentlyViewed}
          cdnUrl={cdnUrl}
          user={user}
          sellerReviewStats={sellerReviewStats}
          sellerBadges={sellerBadges}
          sellerFullyVerified={sellerFullyVerified}
        />
      </Suspense>

      {/* LISTINGS */}
      <section id="listings" className={`${PAGE_SHELL_MARKETPLACE} pb-10`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {selectedCategory !== "All" ? selectedCategory : "Latest listings"}
            </h2>
            {(selectedCategory !== "All" || selectedCondition !== "All" || selectedRegion !== "All" || search) ? (
              <div className="flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 border border-sky-500/20">
                <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Results</span>
                <span className="text-sm font-bold text-white">{animatedCount}</span>
              </div>
            ) : (
              <p className="mt-0.5 text-[11px] text-white">
                {animatedCount} listing{animatedCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)}
                className="appearance-none rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 pr-8 text-xs text-[var(--foreground)] outline-none transition hover:border-[var(--border-hover)] focus:border-sky-500/30 cursor-pointer">
                <option value="All" className="bg-[var(--card)]">Condition</option>
                {["New", "Used - Like New", "Used - Good", "Used - Fair"].map((c) => (
                  <option key={c} value={c} className="bg-[var(--card)]">{c}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </div>
            <div className="relative">
              <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}
                className="appearance-none rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 pr-8 text-xs text-[var(--foreground)] outline-none transition hover:border-[var(--border-hover)] focus:border-sky-500/30 cursor-pointer">
                <option value="All" className="bg-[var(--card)]">Region</option>
                {["Northland","Auckland","Waikato","Bay of Plenty","Gisborne","Hawke's Bay","Taranaki","Manawatu","Wellington","Nelson","Marlborough","West Coast","Canterbury","Otago","Southland"].map((r) => (
                  <option key={r} value={r} className="bg-[var(--card)]">{r}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </div>
            <div className="relative">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 pr-8 text-xs text-[var(--foreground)] outline-none transition hover:border-[var(--border-hover)] focus:border-sky-500/30 cursor-pointer">
                <option value="newest" className="bg-[var(--card)]">Newest</option>
                <option value="oldest" className="bg-[var(--card)]">Oldest</option>
                <option value="low-high" className="bg-[var(--card)]">Price Low → High</option>
                <option value="high-low" className="bg-[var(--card)]">Price High → Low</option>
                <option value="trending" className="bg-[var(--card)]">🔥 Trending</option>
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </div>
            {(selectedCategory !== "All" || selectedCondition !== "All" || selectedRegion !== "All" || search) && (
              <button onClick={() => { setSelectedCategory("All"); setSelectedCondition("All"); setSelectedRegion("All"); setSearch(""); setSortBy("newest"); }}
                className="rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-medium text-sky-400 transition hover:border-sky-500/40 hover:text-sky-300">
                Clear
              </button>
            )}
          </div>
        </div>

          {loading && (
            <div className={LISTING_GRID_MT}>
              {[1,2,3,4,5,6,7,8].map((_, i) => (
                <div key={i} className="relative overflow-hidden rounded-2xl bg-[var(--card)] border border-white/[0.04]">
                  <div className="aspect-[4/3] w-full bg-gradient-to-br from-sky-500/[0.05] via-sky-500/[0.02] to-transparent animate-shimmer" />
                  <div className="p-4 space-y-3">
                    <div className="flex gap-2">
                      <div className="h-4 w-14 rounded-md bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                      <div className="h-4 w-10 rounded-md bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                    </div>
                    <div className="h-5 w-3/4 rounded bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                    <div className="h-4 w-1/2 rounded bg-[var(--card)] animate-shimmer" />
                    <div className="flex gap-2">
                      <div className="h-9 flex-1 rounded-lg bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                      <div className="h-9 w-20 rounded-lg bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                    </div>
                  </div>
               </div>
            ))}
          </div>
          )}

        {!loading && filteredListings.length === 0 && (
          <div className="relative mx-auto max-w-md mt-16 text-center">
            {listings.length === 0 ? (
              <>
                <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-sky-500/20 border border-sky-500/30">
                  <svg className="h-10 w-10 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white mb-2">Welcome to Sky Drop</h2>
                <p className="text-sm text-[var(--muted)] mb-6">No listings yet — be the first to list something and start selling!</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/post/ai"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.97]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Create a Listing
                  </Link>
                  <Link href="/about"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[var(--card)] px-6 py-3.5 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:bg-[var(--card-hover)] hover:border-white/[0.15] active:scale-[0.97]">
                    Learn More
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500/[0.15] to-sky-500/[0.05] border border-sky-500/30 shadow-[0_0_30px_rgba(14,165,233,0.15)]">
                  <svg className="h-10 w-10 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white mb-2">No listings found</h2>
                <p className="text-sm text-[var(--muted)] mb-4">
                  {search ? <>Nothing matched <span className="font-semibold text-white">&ldquo;{search}&rdquo;</span> with the current filters.</> : "No listings match your current filters."}
                </p>
                <div className="mb-6 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-left">
                  <p className="text-xs font-bold text-sky-400 mb-2">Try these:</p>
                  <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                    {selectedCategory !== "All" && <li>• Browse <button onClick={() => setSelectedCategory("All")} className="text-sky-400 hover:underline">all categories</button> instead of "{selectedCategory}"</li>}
                    {selectedRegion !== "All" && <li>• Expand search to <button onClick={() => setSelectedRegion("All")} className="text-sky-400 hover:underline">all of New Zealand</button></li>}
                    {selectedCondition !== "All" && <li>• Include <button onClick={() => setSelectedCondition("All")} className="text-sky-400 hover:underline">all conditions</button></li>}
                    {search && <li>• Try <button onClick={() => setSearch("")} className="text-sky-400 hover:underline">clearing your search</button> and browsing</li>}
                    <li>• <Link href="/post/ai?type=wanted" className="text-sky-400 hover:underline">Post a Wanted ad</Link> so sellers can find you</li>
                  </ul>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button onClick={() => { setSelectedCategory("All"); setSelectedCondition("All"); setSelectedRegion("All"); setSearch(""); }}
                    className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-6 py-3.5 text-sm font-bold text-sky-400 transition-all duration-200 hover:bg-sky-500/15 hover:border-sky-500/40 active:scale-[0.97]">
                    Clear all filters
                  </button>
                  <Link href="/post/ai?type=wanted"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[var(--card)] px-6 py-3.5 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:bg-[var(--card-hover)] active:scale-[0.97]">
                    Post a Wanted ad
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {!loading && filteredListings.length > 0 && (
        <div key={watchlistTick} className={LISTING_GRID}>
          {filteredListings.slice(0, visibleCount).map((item: any, cardIndex: number) => (
            <Suspense key={item.id} fallback={
              <div className="relative overflow-hidden rounded-2xl bg-[var(--card)] border border-white/[0.04]">
                <div className="aspect-[4/3] w-full bg-gradient-to-br from-sky-500/[0.05] via-sky-500/[0.02] to-transparent animate-shimmer" />
                <div className="p-4 space-y-3">
                  <div className="h-5 w-3/4 rounded bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                  <div className="h-4 w-1/2 rounded bg-[var(--card)] animate-shimmer" />
                  <div className="flex gap-2">
                    <div className="h-9 flex-1 rounded-lg bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                    <div className="h-9 w-20 rounded-lg bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                  </div>
                </div>
              </div>
            }>
              <MarketplaceListingCard
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
                  setOfferListing(listing as Listing);
                  setShowOfferModal(true);
                }}
                sellerReviewStats={sellerReviewStats}
                sellerBadges={sellerBadges}
                sellerFullyVerified={sellerFullyVerified}
                sellerJoinedDate={sellerJoinedDate}
                sellerListingCount={sellerListingCount}
                onPromote={(listing) => setPromoteItem(listing)}
                onDelete={(listing) => setDeleteConfirm(listing as Listing)}
              />
            </Suspense>
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
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Delete listing?</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-xl border border-white/[0.08] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)]">Cancel</button>
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
        <section className={`${PAGE_SHELL_MARKETPLACE} pb-4`}>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-white">Recently viewed</p>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {recentlyViewed.map((item) => (
              <div
                key={item.id}
                onClick={() => router.push(`/post/listing/${item.id}`)}
                className="group shrink-0 w-48 cursor-pointer rounded-xl border border-white/[0.04] bg-[var(--card)] p-2.5 transition hover:border-white/[0.10] hover:bg-[var(--card-hover)]"
              >
                {item.images?.[0] || item.imageUrl || item.image ? (
                  <img src={cdnUrl(item.images?.[0] || item.imageUrl || item.image || "")} alt={item.title} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).classList.add("hidden"); }} className="h-20 w-full rounded-lg object-cover" />
                ) : (
                  <div className="flex h-20 w-full items-center justify-center rounded-lg bg-[var(--card)] text-[10px] text-[var(--muted)]">No image</div>
                )}
                <p className="mt-2 truncate text-xs font-medium text-always-white">{item.title}</p>
                <p className="text-sm font-semibold tabular-nums text-sky-300">${item.price}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* RECENTLY SOLD */}
      {listings.filter((l) => !isListingVisibleInMarketplace(l)).length > 0 && (
        <section className={`${PAGE_SHELL_MARKETPLACE} pb-4`}>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-white">Recently sold</p>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {listings.filter((l) => !isListingVisibleInMarketplace(l)).slice(0, 6).map((item) => (
              <div key={item.id} className="relative shrink-0 w-40 rounded-xl border border-white/[0.04] bg-[var(--card)] p-2.5 opacity-75">
                {item.images?.[0] || item.imageUrl || item.image ? (
                  <img src={cdnUrl(item.images?.[0] || item.imageUrl || item.image || "")} alt={item.title} loading="lazy" className="h-16 w-full rounded-lg object-cover grayscale-[30%]" />
                ) : (
                  <div className="flex h-16 w-full items-center justify-center rounded-lg bg-[var(--card)] text-[10px] text-[var(--muted)]">No image</div>
                )}
                <p className="mt-2 truncate text-[11px] text-[var(--muted)]">{item.title}</p>
                <p className="text-[11px] font-medium text-white">Sold · ${item.price}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wanted Ads discovery banner */}
      {(() => {
        const wantedCount = listings.filter((l: any) => l.type === "wanted" && isListingVisibleInMarketplace(l)).length;
        if (wantedCount === 0) return null;
        return (
          <section className={`${PAGE_SHELL_MARKETPLACE} pb-4`}>
            <Link
              href="/wanted"
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 transition hover:border-amber-500/30 hover:bg-amber-500/[0.09]"
            >
              <div className="flex items-center gap-2.5">
                <div>
                  <p className="text-sm font-bold text-amber-300">{wantedCount} buyer{wantedCount !== 1 ? "s" : ""} looking for items</p>
                  <p className="text-[11px] text-amber-400/70">Browse Wanted Ads — you might have what they need</p>
                </div>
              </div>
              <svg className="h-4 w-4 shrink-0 text-amber-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </Link>
          </section>
        );
      })()}

      {/* Scroll-to-top */}
      {showScrollBtn && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-4 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-[var(--card)] text-[var(--foreground)] shadow-[0_0_20px_rgba(14,165,233,0.2)] backdrop-blur-md transition hover:bg-[var(--card-hover)] hover:shadow-[0_0_25px_rgba(14,165,233,0.3)] active:scale-95 md:bottom-8"
          aria-label="Scroll to top"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}



    </main>
  );
}