"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Navbar from "../../../components/Navbar";
import Background from "../../../components/Background";
import ReportModal from "../../../components/ReportModal";
import CheckoutModal from "../../../components/CheckoutModal";
import PromoteModal from "../../../components/PromoteModal";
import JobApplicationModal from "../../../components/JobApplicationModal";
import { showToast } from "../../../components/Toast";
import { createNotification } from "../../../lib/notifications";
import { User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, updateDoc, where, Timestamp, setDoc } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../../../lib/firebase";
import { detectScam } from "../../../lib/scamdetection";
import { calculateTrustScore } from "../../../lib/trustscore";
import { isFullyVerifiedSeller, profileEmailVerified } from "../../../lib/seller-verified";
import { detectSuspiciousPrice } from "../../../lib/pricedetection";
import { safeGetDoc, safeOnSnapshot, parseFirestoreError, isOnline } from "../../../lib/firestore";
import { getFreshIdToken } from "../../../lib/api-auth";
import {
  isListingAvailableForPurchase,
  isListingVisibleInMarketplace,
} from "../../../lib/listing-availability";
import {
  countBuyerArrangeRequests,
  countBuyerPurchasedQuantity,
  getBuyerPurchaseUiState,
} from "../../../lib/buyer-purchase-ui";
import { ReviewStars } from "../../../components/SellerReviewStars";
import ServicePricingBadge from "../../../components/ServicePricingBadge";
import { formatServicePriceDisplay } from "../../../lib/service-pricing";
import { sendMessage } from "../../../lib/api-send-message";

function getBidIncrement(price: number): number {
  if (price < 50) return 1;
  if (price < 100) return 2;
  if (price < 500) return 5;
  if (price < 1000) return 10;
  return 50;
}

function getMinimumNextBid(price: number): number {
  return Math.floor(price) + getBidIncrement(Math.floor(price));
}

