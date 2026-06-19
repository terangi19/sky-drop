"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import { AwhinaUnderHeader } from "../../components/AwhinaOnlineBadge";
import ThemeToggle from "../../components/ThemeToggle";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useParams } from "next/navigation";
import ReportModal from "../../components/ReportModal";
import { REVIEW_STAR_CLASS, ReviewStars } from "../../components/SellerReviewStars";
import { calculateTrustScore } from "../../lib/trustscore";
import { isListingVisibleInMarketplace } from "../../lib/listing-availability";
import { countSellerSales } from "../../lib/arrange-purchase-status";
import {
  isEmailLike,
  sellerProfileDisplayName,
  stripAtPrefix,
} from "../../lib/public-display";
import { resolveSellerBySlug } from "../../lib/seller-profile-lookup";
import {
  isFullyVerifiedSeller,
  profileEmailVerified,
  profileKycApproved,
  profilePhoneVerified,
} from "../../lib/seller-verified";

interface ProfileData {
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
  memberSince?: Timestamp;
  verified?: boolean;
  kycStatus?: string;
  trustedSeller?: boolean;
  fastReply?: boolean;
  topTrader?: boolean;
  responseTime?: number;
  followers?: number;
  following?: number;
  profileViews?: number;
  profileBadge?: string;
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

interface Review {
  id: string;
  rating: number;
  comment?: string;
  buyerEmail?: string;
  buyerName?: string;
  createdAt?: Timestamp;
  [key: string]: unknown;
}

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
  const [sellerReportsCount, setSellerReportsCount] = useState(0);
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
        const resolved = await resolveSellerBySlug(routeSlug);
        if (!resolved || cancelled) {
          if (!cancelled) setLoading(false);
          return;
        }

        const data = resolved.data as ProfileData;
        setProfile(data);
        setSellerUid(resolved.uid);

        const email = data.email;
        if (!email) { setLoading(false); return; }

