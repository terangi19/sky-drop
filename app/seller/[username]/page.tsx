"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import { AwhinaUnderHeader } from "../../components/AwhinaOnlineBadge";
import ListingImage, { listingHasImage } from "../../components/ListingImage";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useParams } from "next/navigation";
import ReportModal from "../../components/ReportModal";
import EmptyState from "../../components/EmptyState";
import { REVIEW_STAR_CLASS, ReviewStars } from "../../components/SellerReviewStars";
import { isListingVisibleInMarketplace } from "../../lib/listing-availability";
import { countSellerSales } from "../../lib/arrange-purchase-status";
import {
  loadReviewsForUser,
  reviewComment,
  reviewerDisplayName,
  type ProfileReview,
} from "../../lib/load-profile-reviews";
import {
  isEmailLike,
  sellerProfileDisplayName,
  stripAtPrefix,
} from "../../lib/public-display";
import { resolveSellerBySlug } from "../../lib/seller-profile-lookup";
import {
  isFullyVerifiedSeller,
  profileEmailVerified,
  profilePhoneVerified,
  profileIdVerified,
} from "../../lib/seller-verified";
import { parseFirestoreDate } from "../../lib/date-format";

interface ProfileData {
  uid?: string;
  username?: string;
  // displayName removed
  bio?: string;
  region?: string;
  photoURL?: string;
  bannerURL?: string;
  email?: string;
  discord?: string;
  instagram?: string;
  tiktok?: string;
  hideOnline?: boolean;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  kycStatus?: string;
  memberSince?: Timestamp;
  verified?: boolean;
  trustedSeller?: boolean;
  fastReply?: boolean;
  topTrader?: boolean;
  responseTime?: number;
  followers?: number;
  following?: number;
  profileViews?: number;
  profileBadge?: string;
  averageRating?: number;
  reviewCount?: number;
}

interface Listing {
  id: string;
  title: string;
  price: string;
  category?: string;
  imageUrl?: string;
  status?: string;
  condition?: string;
  location?: string;
  description?: string;
  createdAt?: Timestamp;
  sellerEmail?: string;
  pinned?: boolean;
  [key: string]: unknown;
}

interface Review extends ProfileReview {}