function timeAgo(seconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - seconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

interface Listing {
  id: string;
  title: string;
  price: string;
  description?: string;
  category?: string;
  image?: string;
  imageUrl?: string;
  images?: string[];
  createdAt?: { seconds: number };
  userId?: string;
  sellerEmail?: string;
  sellerUsername?: string;
  sellerId?: string;
  condition?: string;
  location?: string;
  acceptOffers?: boolean;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  pickupArea?: string;
  shippingFee?: number | null;
  freeShipping?: boolean;
  shipsWithinDays?: number;
  stockQuantity?: number;
  onePerBuyer?: boolean;
  saleType?: string;
  startingBid?: number;
  reservePrice?: number;
  auctionEndsAt?: { seconds: number } | any;
  currentBid?: number;
  currentMaxBid?: number;
  secondMaxBid?: number;
  bidCount?: number;
  highestBidder?: string;
  expiresAt?: Timestamp;
  serviceDuration?: string;
  eventDate?: string;
  eventTime?: string;
  venue?: string;
  ticketQuantity?: number;
  ticketType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleOdometer?: number;
  vehicleBodyType?: string;
  vehicleFuelType?: string;
  vehicleTransmission?: string;
  vehicleColour?: string;
  jobCompany?: string;
  jobEmploymentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  landArea?: number;
  floorArea?: number;
  parking?: number;
  [key: string]: unknown;
}

interface SellerProfile {
  bio?: string;
  photoURL?: string;
  memberSince?: Timestamp;
  verified?: boolean;
  trustedSeller?: boolean;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  kycStatus?: string;
  profileBadge?: string;
  [key: string]: unknown;
}

export default function ListingPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOffer, setShowOffer] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerSending, setOfferSending] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [sellerReportsCount, setSellerReportsCount] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showCheckout, setShowCheckout] = useState(false);
  const [arrangingPurchase, setArrangingPurchase] = useState(false);
  const [winningBid, setWinningBid] = useState<number | null>(null);
  const [showPromote, setShowPromote] = useState(false);
  const [showJobApplication, setShowJobApplication] = useState(false);
  const [buyerPurchases, setBuyerPurchases] = useState<{ status?: string }[]>([]);
  const [sellerReviewData, setSellerReviewData] = useState<{ avg: number; count: number } | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [autoBidEnabled, setAutoBidEnabled] = useState(true);
  const [showBidModal, setShowBidModal] = useState(false);
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [rentalDays, setRentalDays] = useState(0);
  const [sellerListings, setSellerListings] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const prevHighestBidderRef = useRef<string | null>(null);

  function getAuctionEndTime(endsAt: unknown): number {
    if (!endsAt) return 0;
    if (typeof (endsAt as any).toMillis === "function") return (endsAt as any).toMillis();
    if ((endsAt as any).seconds) return (endsAt as any).seconds * 1000;
    if (endsAt instanceof Date) return endsAt.getTime();
    return new Date(endsAt as string | number).getTime();
  }

  const auctionEnded = listing && (listing.saleType === "auction" || listing.saleType === "auction_buy_now")
    ? getAuctionEndTime(listing.auctionEndsAt) < Date.now() : false;
  const isAuctionWinner = auctionEnded && user?.email === listing.highestBidder;

  const isContactListing = (listing as { paymentType?: string })?.paymentType === "contact";

  function openStripeCheckout() {
    if (isContactListing) {
      showToast("This listing uses Arrange Purchase — tap the green Purchase button to message the seller.", "info");
      return;
    }
    setShowCheckout(true);
  }

  async function handleArrangePurchase() {
    if (!user?.email || !listingId || arrangingPurchase) return;
    setArrangingPurchase(true);
    try {
      const token = await getFreshIdToken();
      if (!token) {
        showToast("Please sign in again.", "error");
        return;
      }
      const res = await fetch("/api/arrange-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.error || "Could not start purchase. Try again.", "error");
        return;
      }
      router.push(
        `/messages?user=${encodeURIComponent(listing.sellerUsername || data.sellerEmail || listing.sellerEmail || "")}&listing=${listingId}`
      );
    } catch (e) {
      console.error("Arrange purchase failed:", e);
      showToast("Could not start purchase. Try again.", "error");
    } finally {
      setArrangingPurchase(false);
    }
  }

  // Auto-open checkout if navigated with ?buy=1 (Stripe for regular, Arrange Purchase for contact listings)
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("buy") === "1" && user?.email && listing) {
      if (listing.pricingType === "quote") return;
      if (isAuctionWinner) {
        setWinningBid(listing.currentBid || listing.startingBid || 0);
      }
      if (isContactListing) {
        // For contact listings, trigger arrange purchase instead
        handleArrangePurchase();
        return;
      }
      const t = setTimeout(() => openStripeCheckout(), 0);
      return () => clearTimeout(t);
    }
  }, [user, listing, isAuctionWinner, isContactListing]);

  // Notify winner + seller when auction ends
  const prevAuctionEndedRef = useRef(false);
  useEffect(() => {
    if (!auctionEnded || prevAuctionEndedRef.current || !listing) return;
    prevAuctionEndedRef.current = true;

    const bidAmount = listing.currentBid || listing.startingBid || 0;

    // Notify the winner
    if (listing.highestBidder) {
      createNotification({
        type: "auction_won",
        targetEmail: listing.highestBidder,
        fromEmail: listing.sellerEmail || "",
        title: "You Won the Auction! 🎉",
        message: `Congratulations! You won the auction for "${listing.title}" with a bid of $${bidAmount}.\n\nComplete your purchase within 24 hours to secure the item. Payment will be sent directly to the seller via Stripe.`,
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
        total: bidAmount,
      });
    }

    // Notify the seller
    if (listing.sellerEmail) {
      createNotification({
        type: "purchase",
        targetEmail: listing.sellerEmail,
        fromEmail: listing.highestBidder || "",
        title: "Auction Ended — Winner Found! 🎉",
        message: listing.highestBidder
          ? `Your auction for "${listing.title}" has ended with a winning bid of $${bidAmount} from ${listing.highestBidder}. Coordinate delivery once payment is received.`
          : `Your auction for "${listing.title}" has ended with no bids. You can relist the item.`,
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
        total: bidAmount,
      });
    }
  }, [auctionEnded, listing]);

  useEffect(() => {
    let mounted = true;
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (!mounted) return;
      setUser(currentUser);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const docRef = doc(db, "listings", listingId);
    const unsub = safeOnSnapshot(docRef, (snap) => {
      if (!snap.exists()) { if (mounted) setLoading(false); return; }
      if (!mounted) return;
      const data: any = { id: snap.id, ...snap.data() };
      setListing(data);
      setLoading(false);
    }, (parsed) => { console.error("[ListingPage] onSnapshot:", parsed); if (mounted) setLoading(false); });

    safeGetDoc(docRef).then((snap) => {
      if (!snap?.exists() || !mounted) return;
      const listingData = snap.data();
      const sellerId = listingData.sellerId as string | undefined;
      const sellerEmail = listingData.sellerEmail as string | undefined;

      if (sellerId) {
        getDoc(doc(db, "profiles", sellerId))
          .then((profileSnap) => {
            if (profileSnap.exists() && mounted) {
              setSellerProfile(profileSnap.data() as SellerProfile);
            }
          })
          .catch((e) => console.error("Failed to fetch seller profile:", e));
      } else if (sellerEmail && auth.currentUser) {
        getDocs(query(collection(db, "profiles"), where("email", "==", sellerEmail)))
          .then((profileSnap) => {
            if (!profileSnap.empty && mounted) setSellerProfile(profileSnap.docs[0].data() as SellerProfile);
          })
          .catch((e) => console.error("Failed to fetch seller profile:", e));
      }

      if (!sellerEmail) return;
      getDocs(query(collection(db, "reports"), where("reportedUserEmail", "==", sellerEmail), where("status", "==", "pending"))).then((reportsSnap) => {
        if (mounted) setSellerReportsCount(reportsSnap.size);
      }).catch((e) => console.error("Failed to fetch reports:", e));
    });

    return () => { mounted = false; unsub(); };
  }, [listingId]);

  useEffect(() => {
    if (!user?.email || !listingId) return;
    const q = query(
      collection(db, "purchases"),
      where("listingId", "==", listingId),
      where("buyerEmail", "==", user.email)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBuyerPurchases(snap.docs.map((d) => d.data() as { status?: string }));
      },
      (e) => console.error("Buyer purchases snapshot:", e)
    );
    return () => unsub();
  }, [user?.email, listingId]);

  const buyerPurchasedQuantity = useMemo(
    () => countBuyerPurchasedQuantity(buyerPurchases),
    [buyerPurchases]
  );

  const buyerArrangeRequestCount = useMemo(
    () => countBuyerArrangeRequests(buyerPurchases),
    [buyerPurchases]
  );

  const purchaseUi = useMemo(
    () =>
      getBuyerPurchaseUiState(
        listing,
        buyerPurchasedQuantity,
        buyerArrangeRequestCount
      ),
    [listing, buyerPurchasedQuantity, buyerArrangeRequestCount]
  );

  // Outbid detection
  useEffect(() => {
    if (!user?.email || !listing) return;
    const prev = prevHighestBidderRef.current;
    const current = listing.highestBidder;
    if (prev === user.email && current && current !== user.email) {
      showToast("You've been outbid! 💰", "error");
    }
    prevHighestBidderRef.current = current || null;
  }, [listing?.highestBidder, user?.email]);

  useEffect(() => {
    if (!listing?.sellerEmail) return;
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "reviews"), where("sellerEmail", "==", listing.sellerEmail)));
        const ratings: number[] = [];
        snap.docs.forEach((d) => {
          const r = d.data().rating;
          if (r) ratings.push(Number(r));
        });
        if (mounted && ratings.length > 0) {
          setSellerReviewData({ avg: ratings.reduce((a, b) => a + b, 0) / ratings.length, count: ratings.length });
        }
      } catch (e) { console.error(e); }
    })();
    return () => { mounted = false; };
  }, [listing?.sellerEmail]);

  // Fetch seller's other listings
  useEffect(() => {
    if (!listing?.sellerEmail || !listingId) return;
    let cancelled = false;
    getDocs(query(collection(db, "listings"), where("sellerEmail", "==", listing.sellerEmail))).then((snap) => {
      if (cancelled) return;
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l: any) => l.id !== listingId && isListingVisibleInMarketplace(l));
      setSellerListings(items.slice(0, 5));
    }).catch((e) => console.error("Failed to fetch seller listings:", e));
    return () => { cancelled = true; };
  }, [listing?.sellerEmail, listingId]);

  useEffect(() => {
    if (!listing) return;
    try {
      const recent = JSON.parse(localStorage.getItem("recentlyViewed") || "[]").filter((r: any) => r.id !== listing.id);
      recent.unshift({ id: listing.id, title: listing.title, price: listing.price, images: listing.images, imageUrl: listing.imageUrl || listing.image });
      localStorage.setItem("recentlyViewed", JSON.stringify(recent.slice(0, 8)));
    } catch {}
  }, [listing]);

  // View counter (debounced, once per session per listing)
  const viewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!listingId || viewedRef.current.has(listingId)) return;
    viewedRef.current.add(listingId);
    const timer = setTimeout(() => {
      updateDoc(doc(db, "listings", listingId), { views: increment(1) }).catch((e) => console.error("Failed to increment view count:", e));
    }, 3000);
    return () => clearTimeout(timer);
  }, [listingId]);

  // Fetch Q&A
  useEffect(() => {
    if (!listingId) return;
    const unsub = onSnapshot(
      query(collection(db, "listingQuestions"), where("listingId", "==", listingId)),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a: any, b: any) => ((a.createdAt?.toDate?.() || 0) - (b.createdAt?.toDate?.() || 0)));
        setQuestions(items);
      },
      (err) => console.error("Q&A query error:", err)
    );
    return () => unsub();
  }, [listingId]);

  // OG meta tags
  useEffect(() => {
    if (!listing) return;
    const image = listing.images?.[0] || listing.imageUrl || listing.image || "";
    const desc = (listing.description || "").slice(0, 160);
    const createdElements: Element[] = [];
    const updateMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(name.startsWith("og:") ? "property" : "name", name); document.head.appendChild(el); createdElements.push(el); }
      el.setAttribute("content", content);
    };
    document.title = `${listing.title} — $${listing.price} — Sky Drop NZ`;
    updateMeta("description", desc);
    updateMeta("og:title", `${listing.title} — $${listing.price}`);
    updateMeta("og:description", desc);
    updateMeta("og:site_name", "Sky Drop");
    if (image) {
      updateMeta("og:image", image);
      updateMeta("og:image:width", "1200");
      updateMeta("og:image:height", "630");
    } else {
      updateMeta("og:image", "https://skydrop.nz/og-default.svg");
      updateMeta("og:image:width", "1200");
      updateMeta("og:image:height", "630");
    }
    updateMeta("og:type", "website");
    updateMeta("og:locale", "en_NZ");
    updateMeta("twitter:card", "summary_large_image");
    updateMeta("twitter:title", `${listing.title} — $${listing.price}`);
    updateMeta("twitter:description", desc);
    if (image) updateMeta("twitter:image", image);

    // Canonical URL
    let canonicalEl = document.querySelector("link[rel='canonical']");
    if (!canonicalEl) { canonicalEl = document.createElement("link"); canonicalEl.setAttribute("rel", "canonical"); document.head.appendChild(canonicalEl); }
    canonicalEl.setAttribute("href", window.location.href.split("?")[0]);

    // JSON-LD structured data
    const existingLd = document.querySelector("#sky-drop-ld");
    if (existingLd) existingLd.remove();
    const ld = document.createElement("script");
    ld.id = "sky-drop-ld";
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: listing.title,
      description: (listing.description || "").slice(0, 500),
      image: image || undefined,
      offers: {
        "@type": "Offer",
        price: listing.price ? Number(listing.price) : undefined,
        priceCurrency: "NZD",
        availability: !isListingVisibleInMarketplace(listing) ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        itemCondition: listing.condition === "New" ? "https://schema.org/NewCondition" : listing.condition === "Used - Like New" ? "https://schema.org/LikeNew" : "https://schema.org/UsedCondition",
        url: typeof window !== "undefined" ? window.location.href : "",
      },
    });
    document.head.appendChild(ld);

    return () => {
      createdElements.forEach((el) => el.remove());
      document.querySelector("#sky-drop-ld")?.remove();
    };
  }, [listing]);

  async function saveToWatchlist() {
    const existingWatchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
    const alreadySaved = existingWatchlist.find((item: any) => item.id === listing.id);
    if (alreadySaved) {
      showToast("Already in watchlist", "info");
      return;
    }
    localStorage.setItem("watchlist", JSON.stringify([...existingWatchlist, listing]));
    if (user?.uid) {
      setDoc(doc(db, "users", user.uid, "watchlist", listing.id), {
        id: listing.id, title: listing.title, price: listing.price, imageUrl: listing.imageUrl || listing.image || "",
        savedPrice: listing.price,
        savedAt: new Date().toISOString(),
      }).catch((e) => console.error("Watchlist save failed:", e));
    }
    showToast("Added to watchlist!");
  }

  const sellerStatsData = sellerReviewData;

  const scamResult = useMemo(() => {
    if (!listing) return null;
    const text = `${listing.title} ${listing.description || ""}`;
    return detectScam(text);
  }, [listing]);

  const trustScore = useMemo(() => {
    if (!sellerProfile) return null;
    const memberDate = sellerProfile.memberSince?.toDate ? sellerProfile.memberSince.toDate() : null;
    return calculateTrustScore({
      emailVerified: profileEmailVerified(sellerProfile),
      hasProfile: true,
      hasBio: !!sellerProfile.bio,
      hasPhoto: !!sellerProfile.photoURL,
      memberSince: memberDate,
      reportsCount: sellerReportsCount,
      salesCount: sellerReviewData?.count || 0,
    });
  }, [sellerProfile, sellerReportsCount, sellerReviewData?.count]);

  const isFullyVerified = useMemo(
    () => (sellerProfile ? isFullyVerifiedSeller(sellerProfile) : false),
    [sellerProfile]
  );

  const isNotVerified = useMemo(() => {
    if (!sellerProfile) return false;
    return !isFullyVerifiedSeller(sellerProfile);
  }, [sellerProfile]);

  const isNewSeller = useMemo(() => {
    if (!sellerProfile?.memberSince) return false;
    const memberDate = sellerProfile.memberSince.toDate ? sellerProfile.memberSince.toDate() : new Date();
    const daysOld = (Date.now() - memberDate.getTime()) / 86400000;
    if (daysOld > 7) return false;
    if (sellerProfile.photoURL) return false;
    if ((sellerReviewData?.count || 0) > 0) return false;
    if (isFullyVerifiedSeller(sellerProfile)) return false;
    return true;
  }, [sellerProfile, sellerReviewData?.count]);

  const priceWarning = useMemo(() => {
    if (!listing) return false;
    return detectSuspiciousPrice(Number(listing.price), listing.category);
  }, [listing]);

  const isExpired = listing?.expiresAt?.toMillis?.() < Date.now();

  const submitOffer = async () => {
    if (!offerAmount || offerSending || !user?.email || !listing) return;
    const amount = Number(offerAmount);
    if (!offerAmount || amount <= 0) { showToast("Enter a valid offer amount", "info"); return; }
    setOfferSending(true);
    try {
      const title = listing.title || "Unknown";
      await sendMessage({
        type: "offer",
        text: `Offer: $${offerAmount}`,
        receiver: listing.sellerEmail,
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: listing.images?.[0] || listing.imageUrl || "",
        listingPrice: listing.price,
        offerType: "make",
        offerAmount: Number(offerAmount),
        offerStatus: "pending",
      });
    } catch (e) {
      console.error("Failed to send offer:", e);
      showToast("Failed to send offer", "error");
    }
    setOfferSending(false);
  };

  const resetOffer = () => {
    setShowOffer(false);
    setOfferAmount("");
    setOfferSending(false);
    setOfferSent(false);
  };

  async function submitBid() {
    if (!bidAmount || !user?.email || !listing) return;
    const amount = Number(bidAmount);
    if (amount <= 0) { showToast("Enter a valid bid", "info"); return; }

    const token = await auth.currentUser?.getIdToken(true);
    if (!token) { showToast("Please sign in again", "error"); return; }

    try {
      const res = await fetch("/api/place-bid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listingId: listing.id,
          amount,
          autoBid: autoBidEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to place bid");
      }

      setListing((prev) => prev ? { ...prev, currentBid: data.currentBid } : prev);
      setShowBidModal(false);
      setBidAmount("");
      showToast("Bid placed!", "success");

      try {
        const { createNotification } = await import("../../../lib/notifications");
        await createNotification({
          targetEmail: listing.sellerEmail || "",
          fromEmail: user.email,
          type: "bid",
          title: "New bid on your listing",
          message: `${user.email} bid $${amount} on "${listing.title}"`,
          listingId: listing.id,
          listingTitle: listing.title,
          listingImage: listing.images?.[0] || listing.imageUrl,
          total: Number(amount),
        });
        await createNotification({
          targetEmail: user.email || "",
          fromEmail: listing.sellerEmail || "",
          type: "bid_confirmation",
          title: "Bid Placed",
          message: `Your bid of $${amount} has been placed on "${listing.title}".\n\nWe'll notify you if you're outbid.`,
          listingId: listing.id,
          listingTitle: listing.title,
          listingImage: listing.images?.[0] || listing.imageUrl,
          total: Number(amount),
        });
        if (data.outbidUser && data.outbidUser !== listing.sellerEmail) {
          await createNotification({
            targetEmail: data.outbidUser,
            fromEmail: user.email,
            type: "outbid",
            title: "You've been outbid!",
            message: `You were outbid on "${listing.title}"`,
            listingId: listing.id,
            listingTitle: listing.title,
            listingImage: listing.images?.[0] || listing.imageUrl,
          });
        }
      } catch (_) {}
    } catch (e: any) {
      console.error(e);
      showToast(e.message || "Failed to place bid", "error");
    }
  }

  if (loading) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background />
        <Navbar />
        <section className="relative z-10 mx-auto max-w-5xl px-6 py-8">
          <div className="h-4 w-48 rounded bg-zinc-800 animate-pulse mb-8" />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="aspect-[4/3] rounded-2xl bg-zinc-800/60 animate-pulse" />
            <div className="space-y-4">
              <div className="h-5 w-32 rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-8 w-64 rounded bg-zinc-800 animate-pulse" />
              <div className="h-10 w-28 rounded bg-zinc-800 animate-pulse" />
              <div className="h-20 w-full rounded-lg bg-zinc-800/40 animate-pulse" />
              <div className="h-12 w-full rounded-lg bg-zinc-800/60 animate-pulse" />
              <div className="h-16 w-full rounded-lg bg-zinc-800/40 animate-pulse" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <p className="text-[var(--muted)] mb-4">Listing not found.</p>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
            Browse Marketplace
          </Link>
        </div>
      </main>
    );
  }

  const sellerName = listing.sellerUsername || listing.sellerEmail?.split("@")[0] || "Unknown";
  const sellerInitial = sellerName.charAt(0).toUpperCase();
  async function sendMessageToSeller() {
    if (!user?.email || !listing.sellerEmail || !messageText.trim()) return;
    setSendingMessage(true);
    try {
      await sendMessage({
        text: messageText.trim(),
        receiver: listing.sellerEmail,
        listingId: listingId,
        listingTitle: listing.title || "Listing",
        listingImage: listing.imageUrl || listing.image || null,
        listingPrice: listing.price || null,
      });
      setMessageSent(true);
      setMessageText("");
    } catch (e) {
      console.error(e);
      showToast("Failed to send", "error");
    }
    setSendingMessage(false);
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)] animate-page-enter">
      <Background />
      <Navbar />

      {showOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in-backdrop" onClick={resetOffer}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
            {offerSent ? (
              <div className="py-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/20">
                  <svg className="h-7 w-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-black text-[var(--foreground)]">Offer Sent!</h3>
                <p className="mt-2 text-sm text-[var(--foreground)]">
                  Your offer of <span className="font-bold text-sky-400">${offerAmount}</span> for &ldquo;{listing.title}&rdquo; has been sent to the seller.
                </p>
                <button onClick={resetOffer} className="mt-6 w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-150 hover:bg-zinc-700 active:scale-[0.98]">
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-black text-[var(--foreground)]">Make an Offer</h3>
                <p className="mt-2 text-sm text-[var(--foreground)]">Offer for &ldquo;{listing.title}&rdquo;</p>
                <div className="mt-6">
                  <label className="mb-2 block text-xs font-bold text-[var(--muted)]">Your offer</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[var(--muted)]">$</span>
                    <input
                      type="number"
                      min="1"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                      placeholder={`${Math.floor(Number(listing.price) * 0.8)}`}
                      disabled={offerSending}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-3.5 pl-9 pr-4 text-lg text-[var(--foreground)] outline-none transition-all duration-150 focus:border-sky-500 disabled:opacity-50"
                    />
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">Listed at ${listing.price}</p>
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={resetOffer} disabled={offerSending} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-150 hover:bg-zinc-700 disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    onClick={submitOffer}
                    disabled={!offerAmount || offerSending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-150 hover:bg-sky-400 disabled:opacity-50 active:scale-[0.98]"
                  >
                    {offerSending ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending...
                      </>
                    ) : (
                      "Send Offer"
                    )}
                  </button>
                </div>
              </>
              )}
              <span className="text-[10px] text-[var(--muted)] ml-auto">👁 {(listing as any).views || 0} views</span>
            </div>
        </div>
      )}

      {listing && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          type="listing"
          targetId={listing.id}
          targetUserId={(listing.sellerId || listing.userId || "") as string}
          targetUserEmail={listing.sellerEmail || ""}
          reporterUserId={user?.uid || ""}
          reporterUserEmail={user?.email || ""}
        />
      )}

      {listing && (() => {
        const modalImages = listing.images && listing.images.length > 0 ? listing.images : listing.imageUrl ? [listing.imageUrl] : [];
        if (!showImageModal || modalImages.length === 0) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md" onClick={() => setShowImageModal(false)}>
            <div className="relative max-w-[90vw] max-h-[90vh]">
              <img src={modalImages[selectedImageIndex]} alt={listing.title} className="rounded-xl max-w-full max-h-full object-contain fade-in" />
              <button
                onClick={() => setShowImageModal(false)}
                className="absolute top-2 right-2 text-[var(--foreground)] text-2xl hover:text-sky-400 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })()}

      {!listing ? (
        <div className="flex flex-col items-center justify-center py-24">
          <span className="text-5xl mb-4">🔍</span>
          <p className="text-lg font-bold text-[var(--foreground)]">{loading ? "Loading..." : "Listing not found"}</p>
          {!loading && <Link href="/" className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">Browse Marketplace</Link>}
        </div>
      ) : (<>
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-8">
        {/* BREADCRUMB */}
        <nav className="mb-4 flex items-center gap-2 text-xs text-[var(--muted)]">
          <Link href="/" className="transition-colors hover:text-sky-400">Home</Link>
          <span className="text-zinc-700">/</span>
          <span className="text-[var(--muted)]">{listing.category || "Other"}</span>
          <span className="text-zinc-700">/</span>
          <span className="max-w-[200px] truncate text-[var(--foreground)]">{listing.title}</span>
        </nav>

        {/* Scam Warning Banner */}
        {scamResult?.isScam && (
          <div className="mb-3 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-sky-400 text-sm">⚠️</span>
              <div>
                <p className="text-sm font-bold text-sky-300">Safety Notice</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  This listing may contain suspicious content. Trade safely — avoid paying outside Sky Drop and report suspicious sellers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Price Warning */}
        {priceWarning && (
          <div className="mb-3 rounded-xl border border-sky-500/15 bg-sky-500/5 px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-sky-400/80 text-sm">⚠️</span>
              <div>
                <p className="text-xs font-bold text-sky-300/90">Price unusually low</p>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">Trade carefully and verify the item before purchasing.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── LEFT COLUMN: IMAGE ── */}
          {(() => {
            const displayImages = listing.images && listing.images.length > 0 ? listing.images : listing.imageUrl ? [listing.imageUrl] : [];
            return (
              <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 border border-white/[0.08] shadow-2xl shadow-black/30">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
                {displayImages.length > 0 ? (
                  <div className="relative"
                    onTouchStart={(e) => { (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX); }}
                    onTouchEnd={(e) => {
                      const startX = Number((e.currentTarget as HTMLElement).dataset.touchX || 0);
                      const endX = e.changedTouches[0].clientX;
                      const diff = startX - endX;
                      if (Math.abs(diff) > 50) {
                        if (diff > 0 && selectedImageIndex < displayImages.length - 1) setSelectedImageIndex(selectedImageIndex + 1);
                        if (diff < 0 && selectedImageIndex > 0) setSelectedImageIndex(selectedImageIndex - 1);
                      }
                    }}
                  >
                    <img
                      src={displayImages[selectedImageIndex]}
                      alt={listing.title}
                      className="w-full max-h-[520px] object-cover fade-in cursor-pointer"
                      onClick={() => setShowImageModal(true)}
                    />
                    {displayImages.length > 1 && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {displayImages.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={(e) => { e.stopPropagation(); setSelectedImageIndex(idx); }}
                            className={`h-3 rounded-full transition-all duration-150 ${
                              idx === selectedImageIndex ? "w-5 bg-sky-400" : "w-3 bg-white/50 hover:bg-white/80"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center bg-zinc-700/30 text-[var(--muted)] text-sm">No image</div>
                )}
                {listing.description && (
                  <div className="border-t border-zinc-700/50 px-5 py-4">
                    <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Description</h2>
                    <div className="text-sm leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
                      {listing.description}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── RIGHT COLUMN: PURCHASE CARD ── */}
          <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 shadow-2xl shadow-black/20">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
            {/* 1. PILLS: Category / Condition / Time */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold text-sky-400">{listing.category || "Other"}</span>
              {listing.condition && (
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${listing.condition === "New" ? "border-sky-500/20 bg-sky-500/10 text-sky-400" : "border-white/[0.08] bg-zinc-800 text-[var(--foreground)]"}`}>
                  {listing.condition}
                </span>
              )}
              {listing.createdAt?.seconds != null && (
                <span className="rounded-full border border-white/[0.08] bg-zinc-800 px-2.5 py-0.5 text-[10px] text-[var(--muted)]">{timeAgo(listing.createdAt.seconds)}</span>
              )}
              {listing.location && (
                <span className="rounded-full border border-white/[0.08] bg-zinc-800 px-2.5 py-0.5 text-[10px] text-[var(--muted)]">{listing.location}</span>
              )}
            </div>

            {/* 2. TITLE */}
            <h1 className="text-xl font-black tracking-tight text-[var(--foreground)]">{listing.title}</h1>

            {/* 3. PRICE */}
            <div className="flex flex-wrap items-baseline gap-2">
              {listing.type === "service" && <ServicePricingBadge listing={listing} />}
              <span className="text-3xl font-black text-[var(--foreground)]">
                {listing.type === "service"
                  ? formatServicePriceDisplay(listing)
                  : listing.pricingType === "quote"
                    ? "Contact Seller for Quote"
                    : listing.price
                      ? `$${listing.price}`
                      : "Price on request"}
              </span>
              {!isListingVisibleInMarketplace(listing) && (
                <span className="rounded bg-red-600/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--foreground)]">Sold</span>
              )}
              {isListingVisibleInMarketplace(listing) && listing.expiresAt?.toMillis?.() < Date.now() && (
                <span className="rounded bg-zinc-700/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Expired</span>
              )}
              {(listing as any).promotedUntil?.toMillis?.() > Date.now() && (
                <span className="rounded bg-sky-500/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">📈 Promoted</span>
              )}
            </div>

            {purchaseUi.showPurchasedBanner && purchaseUi.bannerText && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-1.5">
                <span className="text-sky-400 text-[11px]">✓ {purchaseUi.bannerText}</span>
              </div>
            )}

            {(listing.saleType === "auction" || listing.saleType === "auction_buy_now") && (
              <div className="mt-3 space-y-1.5 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">Current Bid</span>
                  <span className="font-black text-lg text-sky-400">${listing.currentBid || listing.startingBid || 0}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
                  <span>{listing.bidCount || 0} bids</span>
                  {listing.reservePrice && (
                    <span className={listing.currentBid >= listing.reservePrice ? "text-sky-400" : "text-sky-400"}>
                      Reserve {listing.currentBid >= listing.reservePrice ? "met ✅" : "not met"}
                    </span>
                  )}
                </div>
                {auctionEnded ? (
                  <>
                    {user?.email === listing.highestBidder ? (
                      <div className="text-[10px] text-sky-400 font-bold">🎉 You won this auction!</div>
                    ) : user?.email !== listing.sellerEmail ? (
                      <div className="text-[10px] text-red-400">Auction ended — you didn't win</div>
                    ) : (
                      <div className="text-[10px] text-sky-400">Auction ended — winner: {listing.highestBidder || "unknown"}</div>
                    )}
                    <div className="text-[10px] text-[var(--muted)]">Auction ended</div>
                  </>
                ) : (
                  <>
                    {user?.email === listing.highestBidder && (
                      <div className="text-[10px] text-sky-400">✓ You're winning</div>
                    )}
                    {user && listing.bidCount > 0 && user.email !== listing.highestBidder && user.email !== listing.sellerEmail && (
                      <div className="text-[10px] text-sky-400">You've been outbid</div>
                    )}
                    {listing.auctionEndsAt && (
                      <div className="text-[10px] text-[var(--muted)]">
                        {(() => {
                          const end = listing.auctionEndsAt?.seconds ? new Date(listing.auctionEndsAt.seconds * 1000).getTime() : 0;
                          const diff = Math.max(0, end - Date.now());
                          const h = Math.floor(diff / 3600000);
                          const m = Math.floor((diff % 3600000) / 60000);
                          const s = Math.floor((diff % 60000) / 1000);
                          if (h > 0) return `Ends in ${h}h ${m}m`;
                          return `Ends in ${m}m ${s}s`;
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 4. DELIVERY + AVAILABILITY */}
            {listing.type === "digital" ? (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-sky-400">📥</span>
                  <span>{listing.pricingType === "quote" ? "Service delivered remotely — Request a Quote" : (listing as { paymentType?: string }).paymentType === "contact" ? "Digital product — arrange payment & delivery in Messages" : "Digital Download — Instant Delivery"}</span>
                </div>
                {listing.pricingType === "quote" && (
                  <span className="mt-1.5 inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">Quote Required</span>
                )}
              </div>
            ) : listing.type === "service" ? (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-sky-400">🤝</span>
                  <span>Service — Discuss scope in messages</span>
                </div>
                {listing.serviceDuration && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>⏱ Estimated delivery: {listing.serviceDuration}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span>💰 {formatServicePriceDisplay(listing)}</span>
                </div>
              </div>
            ) : listing.type === "rental" ? (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-sky-400">🔑</span>
                  <span>Rental — Pickup from {listing.location || "seller's location"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-sky-400 font-bold">
                  <span>${(Number(listing.price) || 0).toFixed(2)}/day{listing.rentalPriceWeekly ? ` · $${Number(listing.rentalPriceWeekly).toFixed(2)}/wk` : ""}{listing.rentalPriceMonthly ? ` · $${Number(listing.rentalPriceMonthly).toFixed(2)}/mo` : ""}</span>
                </div>
                {listing.rentalDeposit && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="text-sky-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]">🔒 $${(Number(listing.rentalDeposit) || 0).toFixed(2)} refundable deposit</span>
                  </div>
                )}
                {listing.condition && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>Condition: {listing.condition}</span>
                  </div>
                )}
                {listing.stockQuantity != null && listing.stockQuantity > 0 && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>📦 {listing.stockQuantity} Available</span>
                  </div>
                )}
              </div>
            ) : listing.type === "event" ? (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-sky-400">🎟</span>
                  <span>Event Tickets — {listing.ticketType || "General Admission"}</span>
                </div>
                {listing.eventDate && (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                    <span>📅 {new Date(listing.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                    {listing.eventTime && <span>⏰ {listing.eventTime}</span>}
                  </div>
                )}
                {listing.venue && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>📍 {listing.venue}</span>
                  </div>
                )}
                {listing.ticketQuantity !== undefined && listing.ticketQuantity !== null && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>🎫 {listing.ticketQuantity} ticket{listing.ticketQuantity !== 1 ? "s" : ""} available</span>
                  </div>
                )}
              </div>
            ) : listing.type === "property" ? (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-sky-400">🏠</span>
                  <span>Property — {listing.propertyType || "House"}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
                  {listing.bedrooms && <span>🛏 {listing.bedrooms} bed</span>}
                  {listing.bathrooms && <span>🚿 {listing.bathrooms} bath</span>}
                  {listing.landArea && <span>📐 {listing.landArea}m² land</span>}
                  {listing.floorArea && <span>🏠 {listing.floorArea}m² floor</span>}
                  {listing.parking && <span>🚗 {listing.parking} park</span>}
                </div>
                {listing.condition && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>Condition: {listing.condition}</span>
                  </div>
                )}
                {listing.location && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>📍 {listing.location}</span>
                  </div>
                )}
              </div>
            ) : listing.type === "vehicle" ? (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-blue-400">🚗</span>
                  <span>Vehicle</span>
                </div>
                {listing.vehicleMake && listing.vehicleModel && (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)] font-bold">
                    <span>{listing.vehicleMake} {listing.vehicleModel}</span>
                    {listing.vehicleYear && <span className="text-[var(--muted)] font-normal">· {listing.vehicleYear}</span>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
                  {listing.vehicleOdometer && <span>📏 {Number(listing.vehicleOdometer).toLocaleString()} km</span>}
                  {listing.vehicleFuelType && <span>⛽ {listing.vehicleFuelType}</span>}
                  {listing.vehicleTransmission && <span>⚙ {listing.vehicleTransmission}</span>}
                  {listing.vehicleBodyType && <span>🚘 {listing.vehicleBodyType}</span>}
                  {listing.vehicleColour && <span>🎨 {listing.vehicleColour}</span>}
                </div>
                {listing.condition && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>Condition: {listing.condition}</span>
                  </div>
                )}
              </div>
            ) : listing.type === "job" ? (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-sky-400">💼</span>
                  <span>Job — {listing.jobEmploymentType || "Full-time"}</span>
                </div>
                {listing.jobCompany && (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)] font-bold">
                    <span>🏢 {listing.jobCompany}</span>
                  </div>
                )}
                <div className="text-xs text-[var(--muted)]">
                  {listing.salaryMin && listing.salaryMax
                    ? <span>💰 ${Number(listing.salaryMin).toLocaleString()} - ${Number(listing.salaryMax).toLocaleString()}</span>
                    : listing.salaryMin
                    ? <span>💰 From ${Number(listing.salaryMin).toLocaleString()}</span>
                    : listing.salaryMax
                    ? <span>💰 Up to ${Number(listing.salaryMax).toLocaleString()}</span>
                    : <span>💰 ${listing.price}</span>
                  }
                </div>
                {listing.location && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>📍 {listing.location}</span>
                  </div>
                )}
              </div>
            ) : listing.type !== "property" && (listing.pickupAvailable || listing.shippingAvailable || listing.stockQuantity !== undefined) && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-1.5">
                {listing.pickupAvailable && (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                    <span className="shrink-0 text-sky-400">📍</span>
                    <span>Pickup Available{listing.pickupArea ? ` — ${listing.pickupArea}` : ""}</span>
                  </div>
                )}
                {listing.shippingAvailable && (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                    <span className="shrink-0 text-sky-400">
                      {listing.freeShipping || listing.shippingFee === 0 ? "🚚" : "📦"}
                    </span>
                    <span>
                      {listing.freeShipping || listing.shippingFee === 0
                        ? "Free Shipping"
                        : listing.shippingFee
                          ? `Shipping: $${listing.shippingFee}`
                          : "Shipping Available"}
                    </span>
                    {listing.shipsWithinDays && (
                      <span className="text-[var(--muted)]">· Ships within {listing.shipsWithinDays} day{listing.shipsWithinDays > 1 ? "s" : ""}</span>
                    )}
                  </div>
                )}
                {listing.stockQuantity != null && listing.stockQuantity > 0 && (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                    <span className="shrink-0 text-sky-400">📦</span>
                    <span>{listing.stockQuantity} Available</span>
                  </div>
                )}
              </div>
            )}

            {/* Property inquiry buttons */}
            {listing.type === "property" && (
            <div className="flex gap-2">
              {user && user.email !== listing.sellerEmail ? (
                <>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const buyerMsg = `🏡 Property inquiry started for "${listing.title}"

You're now connected with the property owner/agent.

Use this chat to discuss:
• viewing/open home times
• price
• property details
• settlement questions
• inspection details
• next steps

Please keep all communication inside Sky Drop for protection.

Property Status: 🟢 Inquiry Active`;

                        const result = await sendMessage({
                          type: "system",
                          text: buyerMsg,
                          receiver: listing.sellerEmail,
                          listingId,
                          listingTitle: listing.title,
                          listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
                          listingPrice: listing.price,
                          createConversation: true,
                          convKey: `listing_${listingId}`,
                          buyerEmail: user!.email!,
                          sellerEmail: listing.sellerEmail,
                        });

                        await sendMessage({
                          type: "text",
                          text: `🟢 A user is interested in your property listing.\n\nUse this chat to discuss:\n• viewing arrangements\n• price/negotiation\n• property details\n• settlement or tenancy\n\nKeep all communication inside Sky Drop for protection.`,
                          receiver: listing.sellerEmail,
                          listingId,
                          listingTitle: listing.title,
                          conversationId: result.conversationId,
                        });
                      } catch (e) {
                        console.error("Property inquiry failed:", e);
                      }
                      router.push(`/messages?user=${encodeURIComponent(listing.sellerUsername || listing.sellerEmail || "")}&listing=${listingId}`);
                    }}
                    style={{
                      width: "100%",
                      minHeight: "44px",
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.98] whitespace-nowrap"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Contact Owner
                  </button>
                  {listing.acceptOffers && (
                    <button onClick={() => setShowOffer(true)}
                      style={{
                        width: "100%",
                        minHeight: "44px",
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl border-2 border-zinc-700 bg-zinc-900/60 px-5 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800/60 whitespace-nowrap"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                      Make Offer
                    </button>
                  )}
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-gradient-to-r from-sky-500 to-sky-500 py-3 text-center text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                    ✏️ Edit Listing
                  </Link>
                  <button onClick={() => setShowPromote(true)}
                    className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-3 text-[13px] font-bold text-sky-400 transition hover:bg-sky-500/15">
                    📈 Promote
                  </button>
                </div>
              ) : (
                <button onClick={() => router.push("/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search))} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
                  Sign in
                </button>
              )}
            </div>
            )}

            {/* 5. QUOTE REQUIRED — digital services */}
            {listing.type === "digital" && listing.pricingType === "quote" && isListingVisibleInMarketplace(listing) && !isExpired && (
            <div className="flex gap-2">
              {user && user.email !== listing.sellerEmail ? (
                <>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await sendMessage({
                        type: "text",
                        text: `Hi, I'm interested in "${listing.title}" — could you please provide a quote?`,
                        receiver: listing.sellerEmail,
                        listingId,
                        listingTitle: listing.title,
                        listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
                        listingPrice: listing.price,
                        createConversation: true,
                        convKey: `listing_${listingId}`,
                        buyerEmail: user!.email!,
                        sellerEmail: listing.sellerEmail,
                      });
                      router.push(`/messages?user=${encodeURIComponent(listing.sellerUsername || listing.sellerEmail || "")}&listing=${listingId}`);
                    }}
                    style={{
                      width: "100%",
                      minHeight: "44px",
                    }}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-3.5 text-sm font-bold text-white shadow-2xl shadow-sky-500/30 transition-all duration-200 hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 whitespace-nowrap"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Request Quote
                  </button>
                  <button
                    onClick={() => router.push(`/messages?user=${encodeURIComponent(listing.sellerUsername || listing.sellerEmail || "")}&listing=${listingId}`)}
                    style={{
                      width: "100%",
                      minHeight: "44px",
                    }}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:border-sky-500/30 hover:bg-white/[0.06] hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Message Seller
                  </button>
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 py-3.5 text-center text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.97]">✏️ Edit Listing</Link>
                  <button onClick={() => setShowPromote(true)} className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3.5 text-[13px] font-bold text-sky-400 transition hover:bg-sky-500/20 hover:border-sky-500/50">📈 Promote</button>
                </div>
              ) : (
                <button onClick={() => router.push("/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search))} className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-[13px] font-bold text-[var(--foreground)] transition hover:border-sky-500/30 hover:bg-white/[0.06] hover:-translate-y-0.5 active:translate-y-0">Sign in to continue</button>
              )}
            </div>
            )}

            {/* 5. BUY BUTTONS */}
            {isListingAvailableForPurchase(listing) && !isExpired && listing.type !== "service" && listing.type !== "job" && listing.type !== "property" && listing.type !== "rental" && !(listing.type === "digital" && listing.pricingType === "quote") && (purchaseUi.canPurchaseMore || (isContactListing && buyerArrangeRequestCount > 0)) && (
            <div className="flex gap-2">
              {user && user.email !== listing.sellerEmail ? (
                <>
                  {(listing as any).paymentType === "contact" ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArrangePurchase();
                        }}
                        disabled={arrangingPurchase}
                        style={{
                          width: "100%",
                          minHeight: "44px",
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {arrangingPurchase ? (
                          "Connecting…"
                        ) : buyerArrangeRequestCount > 0 ? (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            Open Chat
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Request Purchase — ${listing.price}
                          </>
                        )}
                      </button>
                      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Arrange Purchase is handled directly between buyer and seller. Keep communication on Sky Drop so we can review evidence if something goes wrong.</p>
                    </>
                  ) : isAuctionWinner ? (
                    <>
                      <button
                        onClick={() => { setWinningBid(listing.currentBid || listing.startingBid || 0); openStripeCheckout(); }}
                        style={{
                          width: "100%",
                          minHeight: "44px",
                        }}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-3.5 text-sm font-bold text-white shadow-2xl shadow-sky-500/30 transition-all duration-200 hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 whitespace-nowrap"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        Pay Now — ${listing.currentBid || listing.startingBid || 0}
                      </button>
                      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Secure payment through Stripe with buyer protection. Funds held in escrow until you confirm receipt.</p>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openStripeCheckout()}
                        style={{
                          width: "100%",
                          minHeight: "44px",
                        }}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-3.5 text-sm font-bold text-white shadow-2xl shadow-sky-500/30 transition-all duration-200 hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 whitespace-nowrap"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Buy Now — ${listing.price}
                      </button>
                      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Secure payment through Stripe with buyer protection. Funds held in escrow until you confirm receipt.</p>
                    </>
                  )}
                  {!auctionEnded && (listing.saleType === "auction" || listing.saleType === "auction_buy_now") && user && user.email !== listing.sellerEmail && (
                    <button onClick={() => { setShowBidModal(true); setBidAmount(String(getMinimumNextBid(listing.currentBid || listing.startingBid || 0))); }}
                      style={{
                        width: "100%",
                        minHeight: "44px",
                      }}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 text-sm font-bold text-sky-400 transition-all duration-200 hover:bg-sky-500/20 hover:border-sky-500/50 hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Bid Now
                    </button>
                  )}
                  {(listing as any).paymentType !== "contact" && listing.acceptOffers && (
                    <button
                      onClick={() => setShowOffer(true)}
                      style={{
                        width: "100%",
                        minHeight: "44px",
                      }}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:border-sky-500/30 hover:bg-white/[0.06] hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                      Make Offer
                    </button>
                  )}
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 py-3.5 text-center text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.97]">
                    ✏️ Edit Listing
                  </Link>
                  <button onClick={() => setShowPromote(true)}
                    className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3.5 text-[13px] font-bold text-sky-400 transition hover:bg-sky-500/20 hover:border-sky-500/50">
                    📈 Promote
                  </button>
                </div>
              ) : (
                <button onClick={() => router.push("/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search))} className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-[13px] font-bold text-[var(--foreground)] transition hover:border-sky-500/30 hover:bg-white/[0.06] hover:-translate-y-0.5 active:translate-y-0">
                  Sign in to continue
                </button>
              )}
            </div>
            )}

            {/* Job buttons */}
            {listing.type === "job" && (
            <div className="flex gap-2">
              {user && user.email !== listing.sellerEmail ? (
                <>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const buyerMsg = `💼 Job inquiry started for "${listing.title}"

You're now connected with the employer.

Use this chat to discuss:
• experience
• availability
• skills
• pay/rates
• interview details
• work schedule

Please keep all communication inside Sky Drop for protection.

Application Status: 🟢 Active`;

                        const result = await sendMessage({
                          type: "system",
                          text: buyerMsg,
                          receiver: listing.sellerEmail,
                          listingId,
                          listingTitle: listing.title,
                          listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
                          listingPrice: listing.price,
                          createConversation: true,
                          convKey: `listing_${listingId}`,
                          buyerEmail: user!.email!,
                          sellerEmail: listing.sellerEmail,
                        });

                        await sendMessage({
                          type: "text",
                          text: `🟢 A user is interested in your job listing.\n\nUse this chat to discuss:\n• experience/skills\n• availability\n• interview arrangements\n• pay/rates\n• job expectations\n\nKeep all communication inside Sky Drop for protection.`,
                          receiver: listing.sellerEmail,
                          listingId,
                          listingTitle: listing.title,
                          conversationId: result.conversationId,
                        });
                      } catch (e) {
                        console.error("Job inquiry failed:", e);
                      }
                      try { localStorage.setItem("skyJobPrefill", `Hi, I'm interested in this job 👋`); } catch {}
                      router.push(`/messages?user=${encodeURIComponent(listing.sellerUsername || listing.sellerEmail || "")}&listing=${listingId}`);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-sky-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:shadow-sky-500/30"
                  >
                    Apply Now
                  </button>
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-sky-500 py-3 text-center text-[13px] font-bold text-white transition hover:bg-sky-400">
                    Edit Listing
                  </Link>
                </div>
              ) : (
                <button onClick={() => router.push("/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search))} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
                  Sign in to Apply
                </button>
              )}
            </div>
            )}

            {/* Service buttons */}
            {listing.type === "service" && (
            <div className="flex gap-2">
              {user && user.email !== listing.sellerEmail ? (
                <>
                  <button
                    onClick={async () => {
                      try {
                        const buyerMsg = `🛠️ Service inquiry started for "${listing.title}"

You're now connected with the service provider.

Use this chat to discuss:
• project scope
• pricing
• delivery timeframe
• revisions
• requirements/files
• payment details

Please keep all communication and payments inside Sky Drop for protection.

Service Status: 🟢 Inquiry Active`;

                        const result = await sendMessage({
                          type: "system",
                          text: buyerMsg,
                          receiver: listing.sellerEmail,
                          listingId,
                          listingTitle: listing.title,
                          listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
                          listingPrice: listing.price,
                          createConversation: true,
                          convKey: `listing_${listingId}`,
                          buyerEmail: user!.email!,
                          sellerEmail: listing.sellerEmail,
                        });

                        await sendMessage({
                          type: "text",
                          text: `🟢 A user is interested in hiring your service.\n\nUse this chat to discuss:\n• project requirements\n• pricing\n• deadlines\n• revisions\n• delivery expectations\n\nKeep all communication inside Sky Drop for protection.`,
                          receiver: listing.sellerEmail,
                          listingId,
                          listingTitle: listing.title,
                          conversationId: result.conversationId,
                        });
                      } catch (e) {
                        console.error("Service inquiry failed:", e);
                      }
                      router.push(`/messages?user=${encodeURIComponent(listing.sellerUsername || listing.sellerEmail || "")}&listing=${listingId}`)
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-fuchsia-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:shadow-sky-500/30"
                  >
                    Message Seller
                  </button>
                  {listing.acceptOffers && (
                    <button onClick={() => setShowOffer(true)}
                      className="rounded-lg border border-zinc-700 px-4 py-3 text-[12px] font-medium text-[var(--foreground)] transition hover:border-zinc-600">
                      Make Offer
                    </button>
                  )}
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-gradient-to-r from-sky-500 to-fuchsia-500 py-3 text-center text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                    ✏️ Edit Listing
                  </Link>
                </div>
              ) : (
                <button onClick={() => router.push("/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search))} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
                  Sign in
                </button>
              )}
            </div>
            )}

            {/* Rental buttons */}
            {listing.type === "rental" && (
            <div>
              <div className="flex gap-2">
                {user && user.email !== listing.sellerEmail ? (
                  <>
                    <div className="flex-1 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Pickup date</label>
                          <input type="date" value={pickupDate} onChange={(e) => {
                            setPickupDate(e.target.value);
                            if (returnDate && e.target.value > returnDate) setReturnDate("");
                            if (returnDate && e.target.value <= returnDate) {
                              const diff = Math.ceil((new Date(returnDate).getTime() - new Date(e.target.value).getTime()) / 86400000);
                              setRentalDays(diff);
                            }
                          }}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-[var(--muted)]">Return date</label>
                          <input type="date" value={returnDate} onChange={(e) => {
                            setReturnDate(e.target.value);
                            if (pickupDate && e.target.value > pickupDate) {
                              const diff = Math.ceil((new Date(e.target.value).getTime() - new Date(pickupDate).getTime()) / 86400000);
                              setRentalDays(diff);
                            }
                          }} min={pickupDate || undefined}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                        </div>
                      </div>
                      {rentalDays > 0 && (
                        <div className="rounded-lg bg-zinc-800/40 px-3 py-2 text-xs">
                          <div className="space-y-1">
                            <p className="font-medium text-sky-400 text-[11px]">
                              ${(Number(listing.price) || 0).toFixed(2)}/day
                              {listing.rentalPriceWeekly ? ` · $${Number(listing.rentalPriceWeekly).toFixed(2)}/wk` : ""}
                              {listing.rentalPriceMonthly ? ` · $${Number(listing.rentalPriceMonthly).toFixed(2)}/mo` : ""}
                            </p>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[var(--muted)]">
                            <span>${Number(listing.price)}/day × {rentalDays} day{rentalDays > 1 ? "s" : ""}</span>
                            <span className="text-white font-bold">${(Number(listing.price) * rentalDays).toFixed(2)}</span>
                          </div>
                          {listing.rentalDeposit && (
                            <div className="mt-0.5 flex items-center justify-between text-[var(--muted)]">
                              <span className="text-sky-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]">🔒 Refundable Deposit</span>
                              <span>$${(Number(listing.rentalDeposit) || 0).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="mt-0.5 flex items-center justify-between text-[var(--muted)]">
                            <span>Buyer Protection</span>
                            <span>$1.00</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between border-t border-zinc-700 pt-1 text-sm font-bold text-white">
                            <span>Total</span>
                            <span>${(Number(listing.price) * rentalDays + 1).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      <button onClick={() => {
                        if (rentalDays < 1) { showToast("Select pickup and return dates", "info"); return; }
                        openStripeCheckout();
                      }}
                        className="w-full rounded-lg bg-gradient-to-r from-sky-500 to-sky-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:shadow-sky-500/30">
                        Rent Now {rentalDays > 0 ? `— $${(Number(listing.price) * rentalDays + 1).toFixed(2)}` : ""}
                      </button>
                    </div>
                    <Link
                      href={`/messages?user=${encodeURIComponent(listing.sellerUsername || listing.sellerEmail || "")}&listing=${listingId}`}
                      className="flex items-center justify-center rounded-lg border border-zinc-700 px-4 py-3 text-[12px] font-medium text-[var(--foreground)] transition hover:border-zinc-600 self-stretch">
                      Message
                    </Link>
                  </>
                ) : user?.email === listing.sellerEmail ? (
                  <div className="flex gap-2 w-full">
                    <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-sky-500 py-3 text-center text-[13px] font-bold text-white transition hover:bg-sky-400">
                      Edit Listing
                    </Link>
                  </div>
                ) : (
                  <button onClick={() => router.push("/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search))} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
                    Sign in
                  </button>
                )}
              </div>
            </div>
            )}

            {/* Payment & Contact Info */}
            {user && user.email !== listing.sellerEmail && listing.pricingType !== "quote" && (
              (listing as any).paymentType === "contact" ? (
                <a href="/escrow#arrange" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-sky-500/10 bg-sky-500/[0.03] px-3.5 py-2.5 block transition hover:bg-sky-500/[0.06]">
                  <p className="text-xs font-bold text-sky-400">🤝 Arrange Purchase — ${(listing as any).price}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">Tap Purchase to chat and agree payment with the seller. Keep communication on Sky Drop so we can review evidence if something goes wrong. <span className="text-sky-400/70 underline">How it works →</span></p>
                </a>
              ) : (
                <a href="/escrow#stripe" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-sky-500/10 bg-sky-500/[0.03] px-3.5 py-2.5 block transition hover:bg-sky-500/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-400 shrink-0" fill="currentColor">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.866 6.001 1.632V2.94c-1.608-.732-3.965-1.413-6.076-1.413-3.659 0-6.328 1.803-6.328 4.866 0 3.354 2.547 4.545 5.644 5.604 2.162.795 3.251 1.499 3.251 2.476 0 .968-.747 1.49-2.153 1.49-2.49 0-5.206-1.156-6.748-2.041v4.133c1.682.827 4.127 1.435 6.824 1.435 3.943 0 6.827-1.835 6.827-5.017.001-3.452-2.587-4.596-5.617-5.608z"/>
                    </svg>
                    <span className="text-xs font-bold text-sky-400">Stripe Secure Checkout</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-zinc-500">Your payment is processed by Stripe. <span className="text-sky-400/70 underline">How it works →</span></p>
                </a>
              )
            )}

            {/* Unverified Seller Notice */}
            {isNotVerified && user && user.email !== listing.sellerEmail && (
              <p className="text-[11px] text-red-400/60">
                Trade carefully — this seller is not verified.
              </p>
            )}

            {/* ── SEPARATOR ── */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

            {/* 7. SELLER CARD */}
            <div>
              <Link
                href={user?.email === listing.sellerEmail ? "#" : `/seller/${listing.sellerUsername || listing.sellerEmail}`}
                className="block"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-[var(--foreground)]">
                    {sellerInitial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-[var(--foreground)]">
                        {user?.email === listing.sellerEmail ? "You" : sellerName}
                      </span>
                      {isFullyVerified && (
                        <span className="shrink-0 text-[10px] text-sky-400">Verified</span>
                      )}
                      {sellerProfile?.trustedSeller && (
                        <span className="shrink-0 text-[10px] text-sky-400">Trusted</span>
                      )}
                      {isNewSeller && (
                        <span className="shrink-0 text-[10px] text-sky-400">New</span>
                      )}
                      {sellerProfile?.profileBadge === "epic" && (
                        <span className="shrink-0 text-[10px] text-sky-400 font-bold">💎 Epic</span>
                      )}
                      {sellerProfile?.profileBadge === "legendary" && (
                        <span className="shrink-0 text-[10px] text-sky-400 font-bold animate-pulse">👑 The Five</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                      <ReviewStars rating={sellerStatsData?.avg || 0} />
                      <span className="text-white">{(sellerStatsData?.avg || 0).toFixed(1)}</span>
                      <span className="text-zinc-500">{sellerStatsData?.count || 0} sale{(sellerStatsData?.count || 0) !== 1 ? "s" : ""}</span>
                      {sellerProfile?.memberSince && (
                        <span>· {(sellerProfile.memberSince as any).seconds ? new Date((sellerProfile.memberSince as any).seconds * 1000).getFullYear() : ""}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>

              {/* Report Button */}
              {user && user.email !== listing.sellerEmail && (
                <button
                  onClick={() => setShowReportModal(true)}
                  className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--muted)] transition hover:text-sky-400"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                  Report listing
                </button>
              )}

              {/* 8. Message Seller */}
              {user && user.email !== listing.sellerEmail && (
                <div id="contact" className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[var(--foreground)]">Message Seller</span>
                  </div>
                  {messageSent ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-sky-400">✓ Message sent!</span>
                      <button onClick={() => setMessageSent(false)} className="ml-auto text-[10px] text-[var(--muted)] underline hover:text-[var(--foreground)]">Send another</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        placeholder={`Ask about this listing...`}
                        className="flex-1 rounded-lg border border-zinc-700/40 bg-zinc-800/50 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500/40 placeholder:text-[var(--muted)]"
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessageToSeller(); } }}
                      />
                      <button
                        onClick={sendMessageToSeller}
                        disabled={!messageText.trim() || sendingMessage}
                        className="shrink-0 rounded-lg bg-sky-500 px-3 py-2.5 text-xs font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50"
                      >
                        {sendingMessage ? "..." : "Send"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 8. Q&A */}
            <div className="border-t border-zinc-800 pt-4 pb-2">
              <h3 className="mb-3 text-xs font-bold text-[var(--foreground)]">Questions & Answers</h3>

              {questions.length === 0 && (
                <p className="mb-3 text-[11px] text-[var(--muted)]">No questions yet. Be the first to ask.</p>
              )}

              <div className="space-y-3 mb-3">
                {questions.map((q: any) => (
                  <div key={q.id} className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-xs mt-0.5">❓</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--foreground)]">{q.question}</p>
                        <p className="mt-0.5 text-[9px] text-[var(--muted)]">{q.askerName || q.askerEmail?.split("@")[0]} · {q.createdAt?.toDate?.() ? new Date(q.createdAt.toDate()).toLocaleDateString() : ""}</p>
                      </div>
                    </div>

                    {q.answer ? (
                      <div className="mt-2 ml-6 flex items-start gap-2 border-l-2 border-sky-500/30 pl-3">
                        <span className="text-xs mt-0.5">💬</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-sky-300">{q.answer}</p>
                          <p className="mt-0.5 text-[9px] text-[var(--muted)]">Seller · {q.answeredAt?.toDate?.() ? new Date(q.answeredAt.toDate()).toLocaleDateString() : ""}</p>
                        </div>
                      </div>
                    ) : user?.email === listing.sellerEmail ? (
                      <div className="mt-2 ml-6">
                        {answeringId === q.id ? (
                          <div className="flex gap-2">
                            <input type="text" value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                              placeholder="Type your answer..." maxLength={500}
                              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-[11px] text-[var(--foreground)] outline-none transition focus:border-sky-500" />
                            <button onClick={async () => {
                              if (!answerText.trim()) return;
                              try {
                                const token = await user?.getIdToken();
                                if (!token) return;
                                const res = await fetch("/api/listing-question", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ action: "answer", questionId: q.id, answer: answerText.trim() }),
                                });
                                if (!res.ok) throw new Error("Failed");
                                setAnswerText(""); setAnsweringId(null);
                              } catch {}
                            }} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-sky-400">Answer</button>
                            <button onClick={() => { setAnsweringId(null); setAnswerText(""); }} className="text-[10px] text-[var(--muted)] hover:text-white px-1">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setAnsweringId(q.id); setAnswerText(""); }}
                            className="rounded-lg border border-sky-500/30 px-3 py-1.5 text-[10px] font-bold text-sky-400 transition hover:bg-sky-500/10">
                            Answer
                          </button>
                        )}
                      </div>
                    ) : null}

                    {!q.answer && user?.email !== listing.sellerEmail && (
                      <p className="mt-1 ml-6 text-[9px] text-sky-500">Awaiting seller response</p>
                    )}
                  </div>
                ))}
              </div>

              {user && user.email !== listing.sellerEmail && (
                <div className="flex gap-2">
                  <input type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-[11px] text-[var(--foreground)] outline-none transition placeholder:text-zinc-500 focus:border-sky-500" />
                    <button onClick={async () => {
                      if (!newQuestion.trim() || !listing) return;
                      setSendingQuestion(true);
                      const questionText = newQuestion.trim();
                      try {
                        const token = await user.getIdToken();
                        const res = await fetch("/api/listing-question", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({
                            action: "ask",
                            listingId: listing.id,
                            question: questionText,
                            askerName: user.email?.split("@")[0] || "Someone",
                          }),
                        });
                        if (!res.ok) throw new Error("Failed");
                        setNewQuestion("");
                        showToast("Question submitted", "success");
                      } catch (e) { console.error("Q&A submit error:", e); showToast("Failed to submit question", "error"); }
                      setSendingQuestion(false);
                      // Send notification to seller (outside main try/catch so failures don't mislead user)
                      try {
                        const { createNotification } = await import("../../../lib/notifications");
                        await createNotification({
                          targetEmail: listing.sellerEmail || "",
                          fromEmail: user.email,
                          type: "question",
                          title: `New question on "${listing.title}"`,
                          message: questionText.slice(0, 100),
                          listingId: listing.id,
                          listingTitle: listing.title,
                          listingImage: listing.images?.[0] || listing.imageUrl || "",
                        });
                      } catch {}
                    }} disabled={!newQuestion.trim() || sendingQuestion}
                      className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-[11px] font-bold text-white transition hover:bg-sky-400 disabled:opacity-50">
                      Ask
                    </button>
                </div>
              )}
            </div>

            {/* 9. WATCHLIST & SHARE */}
            <div className="flex gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1">
              <button onClick={saveToWatchlist} className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-white/[0.04] hover:text-[var(--foreground)] flex-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Save to Watchlist
              </button>
              <button onClick={async () => {
                try {
                  await navigator.share({ title: listing.title, text: `${listing.title} — $${listing.price} on Sky Drop`, url: window.location.href });
                } catch {
                  navigator.clipboard?.writeText(window.location.href).then(() => showToast("Link copied!", "success")).catch(() => {});
                }
              }} className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-white/[0.04] hover:text-[var(--foreground)] flex-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>

      </section>

      {sellerListings.length > 0 && (
        <section className="relative z-10 mx-auto max-w-5xl px-6 pb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-4 w-0.5 rounded-full bg-gradient-to-b from-sky-500 to-sky-500" />
            <h2 className="text-sm font-bold text-white">More from {listing.sellerUsername || listing.sellerEmail?.split("@")[0] || "this seller"}</h2>
          </div>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {sellerListings.map((l: any) => (
              <Link key={l.id} href={`/post/listing/${l.id}`}
                className="group shrink-0 w-44 rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-3 transition-all duration-200 hover:bg-white/[0.07] hover:border-sky-500/30 hover:-translate-y-1 hover:shadow-[0_8px_30px_-8px_rgba(14,165,233,0.12)]">
                <div className="overflow-hidden rounded-lg">
                  {l.images?.[0] || l.imageUrl || l.image ? (
                    <img src={l.images?.[0] || l.imageUrl || l.image || ""} alt="" loading="lazy" className="h-20 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="h-20 w-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center text-xs text-[var(--muted)]">SD</div>
                  )}
                </div>
                <p className="mt-2 truncate text-xs font-bold text-[var(--foreground)] group-hover:text-sky-300 transition-colors">{l.title}</p>
                <p className="text-xs font-black text-sky-400">${l.price}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {showCheckout && user?.email && !isContactListing && listing.pricingType !== "quote" && (
        <CheckoutModal
          listing={{ ...listing, rentalDays, pickupDate, returnDate }}
          buyerEmail={user.email}
          onClose={() => { setShowCheckout(false); setWinningBid(null); }}
          winningBid={winningBid || undefined}
        />
      )}
      {showPromote && (
        <PromoteModal
          listing={listing}
          onClose={() => setShowPromote(false)}
        />
      )}
      {showJobApplication && user && (
        <JobApplicationModal
          listingId={listingId}
          listingTitle={listing.title || ""}
          employerEmail={listing.sellerEmail || ""}
          employerId={listing.sellerId || ""}
          userEmail={user.email || ""}
          userName=""
          onClose={() => setShowJobApplication(false)}
          onSubmitted={() => {}}
        />
      )}
      {showBidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowBidModal(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Place Bid</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{listing.title}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Current bid: ${listing.currentBid || listing.startingBid || 0}</p>
            {listing.reservePrice != null && listing.reservePrice > 0 && (
              <p className="text-xs text-[var(--muted)]">Reserve: ${listing.reservePrice} {listing.currentBid >= listing.reservePrice ? "✅" : ""}</p>
            )}
            <div className="relative mt-3">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[var(--muted)]">$</span>
              <input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)}
                placeholder={String(getMinimumNextBid(listing.currentBid || listing.startingBid || 0))}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-3.5 pl-9 pr-4 text-lg text-[var(--foreground)] outline-none focus:border-sky-500" />
            </div>
            <div className="mt-1 text-right text-[9px] text-[var(--muted)]">
              Min: ${getMinimumNextBid(listing.currentBid || listing.startingBid || 0)}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" checked={autoBidEnabled} onChange={(e) => setAutoBidEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
              <span className="text-xs text-[var(--muted)]">Auto bid <span className="text-[var(--foreground)]">— automatically bid up to this amount if outbid</span></span>
            </label>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowBidModal(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={submitBid} disabled={!bidAmount}
                className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400 disabled:opacity-50">{autoBidEnabled ? "Auto Bid" : "Place Bid"}</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </main>
  );
}
