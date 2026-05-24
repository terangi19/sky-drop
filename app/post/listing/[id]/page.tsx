"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Navbar from "../../../components/Navbar";
import Background from "../../../components/Background";
import ReportModal from "../../../components/ReportModal";
import CheckoutModal from "../../../components/CheckoutModal";
import PromoteModal from "../../../components/PromoteModal";
import { showToast } from "../../../components/Toast";
import { onAuthStateChanged, User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getDocs, increment, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where, Timestamp, setDoc } from "firebase/firestore";

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
import { auth, db } from "../../../lib/firebase";
import { detectScam } from "../../../lib/scamdetection";
import { calculateTrustScore } from "../../../lib/trustscore";
import { detectSuspiciousPrice } from "../../../lib/pricedetection";

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
  [key: string]: unknown;
}

export default function ListingPage() {
  const params = useParams();
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
  const [showPromote, setShowPromote] = useState(false);
  const [userPurchased, setUserPurchased] = useState(false);
  const [sellerReviewData, setSellerReviewData] = useState<{ avg: number; count: number } | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [autoBidEnabled, setAutoBidEnabled] = useState(true);
  const [showBidModal, setShowBidModal] = useState(false);
  const [sellerListings, setSellerListings] = useState<any[]>([]);

  // Auto-open checkout if navigated with ?buy=1
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("buy") === "1" && user?.email && listing) {
      setShowCheckout(true);
    }
  }, [user, listing]);

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
    const unsub = onSnapshot(docRef, (snap) => {
      if (!snap.exists()) return;
      if (!mounted) return;
      const data: any = { id: snap.id, ...snap.data() };
      setListing(data);
      setLoading(false);
    }, (error) => {
      console.error(error);
      if (mounted) setLoading(false);
    });

    getDoc(docRef).then((snap) => {
      if (!snap.exists() || !mounted) return;
      const sellerEmail = snap.data().sellerEmail as string | undefined;
      if (!sellerEmail) return;
      getDocs(query(collection(db, "profiles"), where("email", "==", sellerEmail))).then((profileSnap) => {
        if (!profileSnap.empty && mounted) setSellerProfile(profileSnap.docs[0].data() as SellerProfile);
      }).catch(() => {});
      getDocs(query(collection(db, "reports"), where("reportedUserEmail", "==", sellerEmail), where("status", "==", "pending"))).then((reportsSnap) => {
        if (mounted) setSellerReportsCount(reportsSnap.size);
      }).catch(() => {});
    }).catch(() => {});

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
    }).catch(() => {});
  }, [listing?.sellerEmail, listingId]);

  useEffect(() => {
    if (!listing) return;
    try {
      const recent = JSON.parse(localStorage.getItem("recentlyViewed") || "[]").filter((r: any) => r.id !== listing.id);
      recent.unshift({ id: listing.id, title: listing.title, price: listing.price, images: listing.images, imageUrl: listing.imageUrl || listing.image });
      localStorage.setItem("recentlyViewed", JSON.stringify(recent.slice(0, 8)));
    } catch {}
  }, [listing]);

  // View counter
  useEffect(() => {
    if (!listingId) return;
    updateDoc(doc(db, "listings", listingId), { views: increment(1) }).catch(() => {});
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
      });
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
        text: `Offer: $${offerAmount}`,
        offer: { amount: Number(offerAmount), status: "pending" },
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
        <p className="text-[var(--muted)]">Listing not found.</p>
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

      {(() => {
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
              </div>
            );
          })()}

          {/* ── RIGHT COLUMN: PURCHASE CARD ── */}
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            {/* 1. PILLS: Category / Condition / Time */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold text-sky-400">{listing.category || "Other"}</span>
              {listing.condition && (
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${listing.condition === "New" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-[var(--foreground)]"}`}>
                  {listing.condition}
                </span>
              )}
              {listing.createdAt?.seconds && (
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
              <span className="text-3xl font-black text-[var(--foreground)]">${listing.price}</span>
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
                {user?.email === listing.highestBidder && (
                  <div className="text-[10px] text-emerald-400">✓ You're winning</div>
                )}
                {user && listing.bidCount > 0 && user.email !== listing.highestBidder && user.email !== listing.sellerEmail && (
                  <div className="text-[10px] text-amber-400">You've been outbid</div>
                )}
                {listing.auctionEndsAt && (
                  <div className="text-[10px] text-[var(--muted)]">Ends in {Math.max(0, Math.floor((new Date(listing.auctionEndsAt.seconds * 1000).getTime() - Date.now()) / 3600000))}h</div>
                )}
              </div>
            )}

            {/* 4. DELIVERY + AVAILABILITY */}
            {(listing.pickupAvailable || listing.shippingAvailable || listing.stockQuantity !== undefined) && (
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
                {listing.stockQuantity !== undefined && (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                    <span className="shrink-0 text-amber-400">📦</span>
                    <span>{listing.stockQuantity} Available</span>
                  </div>
                )}
              </div>
            )}

            {/* 5. BUY BUTTONS */}
            {listing.stockQuantity !== 0 && (
            <div className="flex gap-2">
              {user && user.email !== listing.sellerEmail ? (
                <>
                  {((listing.category === "Cars" || listing.category === "Property") && listing.acceptOffers ? (
                    <button
                      onClick={() => setShowOffer(true)}
                      className="flex-1 rounded-lg bg-sky-500 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-sky-400"
                    >
                      Make Offer
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowCheckout(true)}
                        className="flex-1 rounded-lg bg-sky-500 py-3 text-[13px] font-bold text-[var(--foreground)] transition hover:bg-sky-400"
                      >
                        Buy Now
                      </button>
                      {(listing.saleType === "auction" || listing.saleType === "auction_buy_now") && user && user.email !== listing.sellerEmail && (
                        <button onClick={() => setShowBidModal(true)}
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
                  ))}

                  <Link
                    href={`/messages?user=${encodeURIComponent(listing.sellerEmail || "")}&listing=${listingId}`}
                    className="flex items-center justify-center rounded-lg border border-zinc-700 px-4 py-3 text-[12px] font-medium text-[var(--foreground)] transition hover:border-zinc-600"
                  >
                    Message
                  </Link>
                </>
              ) : user?.email === listing.sellerEmail ? (
                <div className="flex gap-2 w-full">
                  <Link href={`/post/edit/${listing.id}`} className="flex-1 rounded-lg bg-sky-500 py-3 text-center text-[13px] font-bold text-[var(--foreground)] transition hover:bg-sky-400">
                    Edit Listing
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

            {/* Safe Trading Reminder */}
            {user && user.email !== listing.sellerEmail && (
              <p className="text-[11px] text-[var(--muted)]">
                🔒 Keep payments and messages inside Sky Drop.
              </p>
            )}

            {/* Unverified Seller Notice */}
            {isNotVerified && user && user.email !== listing.sellerEmail && (
              <p className="text-[11px] text-red-400/60">
                Trade carefully — this seller is not verified.
              </p>
            )}

            {/* ── SEPARATOR ── */}
            <div className="border-t border-zinc-800" />

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
                      {sellerProfile?.verified && (
                        <span className="shrink-0 text-[10px] text-sky-400">Verified</span>
                      )}
                      {sellerProfile?.trustedSeller && (
                        <span className="shrink-0 text-[10px] text-emerald-400">Trusted</span>
                      )}
                      {isNewSeller && (
                        <span className="shrink-0 text-[10px] text-amber-400">New</span>
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

            {/* 8. WATCHLIST */}
            <button onClick={saveToWatchlist} className="flex w-full items-center justify-center gap-1.5 py-2.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]">
              ♡ Save to Watchlist
            </button>
          </div>
        </div>

        {/* ── DESCRIPTION (below main layout) ── */}
        {listing.description && (
          <div className="mt-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Description</h2>
            <div className="text-sm leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
              {listing.description}
            </div>
          </div>
        )}

        {/* SIMILAR LISTINGS */}
        <div className="mt-8">
          <h2 className="text-sm font-bold text-[var(--foreground)]">Similar Listings</h2>
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-xs text-[var(--muted)]">
            More items in this category coming soon.
          </div>
        </div>
      </section>

      {sellerListings.length > 0 && (
        <section className="relative z-10 mx-auto max-w-5xl px-6 pb-10">
          <h2 className="text-sm font-bold text-[var(--foreground)]">More from {listing.sellerEmail?.split("@")[0]}</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {sellerListings.map((l: any) => (
              <Link key={l.id} href={`/post/listing/${l.id}`}
                className="group shrink-0 w-44 rounded-xl border border-zinc-800/40 bg-zinc-900/50 p-3 transition hover:border-sky-500/30 hover:-translate-y-0.5">
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
          listing={listing}
          buyerEmail={user.email}
          onClose={() => setShowCheckout(false)}
        />
      )}
      {showPromote && (
        <PromoteModal
          listing={listing}
          onClose={() => setShowPromote(false)}
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
    </main>
  );
}