function timeAgo(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

export default function SellerPage() {
  const router = useRouter();
  const params = useParams();
  const routeSlug = decodeURIComponent((params.username as string) || "");

  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sellerPurchases, setSellerPurchases] = useState<
    Array<{ status?: string; paymentType?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [sellerUid, setSellerUid] = useState("");
  const [followerCount, setFollowerCount] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  // Load profile by username (case-insensitive via usernames/) or email
  useEffect(() => {
    if (!routeSlug) return;
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setSellerUid("");
    setListings([]);

    async function load() {
      try {
        // Try API endpoint first (server-side, bypasses Firestore rules)
        let profileData: ProfileData | null = null;
        let uid = "";

        try {
          const apiRes = await fetch(`/api/public-profile?slug=${encodeURIComponent(routeSlug)}`);
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            if (apiData.profile) {
              profileData = apiData.profile as ProfileData;
              uid = profileData.uid || "";
            }
          }
        } catch {}

        // Fall back to direct Firestore lookup if API fails
        if (!profileData) {
          const resolved = await resolveSellerBySlug(routeSlug);
          if (resolved) {
            profileData = resolved.data as ProfileData;
            uid = resolved.uid;
          }
        }

        if (!profileData) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        setProfile(profileData);
        setSellerUid(uid);
        setFollowerCount(profileData.followers ?? 0);

        // Fetch email from listings if not available from profile
        // (profile reads restricted to owner-only; email is public via listings)
        let email = profileData.email || "";
        if (!email && uid) {
          try {
            const listingSnap = await getDocs(
              query(collection(db, "listings"), where("sellerId", "==", uid), limit(1))
            );
            if (!listingSnap.empty) {
              email = listingSnap.docs[0].data().sellerEmail || "";
            }
          } catch {}
        }
        if (!email) {
          setLoading(false);
          return;
        }

        // Listings
        const listingsSnap = await getDocs(query(collection(db, "listings"), where("sellerEmail", "==", email)));
        const items = listingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Listing);
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        if (!cancelled) setListings(items);
      } catch (e) {
        console.error("Error loading seller profile:", e);
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [routeSlug]);

  // Canonical URL: replace email slugs only (keep lowercase username URLs working)
  useEffect(() => {
    if (!profile?.username) return;
    const canonical = stripAtPrefix(String(profile.username).trim());
    if (!canonical || isEmailLike(canonical)) return;
    if (isEmailLike(routeSlug) || routeSlug === profile.email) {
      router.replace(`/seller/${encodeURIComponent(canonical)}`);
    }
  }, [profile, routeSlug, router]);

  // Follow check
  useEffect(() => {
    if (!currentUser?.uid || !sellerUid) { setFollowing(false); return; }
    const unsub = onSnapshot(doc(db, "followers", `${sellerUid}_${currentUser.uid}`), (d) => {
      setFollowing(d.exists());
    });
    return () => unsub();
  }, [currentUser?.uid, sellerUid]);

  // Follower count comes from public profile API (updated after follow/unfollow)

  useEffect(() => {
    if (!profile?.email) {
      setSellerPurchases([]);
      return;
    }
    const q = query(
      collection(db, "purchases"),
      where("sellerEmail", "==", profile.email),
      limit(200)
    );
    getDocs(q).then((snap) => {
      setSellerPurchases(
        snap.docs.map((d) => d.data() as { status?: string; paymentType?: string })
      );
    });
  }, [profile?.email]);

  // Reviews
  useEffect(() => {
    if (!sellerUid && !profile?.email) return;
    loadReviewsForUser(sellerUid, profile?.email)
      .then((items) => setReviews(items as Review[]))
      .catch(() => setReviews([]));
  }, [sellerUid, profile?.email]);

  // Follow/unfollow
  async function toggleFollow() {
    if (!currentUser?.uid || !sellerUid) return;
    if (currentUser.uid === sellerUid) return;
    const newFollowing = !following;
    setFollowing(newFollowing);
    setFollowLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/follow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sellerUid,
          action: newFollowing ? "follow" : "unfollow",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to update follow status");
      }

      setFollowing(Boolean(data.following));
      if (typeof data.followerCount === "number") {
        setFollowerCount(data.followerCount);
      }
    } catch (e) {
      setFollowing(!newFollowing);
      console.error(e);
    }
    setFollowLoading(false);
  }

  // Block/unblock
  useEffect(() => {
    if (!currentUser?.uid || !sellerUid) return;
    getDoc(doc(db, "users", currentUser.uid, "blocked", sellerUid)).then((d) => setIsBlocked(d.exists())).catch((e) => console.error("Failed to check blocked status:", e));
  }, [currentUser?.uid, sellerUid]);

  async function toggleBlock() {
    if (!currentUser?.uid || !sellerUid) return;
    try {
      const ref = doc(db, "users", currentUser.uid, "blocked", sellerUid);
      if (isBlocked) {
        await deleteDoc(ref);
        setIsBlocked(false);
      } else {
        await setDoc(ref, { blockedUid: sellerUid, blockedEmail: profile?.email, createdAt: Timestamp.now() });
        setIsBlocked(true);
      }
    } catch (e) { console.error(e); }
  }

  // Computed
  const activeListings = useMemo(() => listings.filter((l) => isListingVisibleInMarketplace(l)), [listings]);
  const soldListings = useMemo(() => listings.filter((l) => !isListingVisibleInMarketplace(l)), [listings]);
  const completedSalesCount = useMemo(
    () => countSellerSales(sellerPurchases),
    [sellerPurchases]
  );
  const pinnedListings = useMemo(() => listings.filter((l) => l.pinned), [listings]);

  const avgRating = useMemo(() => {
    if (typeof profile?.averageRating === "number" && profile?.reviewCount) {
      return profile.averageRating;
    }
    return reviews.length > 0 ? reviews.reduce((t, r) => t + r.rating, 0) / reviews.length : 0;
  }, [profile, reviews]);

  const reviewCount =
    typeof profile?.reviewCount === "number" ? profile.reviewCount : reviews.length;

  const memberDate = useMemo(() => {
    if (!profile?.memberSince) return "";
    const date = parseFirestoreDate(profile.memberSince);
    return date
      ? date.toLocaleDateString("en-NZ", { year: "numeric", month: "short" })
      : "";
  }, [profile]);
  const displayName = sellerProfileDisplayName(profile, "Seller");
  const displayHandle = displayName === "Seller" ? displayName : `@${displayName}`;
  const initial = displayName.charAt(0).toUpperCase();

  const isFullyVerified = isFullyVerifiedSeller(profile);
  const isNotVerified = !isFullyVerified;

  // Rating distribution
  const ratingCounts = useMemo(() => {
    const c = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => { const k = Math.round(r.rating); if (k >= 1 && k <= 5) c[k as keyof typeof c]++; });
    return c;
  }, [reviews]);

  if (loading) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar />
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar />
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-12 text-center shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">Seller not found</h2>
            <p className="text-[var(--muted)] mb-6">
              The seller profile you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:bg-sky-600 hover:scale-105 active:scale-95"
            >
              Browse Listings
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const isOwn = currentUser?.email === profile.email;

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="space-y-6">

          {/* HEADER */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02]">
            {/* Banner */}
            <div className="relative h-24 sm:h-32 overflow-hidden">
              {profile.bannerURL ? (
                <img src={profile.bannerURL} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
            </div>

            <div className="relative px-5 pb-4">
              {/* Avatar */}
              <div className="absolute -top-11 left-5 sm:-top-14 sm:left-6">
                {profile.photoURL ? (
                  <img src={profile.photoURL} alt="" className="h-[72px] w-[72px] sm:h-24 sm:w-24 rounded-xl border-[3px] border-[var(--card)] object-cover shadow-[var(--shadow-sm)]" />
                ) : (
                  <div className="flex h-[72px] w-[72px] sm:h-24 sm:w-24 items-center justify-center rounded-xl border-[3px] border-[var(--card)] bg-gradient-to-br from-sky-500 via-sky-500 to-sky-600 text-2xl sm:text-3xl font-black text-[var(--foreground)] shadow-[var(--shadow-sm)]">{initial}</div>
                )}
              </div>

              <div className="pt-9 sm:pt-14">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-black tracking-tight text-[var(--foreground)]">
                    {displayName}
                  </h1>
                  {isFullyVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400 ring-1 ring-sky-500/25">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                      Verified
                    </span>
                  )}
                  {isNotVerified && (
                    <span className="group relative inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 ring-1 ring-red-500/20" title="This seller has not completed email, phone, and ID verification yet.">
                      Not Verified
                      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 rounded-lg bg-[var(--card)] px-2.5 py-1.5 text-[10px] text-[var(--foreground)] shadow-lg pointer-events-none z-10">
                        This seller has not completed email, phone, and ID verification yet.
                      </span>
                    </span>
                  )}
                  {!profile.hideOnline && (
                    <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Online
                    </span>
                  )}
                </div>
                <AwhinaUnderHeader className="mt-2" />

                <p className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">{displayHandle}</p>
                <p className="text-xs text-[var(--muted)]">
                  {memberDate && <span>Joined {memberDate}</span>}
                </p>

                {/* Trust signals */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {profile.trustedSeller && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-400">Trusted Seller</span>}
                  {profile.fastReply && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-400">Fast Reply</span>}
                  {profile.phoneVerified && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-400">Phone verified</span>}
                </div>

                {/* Stats row */}
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[
                    { icon: "rating", label: "Rating", value: avgRating > 0 ? avgRating.toFixed(1) : "—" },
                    { icon: null, label: "Sales", value: String(completedSalesCount) },
                    { icon: null, label: "Listings", value: String(activeListings.length) },
                    { icon: null, label: "Followers", value: String(followerCount) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-center">
                      <p className="text-sm font-bold text-[var(--foreground)]">{s.value}</p>
                      <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">
                        {s.icon === "rating" ? <span className={REVIEW_STAR_CLASS}>★ </span> : null}{s.label}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Follow + Message */}
                {!isOwn && currentUser ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={toggleFollow} disabled={followLoading}
                      className={`rounded-xl px-5 py-2.5 text-xs font-bold transition-all duration-200 ${
                        following
                          ? "border border-white/[0.08] bg-white/[0.03] text-[var(--foreground)] hover:bg-white/[0.06]"
                          : "btn btn-primary"
                      }`}>
                      {followLoading ? "..." : following ? "Following" : "Follow"}
                    </button>
                    <a
                      href={`/messages?user=${encodeURIComponent(profile.email || profile.username || "")}&source=seller-profile`}
                      className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-2.5 text-xs font-bold text-sky-400 transition hover:bg-sky-500/20"
                    >
                      Message Seller
                    </a>
                  </div>
                ) : !isOwn && (
                  <a href="/login"
                    className="mt-3 inline-block rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-xs font-bold text-zinc-400 transition hover:border-sky-500/30 hover:text-[var(--foreground)]">
                    Log in to follow or message
                  </a>
                )}

                {/* Report + Block */}
                {!isOwn && currentUser && (
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={() => setShowReportModal(true)}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-white/[0.03] hover:text-sky-400">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                      </svg>
                      Report
                    </button>
                    <button onClick={toggleBlock}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-400">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      {isBlocked ? "Unblock" : "Block"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Report Modal */}
          <ReportModal
            isOpen={showReportModal}
            onClose={() => setShowReportModal(false)}
            type="user"
            targetId={sellerUid}
            targetUserId={sellerUid}
            targetUserEmail={profile.email || ""}
            reporterUserId={currentUser?.uid || ""}
            reporterUserEmail={currentUser?.email || ""}
          />

          {/* ===== GRID ===== */}
          <div className="grid gap-6 lg:grid-cols-3">

            {/* LEFT */}
            <div className="space-y-6 lg:col-span-2">

              {/* Bio */}
              {profile.bio && (
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent" />
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">About</h2>
                  <p className="text-sm leading-relaxed text-[var(--foreground)]">{profile.bio}</p>
                </div>
              )}

              {/* Pinned Listings */}
              {pinnedListings.length > 0 && (
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent" />
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">Pinned</h2>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {pinnedListings.map((item) => (
                      <div key={item.id} onClick={() => router.push(`/post/listing/${item.id}`)}
                        className="group/card shrink-0 w-44 cursor-pointer overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.01] transition-all duration-300 hover:border-sky-500/40 hover:shadow-[0_0_20px_rgba(14,165,233,0.15)] hover:-translate-y-1">
                        {listingHasImage(item) ? (
                          <ListingImage
                            listing={item}
                            alt={item.title}
                            context={`SellerPinned:${item.id}`}
                            className="h-28 w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                          />
                        ) : (
                          <div className="flex h-28 items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-xs font-medium text-[var(--muted)]">No image</div>
                        )}
                        <div className="p-3">
                          <p className="truncate text-sm font-bold text-[var(--foreground)] group-hover/card:text-sky-300 transition-colors">{item.title}</p>
                          <p className="mt-0.5 text-sm font-bold text-sky-400">${item.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Listings */}
              <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent" />
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">
                  Listings ({activeListings.length})
                </h2>
                {activeListings.length === 0 ? (
                  <EmptyState
                    className="border-0 bg-transparent py-8"
                    title="No active listings"
                    description="This seller has no listings available right now."
                    actionLabel="Browse marketplace"
                    actionHref="/"
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {activeListings.map((item) => (
                      <div key={item.id} onClick={() => router.push(`/post/listing/${item.id}`)}
                        className="group/card cursor-pointer overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.01] transition-all duration-300 hover:border-sky-500/40 hover:shadow-[0_0_20px_rgba(14,165,233,0.15)] hover:-translate-y-1">
                        {listingHasImage(item) ? (
                          <ListingImage
                            listing={item}
                            alt={item.title}
                            context={`SellerPinned:${item.id}`}
                            className="h-28 w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                          />
                        ) : (
                          <div className="flex h-28 items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-xs font-medium text-[var(--muted)]">No image</div>
                        )}
                        <div className="p-3">
                          <div className="flex items-center gap-1.5">
                            {item.category && <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-400">{item.category}</span>}
                            {item.condition && <span className="rounded-full border border-white/[0.06] bg-[var(--soft-card)] px-2 py-0.5 text-[9px] font-medium text-[var(--muted)]">{item.condition}</span>}
                          </div>
                          <p className="mt-1.5 truncate text-sm font-bold text-[var(--foreground)] group-hover/card:text-sky-300 transition-colors">{item.title}</p>
                          <p className="mt-0.5 text-sm font-bold text-sky-400">${item.price}</p>
                          {item.location && <p className="text-[11px] font-medium text-[var(--muted)]">{item.location}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sold Listings */}
              {soldListings.length > 0 && (
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent" />
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">
                    Sold ({soldListings.length})
                  </h2>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {soldListings.map((item) => (
                      <div key={item.id} className="relative shrink-0 w-40 overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.01] opacity-75 hover:opacity-100 transition-opacity">
                        {listingHasImage(item) ? (
                          <ListingImage
                            listing={item}
                            alt={item.title}
                            context={`SellerSold:${item.id}`}
                            className="h-24 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-24 items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-xs font-medium text-[var(--muted)]">No image</div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <span className="rounded-full bg-sky-600/90 px-3 py-1 text-[10px] font-black text-white">Sold</span>
                        </div>
                        <div className="p-2.5">
                          <p className="truncate text-xs font-bold text-[var(--foreground)]">{item.title}</p>
                          <p className="mt-0.5 text-xs font-bold text-sky-400">${item.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT */}
            <div className="space-y-6">

              {/* Trust Panel */}
              <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)] ${isNotVerified ? 'border-red-500/30 animate-breathe-border' : 'border-white/[0.08]'}`}>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent" />
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">Trust &amp; Safety</h2>
                <div className="space-y-3">
                  {isFullyVerified ? (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-sky-500/20 text-[10px] ring-1 ring-sky-500/30">✓</span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">Verified Seller</p>
                        <p className="text-[10px] text-[var(--muted)]">Email, phone, and ID verified</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-red-500/30 to-red-500/20 text-[10px] ring-1 ring-red-500/30 animate-pulse-dot">!</span>
                      <div>
                        <p className="text-xs font-bold text-red-400">Not Verified</p>
                        <p className="text-[10px] text-[var(--muted)]">Complete email, phone, and ID verification</p>
                      </div>
                    </div>
                  )}
                  {profileEmailVerified(profile) ? (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-sky-500/20 text-[10px] ring-1 ring-sky-500/30">✉</span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">Email Verified</p>
                        <p className="text-[10px] text-[var(--muted)]">Email address confirmed</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--soft-card)] text-[10px] ring-1 ring-white/[0.06]">✉</span>
                      <div>
                        <p className="text-xs font-bold text-[var(--muted)]">Email Not Verified</p>
                        <p className="text-[10px] text-zinc-600">Email address not confirmed</p>
                      </div>
                    </div>
                  )}
                  {profilePhoneVerified(profile) ? (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-sky-500/20 text-[10px] ring-1 ring-sky-500/30">📱</span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">Phone Verified</p>
                        <p className="text-[10px] text-[var(--muted)]">Phone number confirmed</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--soft-card)] text-[10px] ring-1 ring-white/[0.06]">📱</span>
                      <div>
                        <p className="text-xs font-bold text-[var(--muted)]">Phone Not Verified</p>
                        <p className="text-[10px] text-zinc-600">Phone number not confirmed</p>
                      </div>
                    </div>
                  )}
                  {profileIdVerified(profile) ? (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-sky-500/20 text-[10px] ring-1 ring-sky-500/30">🪪</span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">ID Verified</p>
                        <p className="text-[10px] text-[var(--muted)]">Identity documents approved</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--soft-card)] text-[10px] ring-1 ring-white/[0.06]">🪪</span>
                      <div>
                        <p className="text-xs font-bold text-[var(--muted)]">ID Not Verified</p>
                        <p className="text-[10px] text-zinc-600">Identity verification not completed</p>
                      </div>
                    </div>
                  )}
                  {profile.trustedSeller && (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-[10px] ring-1 ring-sky-500/30 font-bold text-sky-400">★</span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">Trusted Trader</p>
                        <p className="text-[10px] text-[var(--muted)]">Recognized for reliable sales</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Social */}
              {(profile.discord || profile.instagram || profile.tiktok) && (
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent" />
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Links</h2>
                  <div className="space-y-2">
                    {profile.discord && <p className="text-sm font-medium text-[var(--foreground)]">Discord: {profile.discord}</p>}
                    {profile.instagram && <p className="text-sm font-medium text-[var(--foreground)]">Instagram: {profile.instagram}</p>}
                    {profile.tiktok && <p className="text-sm font-medium text-[var(--foreground)]">TikTok: {profile.tiktok}</p>}
                  </div>
                </div>
              )}

              {/* Reviews */}
              <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent" />
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">
                    Reviews ({reviewCount})
                  </h2>
                  {avgRating > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold">
                      <ReviewStars rating={avgRating} />
                      <span className="text-[var(--foreground)]">{avgRating.toFixed(1)}</span>
                    </span>
                  )}
                </div>

                {/* Rating bars */}
                {reviewCount > 0 && (
                  <div className="mb-4 space-y-1">
                    {[5,4,3,2,1].map((n) => {
                      const count = ratingCounts[n as keyof typeof ratingCounts];
                      const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                      return (
                        <div key={n} className="flex items-center gap-2 text-[11px]">
                          <span className="w-4 font-bold text-[var(--muted)]">{n}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--pill-bg)]">
                            <div className="h-full rounded-full bg-sky-500/70 transition-all duration-300" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-4 text-right font-medium text-[var(--muted)]">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="max-h-48 space-y-3 overflow-y-auto scrollbar-none">
                  {reviews.length === 0 ? (
                    <EmptyState
                      className="border-0 bg-transparent py-6"
                      title="No reviews yet"
                      description="Reviews from buyers and sellers will show up here."
                    />
                  ) : (
                    reviews.map((r) => (
                      <div key={r.id} className="rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[var(--foreground)]">
                            {reviewerDisplayName(r)}
                            {r.role === "seller" ? (
                              <span className="ml-1 font-medium text-[var(--muted)]">· Seller</span>
                            ) : null}
                          </span>
                          <ReviewStars rating={r.rating} size="sm" />
                        </div>
                        {reviewComment(r) && (
                          <p className="mt-1 text-xs leading-relaxed text-[var(--foreground)]">
                            {reviewComment(r)}
                          </p>
                        )}
                        {(r.createdAt as Timestamp | undefined)?.toMillis && (
                          <p className="mt-1 text-[10px] font-medium text-[var(--muted)]">
                            {timeAgo(Math.floor((r.createdAt as Timestamp).toMillis() / 1000))}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