        // Listings
        const listingsSnap = await getDocs(query(collection(db, "listings"), where("sellerEmail", "==", email)));
        const items = listingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Listing);
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        if (!cancelled) setListings(items);
      } catch (e) { console.error(e); }
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

  // Follower count from profile
  useEffect(() => {
    if (!sellerUid) { setFollowerCount(0); return; }
    const unsub = onSnapshot(doc(db, "profiles", sellerUid), (d) => {
      if (d.exists()) setFollowerCount(d.data().followers ?? 0);
    });
    return () => unsub();
  }, [sellerUid]);

  // Count reports for this seller
  useEffect(() => {
    if (!profile?.email) return;
    const q = query(collection(db, "reports"), where("reportedUserEmail", "==", profile.email), where("status", "==", "pending"));
    const unsub = onSnapshot(q, (snap) => setSellerReportsCount(snap.size));
    return () => unsub();
  }, [profile?.email]);

  useEffect(() => {
    if (!profile?.email) {
      setSellerPurchases([]);
      return;
    }
    const q = query(
      collection(db, "purchases"),
      where("sellerEmail", "==", profile.email)
    );
    const unsub = onSnapshot(q, (snap) => {
      setSellerPurchases(
        snap.docs.map((d) => d.data() as { status?: string; paymentType?: string })
      );
    });
    return () => unsub();
  }, [profile?.email]);

  // Reviews
  useEffect(() => {
    if (!profile?.email) return;
    const q = query(collection(db, "reviews"), where("sellerEmail", "==", profile.email));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review);
      items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setReviews(items);
    });
    return () => unsub();
  }, [profile?.email]);

  // Follow/unfollow
  async function toggleFollow() {
    if (!currentUser?.uid || !sellerUid) return;
    if (currentUser.uid === sellerUid) return;
    const newFollowing = !following;
    setFollowing(newFollowing);
    setFollowLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, "followers", `${sellerUid}_${currentUser.uid}`);
        const profileRef = doc(db, "profiles", sellerUid);
        if (newFollowing) {
          transaction.set(ref, {
            sellerId: sellerUid,
            followerId: currentUser.uid,
            sellerEmail: profile?.email,
            followerEmail: currentUser.email,
            createdAt: Timestamp.now(),
          });
          transaction.update(profileRef, { followers: increment(1) });
        } else {
          const profileSnap = await transaction.get(profileRef);
          const currentFollowers = profileSnap.data()?.followers ?? 0;
          if (currentFollowers <= 0) return;
          transaction.delete(ref);
          transaction.update(profileRef, { followers: increment(-1) });
        }
      });
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

  const avgRating = reviews.length > 0 ? (reviews.reduce((t, r) => t + r.rating, 0) / reviews.length) : 0;
  const stars = Math.floor(avgRating);
  const hasHalf = avgRating - stars >= 0.5;

  const memberDate = profile?.memberSince?.toDate().toLocaleDateString("en-NZ", { year: "numeric", month: "short" }) || "";
  const sellerEmail = profile?.email || "";
  const displayName = sellerProfileDisplayName(profile, "Seller");
  const displayHandle = displayName === "Seller" ? displayName : `@${displayName}`;
  const initial = displayName.charAt(0).toUpperCase();

  const trustScore = useMemo(() => {
    const memberDate = profile?.memberSince?.toDate ? profile.memberSince.toDate() : null;
    return calculateTrustScore({
      emailVerified: profileEmailVerified(profile),
      hasProfile: true,
      hasBio: !!profile?.bio,
      hasPhoto: !!profile?.photoURL,
      memberSince: memberDate,
      reportsCount: sellerReportsCount,
      salesCount: completedSalesCount,
    });
  }, [profile, sellerReportsCount, completedSalesCount]);

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
        <Background /><Navbar /><ThemeToggle />
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="flex items-center justify-center py-32">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-sky-500/30 border-t-sky-400" />
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar /><ThemeToggle />
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-16 text-center shadow-[0_0_80px_-20px_rgba(14,165,233,0.08)]">
            <p className="text-lg font-medium text-[var(--muted)]">Seller not found.</p>
          </div>
        </div>
      </main>
    );
  }

  const isOwn = currentUser?.email === profile.email;

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><ThemeToggle />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="space-y-6">

          {/* ═══ HERO HEADER ═══ */}
          <div className="group relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent shadow-[0_0_120px_-30px_rgba(14,165,233,0.1)]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(14,165,233,0.08),transparent)] pointer-events-none" />

            {/* Banner */}
            <div className="relative h-36 sm:h-52 overflow-hidden">
              {profile.bannerURL ? (
                <img src={profile.bannerURL} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-sky-950/60 via-[#0a0a1a] to-violet-950/40" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--background)]" />
              <div className="absolute inset-0 bg-gradient-to-r from-sky-500/[0.03] to-violet-500/[0.03]" />
            </div>

            <div className="relative px-6 sm:px-10 pb-8">
              {/* Avatar */}
              <div className="absolute -top-14 left-6 sm:-top-16 sm:left-10">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-sky-400/30 via-sky-500/20 to-violet-500/30 blur-sm" />
                  {profile.photoURL ? (
                    <img src={profile.photoURL} alt="" className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border-[3px] border-[var(--background)] object-cover shadow-[0_8px_32px_rgba(0,0,0,0.4)]" />
                  ) : (
                    <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-2xl border-[3px] border-[var(--background)] bg-gradient-to-br from-sky-500 via-sky-400 to-violet-500 text-3xl sm:text-4xl font-black text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)]">{initial}</div>
                  )}
                  {!profile.hideOnline && (
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--background)] bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-14 sm:pt-16">
                {/* Name + Badges */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                    <span className="bg-gradient-to-r from-white via-sky-100 to-white bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(56,189,248,0.15)]">
                      {displayName}
                    </span>
                  </h1>
                  {profile.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-400 ring-1 ring-sky-500/20 backdrop-blur-sm shadow-[0_0_12px_rgba(14,165,233,0.15)]">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                      Verified
                    </span>
                  )}
                  {isNotVerified && (
                    <span className="group/tip relative inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-400 ring-1 ring-red-500/20 animate-breathe-border" title="This seller has not completed phone or ID verification yet.">
                      Not Verified
                      <span className="invisible group-hover/tip:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-xl bg-zinc-800/95 px-3 py-2 text-[10px] text-[var(--foreground)] shadow-xl backdrop-blur-sm animate-fade-in-up pointer-events-none z-10 border border-white/[0.06]">
                        This seller has not completed phone or ID verification yet.
                      </span>
                    </span>
                  )}
                  {profile.topTrader && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/20">Top Trader</span>
                  )}
                  {profile.profileBadge === "epic" && (
                    <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold text-violet-400 ring-1 ring-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.15)]">💎 Epic</span>
                  )}
                  {profile.profileBadge === "legendary" && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/20 shadow-[0_0_12px_rgba(251,146,60,0.2)] animate-breathe-orange">👑 The Five</span>
                  )}
                </div>

                <p className="mt-1 text-sm font-semibold text-zinc-400">{displayHandle}</p>
                <p className="text-[11px] text-zinc-500 tracking-wide">
                  {memberDate && <span>Member since {memberDate}</span>}
                </p>

                {/* Mini Badges */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {profile.trustedSeller && <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-bold text-emerald-400 ring-1 ring-emerald-500/15">Trusted Seller</span>}
                  {profile.fastReply && <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[9px] font-bold text-sky-400 ring-1 ring-sky-500/15">Fast Reply</span>}
                  {profile.phoneVerified && <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[9px] font-bold text-sky-400 ring-1 ring-sky-500/15">Phone Verified</span>}
                </div>

                {/* ── Stats Row ── */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Rating", value: avgRating > 0 ? avgRating.toFixed(1) : "—", sub: reviews.length > 0 ? `${reviews.length} reviews` : "No reviews" },
                    { label: "Sales", value: String(completedSalesCount), sub: "Completed" },
                    { label: "Listings", value: String(activeListings.length), sub: "Active" },
                    { label: "Followers", value: String(followerCount), sub: "Following" },
                  ].map((s) => (
                    <div key={s.label} className="group/stat relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-4 text-center transition-all duration-300 hover:border-sky-500/20 hover:shadow-[0_0_30px_-10px_rgba(14,165,233,0.12)]">
                      <p className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">{s.value}</p>
                      <p className="mt-0.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{s.label}</p>
                      <p className="text-[9px] text-zinc-600">{s.sub}</p>
                    </div>
                  ))}
                </div>

                {/* ── Actions Row ── */}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {!isOwn && currentUser ? (
                    <button onClick={toggleFollow} disabled={followLoading}
                      className={`rounded-xl px-6 py-2.5 text-xs font-bold transition-all duration-300 ${
                        following
                          ? "border border-white/[0.08] bg-white/[0.04] text-[var(--foreground)] hover:bg-white/[0.08]"
                          : "bg-gradient-to-r from-sky-500 to-sky-400 text-white shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 hover:shadow-xl active:scale-[0.97]"
                      }`}>
                      {followLoading ? "..." : following ? "Following" : "Follow"}
                    </button>
                  ) : !isOwn && (
                    <a href="/login"
                      className="inline-block rounded-xl border border-white/[0.08] bg-white/[0.04] px-6 py-2.5 text-xs font-bold text-[var(--muted)] transition-all duration-300 hover:border-sky-500/20 hover:text-[var(--foreground)]">
                      Log in to follow
                    </a>
                  )}

                  {/* Trust Score Pill */}
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                    <div className="h-2 w-16 overflow-hidden rounded-full bg-zinc-800">
                      <div className={`h-full rounded-full transition-all duration-500 ${trustScore.score >= 80 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : trustScore.score >= 50 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-red-500 to-red-400'}`} style={{ width: `${trustScore.score}%` }} />
                    </div>
                    <span className={`text-[11px] font-bold ${trustScore.color}`}>{trustScore.score}%</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${trustScore.color} bg-current/10`}>{trustScore.label}</span>
                  </div>

                  {/* Report + Block */}
                  {!isOwn && currentUser && (
                    <div className="flex items-center gap-2 ml-auto">
                      <button onClick={() => setShowReportModal(true)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium text-zinc-500 transition-all hover:bg-white/[0.04] hover:text-amber-400">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                        </svg>
                        Report
                      </button>
                      <button onClick={toggleBlock}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium text-zinc-500 transition-all hover:bg-white/[0.04] hover:text-red-400">
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

          {/* ═══ GRID ═══ */}
          <div className="grid gap-6 lg:grid-cols-3">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-6 lg:col-span-2">

              {/* Bio */}
              {profile.bio && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_0_60px_-20px_rgba(14,165,233,0.06)]">
                  <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">About</h2>
                  <p className="text-sm leading-relaxed text-zinc-300">{profile.bio}</p>
                </div>
              )}

              {/* Pinned Listings */}
              {pinnedListings.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_0_60px_-20px_rgba(14,165,233,0.06)]">
                  <h2 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Pinned</h2>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {pinnedListings.map((item) => (
                      <div key={item.id} onClick={() => router.push(item.type === "service" ? "/services" : `/post/listing/${item.id}`)}
                        className="group/card shrink-0 w-48 cursor-pointer overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all duration-300 hover:border-sky-500/25 hover:shadow-[0_0_30px_-8px_rgba(14,165,233,0.12)]">
                        {item.images?.[0] || item.imageUrl || item.image ? (
                          <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-32 w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
                        ) : (
                          <div className="flex h-32 items-center justify-center bg-white/[0.02] text-xs font-medium text-zinc-600">No image</div>
                        )}
                        <div className="p-3.5">
                          <p className="truncate text-sm font-bold text-[var(--foreground)]">{item.title}</p>
                          <p className="mt-0.5 text-sm font-black bg-gradient-to-r from-sky-400 to-sky-300 bg-clip-text text-transparent">${item.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Listings */}
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_0_60px_-20px_rgba(14,165,233,0.06)]">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    Listings
                  </h2>
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-bold text-zinc-400">{activeListings.length}</span>
                </div>
                {activeListings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                      <svg className="h-6 w-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    </div>
                    <p className="text-sm font-medium text-zinc-500">No active listings</p>
                    <button onClick={() => router.push("/")} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition-all hover:shadow-xl active:scale-[0.97]">
                      Browse Marketplace
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {activeListings.map((item) => (
                      <div key={item.id} onClick={() => router.push(item.type === "service" ? "/services" : `/post/listing/${item.id}`)}
                        className="group/card cursor-pointer overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all duration-300 hover:border-sky-500/25 hover:shadow-[0_0_30px_-8px_rgba(14,165,233,0.12)]">
                        {item.images?.[0] || item.imageUrl || item.image ? (
                          <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-36 w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
                        ) : (
                          <div className="flex h-36 items-center justify-center bg-white/[0.02] text-xs font-medium text-zinc-600">No image</div>
                        )}
                        <div className="p-4">
                          <div className="flex items-center gap-1.5">
                            {item.category && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-400 ring-1 ring-sky-500/15">{item.category}</span>}
                            {item.condition && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-medium text-zinc-500">{item.condition}</span>}
                          </div>
                          <p className="mt-2 truncate text-sm font-bold text-[var(--foreground)]">{item.title}</p>
                          <p className="mt-0.5 text-sm font-black bg-gradient-to-r from-sky-400 to-sky-300 bg-clip-text text-transparent">${item.price}</p>
                          {item.location && <p className="mt-1 text-[11px] font-medium text-zinc-500">{item.location}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sold Listings */}
              {soldListings.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_0_60px_-20px_rgba(14,165,233,0.06)]">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Sold</h2>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">{soldListings.length}</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {soldListings.map((item) => (
                      <div key={item.id} className="relative shrink-0 w-44 overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.02]">
                        {item.images?.[0] || item.imageUrl || item.image ? (
                          <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-28 w-full object-cover opacity-60" />
                        ) : (
                          <div className="flex h-28 items-center justify-center bg-white/[0.02] text-xs font-medium text-zinc-600">No image</div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                          <span className="rounded-full bg-emerald-500/90 px-3.5 py-1 text-[10px] font-black text-white shadow-lg shadow-emerald-500/20">Sold</span>
                        </div>
                        <div className="p-3">
                          <p className="truncate text-xs font-bold text-[var(--foreground)]">{item.title}</p>
                          <p className="mt-0.5 text-xs font-bold text-emerald-400">${item.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-6">

              {/* Trust & Safety Panel */}
              <div className={`overflow-hidden rounded-2xl border bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_0_60px_-20px_rgba(14,165,233,0.06)] ${isNotVerified ? 'border-red-500/20 animate-breathe-border' : 'border-white/[0.06]'}`}>
                <h2 className="mb-5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Trust &amp; Safety</h2>
                <div className="space-y-4">
                  {profile.verified ? (
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
                        <svg className="h-4 w-4 text-sky-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">Verified Seller</p>
                        <p className="text-[10px] text-zinc-500">ID verification approved</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20 animate-pulse-dot">
                        <span className="text-sm text-red-400">!</span>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-red-400">Not Verified</p>
                        <p className="text-[10px] text-zinc-500">ID verification not completed</p>
                      </div>
                    </div>
                  )}
                  {profile.phoneVerified ? (
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
                        <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">Phone Verified</p>
                        <p className="text-[10px] text-zinc-500">Phone number confirmed</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]">
                        <svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-zinc-500">Phone Not Verified</p>
                        <p className="text-[10px] text-zinc-600">Phone number not confirmed</p>
                      </div>
                    </div>
                  )}
                  {profile.trustedSeller && (
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                        <span className="text-sm">★</span>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-emerald-400">Trusted Trader</p>
                        <p className="text-[10px] text-zinc-500">Elite seller status</p>
                      </div>
                    </div>
                  )}
                  {profile.profileBadge === "epic" && (
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                        <span className="text-sm">💎</span>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-violet-400">Epic Seller</p>
                        <p className="text-[10px] text-zinc-500">Earned from Sky Crate</p>
                      </div>
                    </div>
                  )}
                  {profile.profileBadge === "legendary" && (
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 animate-breathe-orange">
                        <span className="text-sm">👑</span>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-amber-400">The Five</p>
                        <p className="text-[10px] text-zinc-500">Ultimate Sky Crate reward</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Social Links */}
              {(profile.discord || profile.instagram || profile.tiktok) && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_0_60px_-20px_rgba(14,165,233,0.06)]">
                  <h2 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Links</h2>
                  <div className="space-y-2.5">
                    {profile.discord && (
                      <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.04] px-3.5 py-2.5">
                        <span className="text-sm">💬</span>
                        <span className="text-xs font-medium text-zinc-300">{profile.discord}</span>
                      </div>
                    )}
                    {profile.instagram && (
                      <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.04] px-3.5 py-2.5">
                        <span className="text-sm">📸</span>
                        <span className="text-xs font-medium text-zinc-300">{profile.instagram}</span>
                      </div>
                    )}
                    {profile.tiktok && (
                      <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.04] px-3.5 py-2.5">
                        <span className="text-sm">🎵</span>
                        <span className="text-xs font-medium text-zinc-300">{profile.tiktok}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reviews */}
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_0_60px_-20px_rgba(14,165,233,0.06)]">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    Reviews
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-bold text-zinc-400">{reviews.length}</span>
                    {avgRating > 0 && (
                      <span className="text-xs font-bold text-amber-400">
                        {'★'.repeat(stars)}{hasHalf ? '½' : ''} {avgRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Rating bars */}
                {reviews.length > 0 && (
                  <div className="mb-5 space-y-1.5">
                    {[5,4,3,2,1].map((n) => {
                      const count = ratingCounts[n as keyof typeof ratingCounts];
                      const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                      return (
                        <div key={n} className="flex items-center gap-2.5 text-[11px]">
                          <span className="w-3 font-bold text-zinc-500">{n}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                            <div className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-amber-400/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-4 text-right font-medium text-zinc-600">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="max-h-56 space-y-3 overflow-y-auto scrollbar-none">
                  {reviews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                        <svg className="h-6 w-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                      </div>
                      <p className="text-sm font-medium text-zinc-500">No reviews yet</p>
                    </div>
                  ) : (
                    reviews.map((r) => (
                      <div key={r.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition-all duration-200 hover:bg-white/[0.04]">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[var(--foreground)]">{r.buyerName || "Verified Buyer"}</span>
                          <span className="text-[11px] font-bold text-amber-400">{'★'.repeat(Math.round(r.rating))}</span>
                        </div>
                        {(r.comment || (r as { reviewText?: string }).reviewText) && (
                          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                            {r.comment || (r as { reviewText?: string }).reviewText}
                          </p>
                        )}
                        {r.createdAt?.toMillis && (
                          <p className="mt-1.5 text-[10px] font-medium text-zinc-600">{timeAgo(Math.floor(r.createdAt.toMillis() / 1000))}</p>
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
