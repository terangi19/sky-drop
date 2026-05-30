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
import { addDoc, collection, doc, getDoc, getDocs, increment, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where, Timestamp, setDoc } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../../../lib/firebase";
import { detectScam } from "../../../lib/scamdetection";
import { calculateTrustScore } from "../../../lib/trustscore";
import { detectSuspiciousPrice } from "../../../lib/pricedetection";
import { safeGetDoc, safeOnSnapshot, parseFirestoreError, isOnline } from "../../../lib/firestore";

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
  displayName?: string;
  bio?: string;
  photoURL?: string;
  memberSince?: Timestamp;
  verified?: boolean;
  trustedSeller?: boolean;
  phoneVerified?: boolean;
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
  const [winningBid, setWinningBid] = useState<number | null>(null);
  const [showPromote, setShowPromote] = useState(false);
  const [showJobApplication, setShowJobApplication] = useState(false);
  const [userPurchased, setUserPurchased] = useState(false);
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

  // Auto-open checkout if navigated with ?buy=1
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("buy") === "1" && user?.email && listing) {
      if (isAuctionWinner) {
        setWinningBid(listing.currentBid || listing.startingBid || 0);
      }
      const t = setTimeout(() => setShowCheckout(true), 0);
      return () => clearTimeout(t);
    }
  }, [user, listing, isAuctionWinner]);

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
        message: `Congratulations! You won the auction for "${listing.title}" with a bid of $${bidAmount}.\n\nComplete your purchase within 24 hours to secure the item. Payment is protected in escrow until you confirm delivery.`,
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
      const sellerEmail = snap.data().sellerEmail as string | undefined;
      if (!sellerEmail) return;
      getDocs(query(collection(db, "profiles"), where("email", "==", sellerEmail))).then((profileSnap) => {
        if (!profileSnap.empty && mounted) setSellerProfile(profileSnap.docs[0].data() as SellerProfile);
      }).catch((e) => console.error("Failed to fetch seller profile:", e));
      getDocs(query(collection(db, "reports"), where("reportedUserEmail", "==", sellerEmail), where("status", "==", "pending"))).then((reportsSnap) => {
        if (mounted) setSellerReportsCount(reportsSnap.size);
      }).catch((e) => console.error("Failed to fetch reports:", e));
    });

    return () => { mounted = false; unsub(); };
  }, [listingId]);

  useEffect(() => {
    if (!user?.email || !listingId) return;
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "purchases"), where("listingId", "==", listingId), where("buyerEmail", "==", user.email)));
        if (!snap.empty && mounted) setUserPurchased(true);
      } catch (e) { console.error(e); }
    })();
    return () => { mounted = false; };
  }, [user?.email, listingId]);

  // Outbid detection
  useEffect(() => {
    if (!user?.email || !listing) return;
    const prev = prevHighestBidderRef.current;
    const current = listing.highestBidder;
    if (prev === user.email && current && current !== user.email) {
      showToast("You've been outbid! 💰", "error");
    }
    prevHighestBidderRef.current = current || null;
  }, [listing?.highestBidder, user?.email, listing]);

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
    getDocs(query(collection(db, "listings"), where("sellerEmail", "==", listing.sellerEmail))).then((snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l: any) => l.id !== listingId && l.status !== "sold");
      setSellerListings(items.slice(0, 5));
    }).catch((e) => console.error("Failed to fetch seller listings:", e));
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
    const updateMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(name.startsWith("og:") ? "property" : "name", name); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    document.title = `${listing.title} — $${listing.price} — Sky Drop`;
    updateMeta("description", desc);
    updateMeta("og:title", `${listing.title} — $${listing.price}`);
    updateMeta("og:description", desc);
    if (image) updateMeta("og:image", image);
    updateMeta("og:type", "website");

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
        availability: listing.status === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        itemCondition: listing.condition === "New" ? "https://schema.org/NewCondition" : listing.condition === "Used - Like New" ? "https://schema.org/LikeNew" : "https://schema.org/UsedCondition",
        url: typeof window !== "undefined" ? window.location.href : "",
      },
    });
    document.head.appendChild(ld);
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
      emailVerified: true,
      hasProfile: true,
      hasBio: !!sellerProfile.bio,
      hasPhoto: !!sellerProfile.photoURL,
      memberSince: memberDate,
      reportsCount: sellerReportsCount,
      salesCount: sellerReviewData?.count || 0,
    });
  }, [sellerProfile, sellerReportsCount, sellerReviewData?.count]);

  const isNotVerified = useMemo(() => {
    if (!sellerProfile) return false;
    const hasVerified = sellerProfile?.verified || sellerProfile?.phoneVerified;
    return !hasVerified;
  }, [sellerProfile]);

  const isNewSeller = useMemo(() => {
    if (!sellerProfile?.memberSince) return false;
    const memberDate = sellerProfile.memberSince.toDate ? sellerProfile.memberSince.toDate() : new Date();
    const daysOld = (Date.now() - memberDate.getTime()) / 86400000;
    if (daysOld > 7) return false;
    if (sellerProfile.photoURL) return false;
    if ((sellerReviewData?.count || 0) > 0) return false;
    if (sellerProfile.verified) return false;
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
      await addDoc(collection(db, "messages"), {
        sender: user.email,
        receiver: listing.sellerEmail,
        participants: [user.email, listing.sellerEmail],
        type: "offer",
        offerType: "make",
        offerAmount: Number(offerAmount),
        offerStatus: "pending",
        text: `Offer: $${offerAmount}`,
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: listing.images?.[0] || listing.imageUrl || "",
        listingPrice: listing.price,
        read: false,
        createdAt: serverTimestamp(),
      });
      setOfferSent(true);
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

    if (!autoBidEnabled) {
      try {
        await runTransaction(db, async (transaction) => {
          const ref = doc(db, "listings", listing.id);
          const snap = await transaction.get(ref);
          if (!snap.exists()) throw new Error("Listing not found");
          const current = snap.data();
          const currentBid = current.currentBid || current.startingBid || 0;
          const minNext = getMinimumNextBid(currentBid);
          if (current.auctionEndsAt && current.auctionEndsAt.toMillis() < Date.now()) throw new Error("Auction has ended");
          if (current.soldTo || current.status === "sold") throw new Error("Listing is no longer available");
          if (amount < minNext) throw new Error("Minimum bid is $" + minNext);
          transaction.update(ref, {
            currentBid: amount,
            highestBidder: user.email,
            bidCount: (current.bidCount || 0) + 1,
          });
        });
        setShowBidModal(false);
        setBidAmount("");
        showToast("Bid placed!", "success");
      } catch (e: any) {
        console.error(e);
        showToast(e.message || "Failed to place bid", "error");
      }
      return;
    }

    const newMax = amount;
    let changes: any = {};
    let outbidUser: string | null = null;

    try {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, "listings", listing.id);
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error("Listing not found");

        const current = snap.data();
        const startingBid = current.startingBid || 0;

        if (current.auctionEndsAt && current.auctionEndsAt.toMillis() < Date.now())
          throw new Error("Auction has ended");
        if (current.soldTo || current.status === "sold")
          throw new Error("Listing is no longer available");

        const currentBid = current.currentBid || startingBid;
        const currentMaxBid = current.currentMaxBid || 0;
        const secondMaxBid = current.secondMaxBid || 0;

        if (!current.highestBidder) {
          if (newMax < startingBid)
            throw new Error("Bid must be at least $" + startingBid);
          changes = {
            currentBid: startingBid,
            currentMaxBid: newMax,
            secondMaxBid: 0,
            highestBidder: user.email,
            bidCount: (current.bidCount || 0) + 1,
          };
        } else if (current.highestBidder === user.email) {
          if (newMax <= currentMaxBid)
            throw new Error("Your max bid is already $" + currentMaxBid + " or higher");
          changes = { currentMaxBid: newMax };
        } else {
          const minNext = getMinimumNextBid(currentBid);
          if (newMax < minNext)
            throw new Error("Minimum bid is $" + minNext);

          if (newMax > currentMaxBid) {
            const inc = getBidIncrement(currentBid);
            const newPrice = Math.min(newMax, currentMaxBid + inc);
            outbidUser = current.highestBidder;
            changes = {
              currentBid: newPrice,
              currentMaxBid: newMax,
              secondMaxBid: Math.max(secondMaxBid, currentMaxBid),
              highestBidder: user.email,
              bidCount: (current.bidCount || 0) + 1,
            };
          } else if (newMax > secondMaxBid) {
            const inc = getBidIncrement(currentBid);
            const newPrice = Math.min(currentMaxBid, newMax + inc);
            if (newPrice > currentBid) {
              changes = {
                currentBid: newPrice,
                secondMaxBid: newMax,
                bidCount: (current.bidCount || 0) + 1,
              };
            } else {
              throw new Error("Bid too low to change current price");
            }
          } else {
            throw new Error("Bid must be at least $" + getMinimumNextBid(secondMaxBid));
          }
        }

        if (current.auctionEndsAt) {
          const msLeft = current.auctionEndsAt.toMillis() - Date.now();
          if (msLeft > 0 && msLeft < 300000) {
            const newEnd = new Date(Date.now() + 300000);
            changes.auctionEndsAt = Timestamp.fromDate(newEnd);
            changes.auctionExtended = true;
          }
        }

        transaction.update(ref, changes);
      });

      setListing((prev) => prev ? { ...prev, ...changes } : prev);
      setShowBidModal(false);
      setBidAmount("");
      showToast("Auto bid placed!", "success");

      try {
        const { createNotification } = await import("../../../lib/notifications");
        await createNotification({
          targetEmail: listing.sellerEmail || "",
          fromEmail: user.email,
          type: "bid",
          title: "New bid on your listing",
          message: `${user.email} bid $${newMax} on "${listing.title}"`,
          listingId: listing.id,
          listingTitle: listing.title,
          listingImage: listing.images?.[0] || listing.imageUrl,
          total: Number(newMax),
        });
        // Bid confirmation to bidder
        await createNotification({
          targetEmail: user.email || "",
          fromEmail: listing.sellerEmail || "",
          type: "bid_confirmation",
          title: "Bid Placed",
          message: `Your bid of $${newMax} has been placed on "${listing.title}".\n\nWe'll notify you if you're outbid.`,
          listingId: listing.id,
          listingTitle: listing.title,
          listingImage: listing.images?.[0] || listing.imageUrl,
          total: Number(newMax),
        });
      } catch (_) {}

      if (outbidUser && outbidUser !== listing.sellerEmail) {
        try {
          const { createNotification } = await import("../../../lib/notifications");
          await createNotification({
            targetEmail: outbidUser,
            fromEmail: user.email,
            type: "outbid",
            title: "You've been outbid!",
            message: `You were outbid on "${listing.title}"`,
            listingId: listing.id,
            listingTitle: listing.title,
            listingImage: listing.images?.[0] || listing.imageUrl,
          });
        } catch (_) {}
      }
    } catch (e: any) {
      console.error(e);
      showToast(e.message || "Failed to place auto bid", "error");
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
  const sellerStars = Math.floor((sellerStatsData?.avg || 0));
  const sellerHasHalf = ((sellerStatsData?.avg || 0) % 1) >= 0.5;

  async function sendMessageToSeller() {
    if (!user?.email || !listing.sellerEmail || !messageText.trim()) return;
    setSendingMessage(true);
    try {
      await addDoc(collection(db, "messages"), {
        text: messageText.trim(),
        sender: user.email,
        receiver: listing.sellerEmail,
        participants: [user.email, listing.sellerEmail],
        listingId: listingId,
        listingTitle: listing.title || "Listing",
        listingImage: listing.imageUrl || listing.image || null,
        listingPrice: listing.price || null,
        createdAt: serverTimestamp(),
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
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      {showOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={resetOffer}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {offerSent ? (
              <div className="py-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
          <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-amber-400 text-sm">⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-300">Safety Notice</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  This listing may contain suspicious content. Trade safely — avoid paying outside Sky Drop and report suspicious sellers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Price Warning */}
        {priceWarning && (
          <div className="mb-3 rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-400/80 text-sm">⚠️</span>
              <div>
                <p className="text-xs font-bold text-amber-300/90">Price unusually low</p>
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
              <div className="group relative overflow-hidden rounded-2xl bg-zinc-900/80 border border-zinc-700/50">
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
          <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-5">
            {/* 1. PILLS: Category / Condition / Time */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold text-sky-400">{listing.category || "Other"}</span>
              {listing.condition && (
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${listing.condition === "New" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-[var(--foreground)]"}`}>
                  {listing.condition}
                </span>
              )}
              {listing.createdAt?.seconds != null && (
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] text-[var(--muted)]">{timeAgo(listing.createdAt.seconds)}</span>
              )}
              {listing.location && (
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] text-[var(--muted)]">{listing.location}</span>
              )}
            </div>

            {/* 2. TITLE */}
            <h1 className="text-xl font-black tracking-tight text-[var(--foreground)]">{listing.title}</h1>

            {/* 3. PRICE */}
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-[var(--foreground)]">{listing.price ? `$${listing.price}` : listing.type === "service" ? "Price negotiable" : `$${listing.price}`}</span>
              {listing.status === "sold" && (
                <span className="rounded bg-red-600/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--foreground)]">Sold</span>
              )}
              {listing.status !== "sold" && listing.expiresAt?.toMillis?.() < Date.now() && (
                <span className="rounded bg-zinc-700/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Expired</span>
              )}
              {(listing as any).promotedUntil?.toMillis?.() > Date.now() && (
                <span className="rounded bg-amber-500/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">📈 Promoted</span>
              )}
            </div>

            {userPurchased && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
                <span className="text-emerald-400 text-[11px]">✓ You purchased this item</span>
              </div>
            )}

            {(listing.saleType === "auction" || listing.saleType === "auction_buy_now") && (
              <div className="mt-3 space-y-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">Current Bid</span>
                  <span className="font-black text-lg text-amber-400">${listing.currentBid || listing.startingBid || 0}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
                  <span>{listing.bidCount || 0} bids</span>
                  {listing.reservePrice && (
                    <span className={listing.currentBid >= listing.reservePrice ? "text-emerald-400" : "text-amber-400"}>
                      Reserve {listing.currentBid >= listing.reservePrice ? "met ✅" : "not met"}
                    </span>
                  )}
                </div>
                {auctionEnded ? (
                  <>
                    {user?.email === listing.highestBidder ? (
                      <div className="text-[10px] text-emerald-400 font-bold">🎉 You won this auction!</div>
                    ) : user?.email !== listing.sellerEmail ? (
                      <div className="text-[10px] text-red-400">Auction ended — you didn't win</div>
                    ) : (
                      <div className="text-[10px] text-amber-400">Auction ended — winner: {listing.highestBidder || "unknown"}</div>
                    )}
                    <div className="text-[10px] text-[var(--muted)]">Auction ended</div>
                  </>
                ) : (
                  <>
                    {user?.email === listing.highestBidder && (
                      <div className="text-[10px] text-emerald-400">✓ You're winning</div>
                    )}
                    {user && listing.bidCount > 0 && user.email !== listing.highestBidder && user.email !== listing.sellerEmail && (
                      <div className="text-[10px] text-amber-400">You've been outbid</div>
                    )}
                    {listing.auctionEndsAt && (
                      <div className="text-[10px] text-[var(--muted)]">Ends in {Math.max(0, Math.floor(((listing.auctionEndsAt?.seconds ? new Date(listing.auctionEndsAt.seconds * 1000).getTime() : 0) - Date.now()) / 3600000))}h</div>
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
                  <span>Digital Download — Instant Delivery</span>
                </div>
              </div>
            ) : listing.type === "service" ? (
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-violet-400">🤝</span>
                  <span>Service — Discuss scope in messages</span>
                </div>
                {listing.serviceDuration && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>⏱ Estimated delivery: {listing.serviceDuration}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span>{listing.price ? `💰 $${listing.price}` : "💬 Price negotiable — send an offer"}</span>
                </div>
              </div>
            ) : listing.type === "rental" ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-emerald-400">🔑</span>
                  <span>Rental — Pickup from {listing.location || "seller's location"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
                  <span>${Number(listing.price).toFixed(2)}/day{listing.rentalPriceWeekly ? ` · $${Number(listing.rentalPriceWeekly).toFixed(2)}/wk` : ""}{listing.rentalPriceMonthly ? ` · $${Number(listing.rentalPriceMonthly).toFixed(2)}/mo` : ""}</span>
                </div>
                {listing.rentalDeposit && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]">🔒 $${Number(listing.rentalDeposit).toFixed(2)} refundable deposit</span>
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
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-yellow-400">🎟</span>
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
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-rose-400">🏠</span>
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
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <span className="shrink-0 text-cyan-400">💼</span>
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
                    <span className="shrink-0 text-emerald-400">
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
                    <span className="shrink-0 text-amber-400">📦</span>
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
                        const convKey = `listing_${listingId}`;
                        const existingConv = await getDocs(
                          query(
                            collection(db, "conversations"),
                            where("convKey", "==", convKey),
                            where("participants", "array-contains", user!.email!)
                          )
                        );

                        let convId: string;
                        if (!existingConv.empty) {
                          convId = existingConv.docs[0].id;
                          await updateDoc(doc(db, "conversations", convId), {
                            updatedAt: serverTimestamp(),
                            lastMessage: `Property inquiry started`,
                          });
                        } else {
                          const convRef = await addDoc(collection(db, "conversations"), {
                            convKey,
                            participants: [user!.email!, listing.sellerEmail],
                            buyerEmail: user!.email!,
                            sellerEmail: listing.sellerEmail,
                            listingId,
                            listingTitle: listing.title,
                            listingPrice: listing.price,
                            listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            lastMessage: `Property inquiry started`,
                          });
                          convId = convRef.id;
                        }

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

                        await addDoc(collection(db, "messages"), {
                          type: "system",
                          text: buyerMsg,
                          sender: "system",
                          receiver: listing.sellerEmail,
                          participants: [user!.email!, listing.sellerEmail],
                          conversationId: convId,
                          listingId,
                          listingTitle: listing.title,
                          read: false,
                          createdAt: serverTimestamp(),
                        });

                        await addDoc(collection(db, "messages"), {
                          type: "text",
                          text: `🟢 A user is interested in your property listing.\n\nUse this chat to discuss:\n• viewing arrangements\n• price/negotiation\n• property details\n• settlement or tenancy\n\nKeep all communication inside Sky Drop for protection.`,
                          sender: "system",
                          receiver: listing.sellerEmail,
                          participants: [user!.email!, listing.sellerEmail],
                          conversationId: convId,
                          listingId,
                          listingTitle: listing.title,
                          read: false,
                          createdAt: serverTimestamp(),
                        });
                      } catch (e) {
                        console.error("Property inquiry failed:", e);
                      }
                      router.push(`/messages?user=${encodeURIComponent(listing.sellerEmail || "")}&listing=${listingId}`);
                    }}
                    className="flex-1 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-rose-500/20 transition hover:shadow-xl active:scale-[0.97]"
                  >
                    Contact Owner
                  </button>
                  {listing.acceptOffers && (
                    <button onClick={() => setShowOffer(true)}
                      className="rounded-lg border border-zinc-700 px-3 py-3 text-[12px] font-medium text-[var(--muted)] transition hover:border-zinc-600 hover:text-[var(--foreground)]">
                      Make Offer
                    </button>
                  )}
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 py-3 text-center text-[13px] font-bold text-white shadow-lg shadow-rose-500/20 transition hover:shadow-xl active:scale-[0.97]">
                    ✏️ Edit Listing
                  </Link>
                  <button onClick={() => setShowPromote(true)}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-[13px] font-bold text-amber-400 transition hover:bg-amber-500/15">
                    📈 Promote
                  </button>
                </div>
              ) : (
                <button onClick={() => showToast("Sign in first", "info")} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
                  Sign in
                </button>
              )}
            </div>
            )}

            {/* 5. BUY BUTTONS */}
            {listing.status !== "sold" && !isExpired && (listing.stockQuantity == null || listing.stockQuantity > 0) && listing.type !== "service" && listing.type !== "job" && listing.type !== "property" && (
            <div className="flex gap-2">
              {user && user.email !== listing.sellerEmail ? (
                <>
                  {isAuctionWinner ? (
                    <button
                      onClick={() => { setWinningBid(listing.currentBid || listing.startingBid || 0); setShowCheckout(true); }}
                      className="flex-1 rounded-lg bg-emerald-500 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-emerald-400"
                    >
                      Pay Now — ${listing.currentBid || listing.startingBid || 0}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowCheckout(true)}
                      className="flex-1 rounded-lg bg-sky-500 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-sky-400"
                    >
                      Buy Now
                    </button>
                  )}
                  {!auctionEnded && (listing.saleType === "auction" || listing.saleType === "auction_buy_now") && user && user.email !== listing.sellerEmail && (
                    <button onClick={() => { setShowBidModal(true); setBidAmount(String(getMinimumNextBid(listing.currentBid || listing.startingBid || 0))); }}
                      className="flex-1 rounded-lg border border-amber-500/40 bg-amber-500/10 py-2.5 text-[13px] font-bold text-amber-400 transition hover:bg-amber-500/20">
                      Bid Now
                    </button>
                  )}
                  {listing.acceptOffers && (
                    <button
                      onClick={() => setShowOffer(true)}
                        className="rounded-lg border border-zinc-700 px-3 py-3 text-[12px] font-medium text-[var(--muted)] transition hover:border-zinc-600 hover:text-[var(--foreground)]"
                    >
                      Make Offer
                    </button>
                  )}
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-center text-[13px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                    ✏️ Edit Listing
                  </Link>
                  <button onClick={() => setShowPromote(true)}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-[13px] font-bold text-amber-400 transition hover:bg-amber-500/15">
                    📈 Promote
                  </button>
                </div>
              ) : (
                <button onClick={() => showToast("Sign in first", "info")} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
                  Sign in
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
                        const convKey = `listing_${listingId}`;
                        const existingConv = await getDocs(
                          query(
                            collection(db, "conversations"),
                            where("convKey", "==", convKey),
                            where("participants", "array-contains", user!.email!)
                          )
                        );

                        let convId: string;
                        if (!existingConv.empty) {
                          convId = existingConv.docs[0].id;
                          await updateDoc(doc(db, "conversations", convId), {
                            updatedAt: serverTimestamp(),
                            lastMessage: `Job inquiry started`,
                          });
                        } else {
                          const convRef = await addDoc(collection(db, "conversations"), {
                            convKey,
                            participants: [user!.email!, listing.sellerEmail],
                            buyerEmail: user!.email!,
                            sellerEmail: listing.sellerEmail,
                            listingId,
                            listingTitle: listing.title,
                            listingPrice: listing.price,
                            listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            lastMessage: `Job inquiry started`,
                          });
                          convId = convRef.id;
                        }

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

                        await addDoc(collection(db, "messages"), {
                          type: "system",
                          text: buyerMsg,
                          sender: "system",
                          receiver: listing.sellerEmail,
                          participants: [user!.email!, listing.sellerEmail],
                          conversationId: convId,
                          listingId,
                          listingTitle: listing.title,
                          read: false,
                          createdAt: serverTimestamp(),
                        });

                        await addDoc(collection(db, "messages"), {
                          type: "text",
                          text: `🟢 A user is interested in your job listing.\n\nUse this chat to discuss:\n• experience/skills\n• availability\n• interview arrangements\n• pay/rates\n• job expectations\n\nKeep all communication inside Sky Drop for protection.`,
                          sender: "system",
                          receiver: listing.sellerEmail,
                          participants: [user!.email!, listing.sellerEmail],
                          conversationId: convId,
                          listingId,
                          listingTitle: listing.title,
                          read: false,
                          createdAt: serverTimestamp(),
                        });
                      } catch (e) {
                        console.error("Job inquiry failed:", e);
                      }
                      try { localStorage.setItem("skyJobPrefill", `Hi, I'm interested in this job 👋`); } catch {}
                      router.push(`/messages?user=${encodeURIComponent(listing.sellerEmail || "")}&listing=${listingId}`);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-cyan-500/20 transition hover:shadow-xl hover:shadow-cyan-500/30"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    Apply Now
                  </button>
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-cyan-500 py-3 text-center text-[13px] font-bold text-white transition hover:bg-cyan-400">
                    Edit Listing
                  </Link>
                </div>
              ) : (
                <button onClick={() => showToast("Sign in first", "info")} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
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
                        const convKey = `listing_${listingId}`;
                        const existingConv = await getDocs(
                          query(
                            collection(db, "conversations"),
                            where("convKey", "==", convKey),
                            where("participants", "array-contains", user!.email!)
                          )
                        );

                        let convId: string;
                        if (!existingConv.empty) {
                          convId = existingConv.docs[0].id;
                          await updateDoc(doc(db, "conversations", convId), {
                            updatedAt: serverTimestamp(),
                            lastMessage: `Service inquiry started`,
                          });
                        } else {
                          const convRef = await addDoc(collection(db, "conversations"), {
                            convKey,
                            participants: [user!.email!, listing.sellerEmail],
                            buyerEmail: user!.email!,
                            sellerEmail: listing.sellerEmail,
                            listingId,
                            listingTitle: listing.title,
                            listingPrice: listing.price,
                            listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            lastMessage: `Service inquiry started`,
                          });
                          convId = convRef.id;
                        }

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

                        await addDoc(collection(db, "messages"), {
                          type: "system",
                          text: buyerMsg,
                          sender: "system",
                          receiver: listing.sellerEmail,
                          participants: [user!.email!, listing.sellerEmail],
                          conversationId: convId,
                          listingId,
                          listingTitle: listing.title,
                          read: false,
                          createdAt: serverTimestamp(),
                        });

                        await addDoc(collection(db, "messages"), {
                          type: "text",
                          text: `🟢 A user is interested in hiring your service.\n\nUse this chat to discuss:\n• project requirements\n• pricing\n• deadlines\n• revisions\n• delivery expectations\n\nKeep all communication inside Sky Drop for protection.`,
                          sender: "system",
                          receiver: listing.sellerEmail,
                          participants: [user!.email!, listing.sellerEmail],
                          conversationId: convId,
                          listingId,
                          listingTitle: listing.title,
                          read: false,
                          createdAt: serverTimestamp(),
                        });
                      } catch (e) {
                        console.error("Service inquiry failed:", e);
                      }
                      router.push(`/messages?user=${encodeURIComponent(listing.sellerEmail || "")}&listing=${listingId}`);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-violet-500/20 transition hover:shadow-xl hover:shadow-violet-500/30"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
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
                  <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-center text-[13px] font-bold text-white shadow-lg shadow-violet-500/20 transition hover:shadow-xl active:scale-[0.97]">
                    ✏️ Edit Listing
                  </Link>
                </div>
              ) : (
                <button onClick={() => showToast("Sign in first", "info")} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
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
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs text-[var(--foreground)] outline-none transition focus:border-emerald-500" />
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
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs text-[var(--foreground)] outline-none transition focus:border-emerald-500" />
                        </div>
                      </div>
                      {rentalDays > 0 && (
                        <div className="rounded-lg bg-zinc-800/40 px-3 py-2 text-xs">
                          <div className="space-y-1">
                            <p className="font-medium text-emerald-400 text-[11px]">
                              ${Number(listing.price).toFixed(2)}/day
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
                              <span className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]">🔒 Refundable Deposit</span>
                              <span>$${Number(listing.rentalDeposit).toFixed(2)}</span>
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
                        setShowCheckout(true);
                      }}
                        className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-xl hover:shadow-emerald-500/30">
                        Rent Now {rentalDays > 0 ? `— $${(Number(listing.price) * rentalDays + 1).toFixed(2)}` : ""}
                      </button>
                    </div>
                    <Link
                      href={`/messages?user=${encodeURIComponent(listing.sellerEmail || "")}&listing=${listingId}`}
                      className="flex items-center justify-center rounded-lg border border-zinc-700 px-4 py-3 text-[12px] font-medium text-[var(--foreground)] transition hover:border-zinc-600 self-stretch">
                      Message
                    </Link>
                  </>
                ) : user?.email === listing.sellerEmail ? (
                  <div className="flex gap-2 w-full">
                    <Link href={`/post/ai?edit=${listingId}`} className="flex-1 rounded-lg bg-emerald-500 py-3 text-center text-[13px] font-bold text-white transition hover:bg-emerald-400">
                      Edit Listing
                    </Link>
                  </div>
                ) : (
                  <button onClick={() => showToast("Sign in first", "info")} className="flex-1 rounded-lg border border-zinc-700 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-zinc-800">
                    Sign in
                  </button>
                )}
              </div>
            </div>
            )}

            {/* Escrow & Safe Trading */}
            {user && user.email !== listing.sellerEmail && (
              <div className="rounded-lg border border-amber-500/10 bg-amber-500/[0.03] px-3.5 py-2.5">
                <p className="text-[11px] font-semibold text-amber-400/90">🔒 Escrow Protected Purchase</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">Your payment is held securely. The seller is paid only after you confirm delivery.</p>
              </div>
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
                href={user?.email === listing.sellerEmail ? "#" : `/seller/${listing.sellerEmail || listing.sellerUsername}`}
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
                      {sellerProfile?.verified && (
                        <span className="shrink-0 text-[10px] text-sky-400">Verified</span>
                      )}
                      {sellerProfile?.trustedSeller && (
                        <span className="shrink-0 text-[10px] text-emerald-400">Trusted</span>
                      )}
                      {isNewSeller && (
                        <span className="shrink-0 text-[10px] text-amber-400">New</span>
                      )}
                      {sellerProfile?.profileBadge === "epic" && (
                        <span className="shrink-0 text-[10px] text-violet-400 font-bold">💎 Epic</span>
                      )}
                      {sellerProfile?.profileBadge === "legendary" && (
                        <span className="shrink-0 text-[10px] text-amber-400 font-bold animate-pulse">👑 The Five</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span>{'★'.repeat(sellerStars)}{sellerHasHalf ? '½' : ''} {(sellerStatsData?.avg || 0).toFixed(1)}</span>
                      <span>{sellerStatsData?.count || 0} sale{(sellerStatsData?.count || 0) !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* Report Button */}
              {user && user.email !== listing.sellerEmail && (
                <button
                  onClick={() => setShowReportModal(true)}
                  className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--muted)] transition hover:text-amber-400"
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
                      <span className="text-xs text-emerald-400">✓ Message sent!</span>
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
                      <div className="mt-2 ml-6 flex items-start gap-2 border-l-2 border-emerald-500/30 pl-3">
                        <span className="text-xs mt-0.5">💬</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-emerald-300">{q.answer}</p>
                          <p className="mt-0.5 text-[9px] text-[var(--muted)]">Seller · {q.answeredAt?.toDate?.() ? new Date(q.answeredAt.toDate()).toLocaleDateString() : ""}</p>
                        </div>
                      </div>
                    ) : user?.email === listing.sellerEmail ? (
                      <div className="mt-2 ml-6">
                        {answeringId === q.id ? (
                          <div className="flex gap-2">
                            <input type="text" value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                              placeholder="Type your answer..."
                              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-[11px] text-[var(--foreground)] outline-none transition focus:border-emerald-500" />
                            <button onClick={async () => {
                              if (!answerText.trim()) return;
                              try {
                                await updateDoc(doc(db, "listingQuestions", q.id), { answer: answerText.trim(), answeredAt: serverTimestamp() });
                                setAnswerText(""); setAnsweringId(null);
                              } catch {}
                            }} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-400">Answer</button>
                            <button onClick={() => { setAnsweringId(null); setAnswerText(""); }} className="text-[10px] text-[var(--muted)] hover:text-white px-1">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setAnsweringId(q.id); setAnswerText(""); }}
                            className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-[10px] font-bold text-emerald-400 transition hover:bg-emerald-500/10">
                            Answer
                          </button>
                        )}
                      </div>
                    ) : null}

                    {!q.answer && user?.email !== listing.sellerEmail && (
                      <p className="mt-1 ml-6 text-[9px] text-amber-500">Awaiting seller response</p>
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
                      try {
                        await addDoc(collection(db, "listingQuestions"), {
                          listingId: listing.id,
                          askerEmail: user.email,
                          askerName: user.email?.split("@")[0] || "Someone",
                          question: newQuestion.trim(),
                          createdAt: serverTimestamp(),
                        });
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
                          message: newQuestion.trim().slice(0, 100),
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

            {/* 9. WATCHLIST */}
            <button onClick={saveToWatchlist} className="flex w-full items-center justify-center gap-1.5 py-2.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]">
              ♡ Save to Watchlist
            </button>
          </div>
        </div>

      </section>

      {sellerListings.length > 0 && (
        <section className="relative z-10 mx-auto max-w-5xl px-6 pb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-4 w-0.5 rounded-full bg-gradient-to-b from-sky-500 to-violet-500" />
            <h2 className="text-sm font-bold text-white">More from {listing.sellerEmail?.split("@")[0]}</h2>
          </div>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {sellerListings.map((l: any) => (
              <Link key={l.id} href={`/post/listing/${l.id}`}
                className="group shrink-0 w-44 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 transition-all duration-200 hover:bg-white/[0.04] hover:border-sky-500/30 hover:-translate-y-1 hover:shadow-[0_8px_30px_-8px_rgba(14,165,233,0.12)]">
                {l.images?.[0] || l.imageUrl || l.image ? (
                  <img src={l.images?.[0] || l.imageUrl || l.image || ""} alt="" loading="lazy" className="h-20 w-full rounded-lg object-cover" />
                ) : (
                  <div className="h-20 w-full rounded-lg bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-purple-600/10 flex items-center justify-center text-xs text-[var(--muted)]">SD</div>
                )}
                <p className="mt-2 truncate text-xs font-bold text-[var(--foreground)]">{l.title}</p>
                <p className="text-xs font-black text-sky-400">${l.price}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {showCheckout && user?.email && (
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
          userName={user.displayName || ""}
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
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/30" />
              <span className="text-xs text-[var(--muted)]">Auto bid <span className="text-[var(--foreground)]">— automatically bid up to this amount if outbid</span></span>
            </label>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowBidModal(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={submitBid} disabled={!bidAmount}
                className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-amber-400 disabled:opacity-50">{autoBidEnabled ? "Auto Bid" : "Place Bid"}</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </main>
  );
}
