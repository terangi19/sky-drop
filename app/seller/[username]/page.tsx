"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
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
import { calculateTrustScore } from "../../lib/trustscore";

interface ProfileData {
  username?: string;
  displayName?: string;
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
  const username = decodeURIComponent((params.username as string) || "");

  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [sellerUid, setSellerUid] = useState("");
  const [followerCount, setFollowerCount] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [sellerReportsCount, setSellerReportsCount] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);

  // Load profile by username or email
  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    async function load() {
      try {
        let snap = await getDocs(query(collection(db, "profiles"), where("username", "==", username)));
        if (snap.empty) {
          snap = await getDocs(query(collection(db, "profiles"), where("email", "==", username)));
        }
        if (snap.empty) {
          const listingSnap = await getDocs(query(collection(db, "listings"), where("sellerEmail", "==", username), limit(1)));
          if (!listingSnap.empty) {
            const listingData = listingSnap.docs[0].data();
            snap = await getDocs(query(collection(db, "profiles"), where("email", "==", listingData.sellerEmail)));
          }
        }
        if (snap.empty || cancelled) { setLoading(false); return; }

        const doc_ = snap.docs[0];
        const data = doc_.data() as ProfileData;
        setProfile(data);
        setSellerUid(doc_.id);

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
  }, [username]);

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
  const activeListings = useMemo(() => listings.filter((l) => l.status !== "sold"), [listings]);
  const soldListings = useMemo(() => listings.filter((l) => l.status === "sold"), [listings]);
  const pinnedListings = useMemo(() => listings.filter((l) => l.pinned), [listings]);

  const avgRating = reviews.length > 0 ? (reviews.reduce((t, r) => t + r.rating, 0) / reviews.length) : 0;
  const stars = Math.floor(avgRating);
  const hasHalf = avgRating - stars >= 0.5;

  const memberDate = profile?.memberSince?.toDate().toLocaleDateString("en-NZ", { year: "numeric", month: "short" }) || "";
  const sellerEmail = profile?.email || "";
  const initial = (profile?.displayName || username || "?").charAt(0).toUpperCase();

  const trustScore = useMemo(() => {
    const memberDate = profile?.memberSince?.toDate ? profile.memberSince.toDate() : null;
    return calculateTrustScore({
      emailVerified: true,
      hasProfile: true,
      hasBio: !!profile?.bio,
      hasPhoto: !!profile?.photoURL,
      memberSince: memberDate,
      reportsCount: sellerReportsCount,
      salesCount: soldListings.length,
    });
  }, [profile, sellerReportsCount, soldListings.length]);

  const isNotVerified = !profile?.verified && !profile?.phoneVerified;

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
        <Background /><Navbar /><ThemeToggle />
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-12 text-center shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
            <p className="text-[var(--foreground)]">Seller not found.</p>
          </div>
        </div>
      </main>
    );
  }

  const isOwn = currentUser?.email === profile.email;

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><ThemeToggle />

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
                  <img src={profile.photoURL} alt="" className="h-[72px] w-[72px] sm:h-24 sm:w-24 rounded-xl border-[3px] border-zinc-900 object-cover shadow-[0_0_20px_rgba(14,165,233,0.2)]" />
                ) : (
                  <div className="flex h-[72px] w-[72px] sm:h-24 sm:w-24 items-center justify-center rounded-xl border-[3px] border-zinc-900 bg-gradient-to-br from-sky-500 via-violet-500 to-purple-600 text-2xl sm:text-3xl font-black text-[var(--foreground)] shadow-[0_0_20px_rgba(14,165,233,0.2)]">{initial}</div>
                )}
              </div>

              <div className="pt-9 sm:pt-14">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-black tracking-tight text-[var(--foreground)]">
                    {profile.displayName || username}
                  </h1>
                  {profile.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400 ring-1 ring-sky-500/25 shadow-[0_0_10px_rgba(14,165,233,0.15)]">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                      Verified
                    </span>
                  )}
                  {isNotVerified && (
                    <span className="group relative inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 ring-1 ring-red-500/20 animate-breathe-border" title="This seller has not completed phone or ID verification yet.">
                      Not Verified
                      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[10px] text-[var(--foreground)] shadow-lg animate-fade-in-up pointer-events-none z-10">
                        This seller has not completed phone or ID verification yet.
                      </span>
                    </span>
                  )}
                  {profile.topTrader && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/25">Top Trader</span>
                  )}
                  {profile.profileBadge === "epic" && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-400 ring-1 ring-violet-500/25">💎 Epic</span>
                  )}
                  {profile.profileBadge === "legendary" && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/25 shadow-[0_0_8px_rgba(251,146,60,0.2)] animate-breathe-orange">👑 The Five</span>
                  )}
                  {!profile.hideOnline && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">@{username}</p>
                <p className="text-xs text-[var(--muted)]">
                  {memberDate && <span>Joined {memberDate}</span>}
                </p>

                {/* Badges */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {profile.trustedSeller && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Trusted Seller</span>}
                  {profile.fastReply && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-400">Fast Reply</span>}
                  {profile.phoneVerified && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-400">Phone ✓</span>}
                  {profile.profileBadge === "epic" && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold text-violet-400 ring-1 ring-violet-500/25">💎 Epic</span>}
                  {profile.profileBadge === "legendary" && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-400 ring-1 ring-amber-500/25 shadow-[0_0_8px_rgba(251,146,60,0.2)] animate-breathe-orange">👑 The Five</span>}
                </div>

                {/* Stats row */}
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[
                    { icon: "★", label: "Rating", value: avgRating > 0 ? avgRating.toFixed(1) : "—" },
                    { icon: "💰", label: "Sales", value: String(soldListings.length) },
                    { icon: "📦", label: "Listings", value: String(activeListings.length) },
                    { icon: "👥", label: "Followers", value: String(followerCount) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 text-center transition-all duration-200 hover:bg-white/[0.04]">
                      <p className="text-sm font-black text-[var(--foreground)]">{s.value}</p>
                      <p className="text-[9px] font-medium text-[var(--muted)] uppercase tracking-wider">{s.icon} {s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Follow button */}
                {!isOwn && currentUser ? (
                  <button onClick={toggleFollow} disabled={followLoading}
                    className={`mt-3 rounded-xl px-5 py-2.5 text-xs font-bold transition-all duration-200 ${
                      following
                        ? "border border-zinc-700 bg-zinc-800/60 text-[var(--foreground)] hover:bg-zinc-700/60"
                        : "bg-sky-500 text-[var(--foreground)] hover:bg-sky-400"
                    }`}>
                    {followLoading ? "..." : following ? "Following" : "Follow"}
                  </button>
                ) : !isOwn && (
                  <a href="/login"
                    className="mt-3 inline-block rounded-xl border border-zinc-700 bg-zinc-800/40 px-5 py-2.5 text-xs font-bold text-[var(--muted)] transition hover:border-zinc-500 hover:text-[var(--foreground)]">
                    Log in to follow
                  </a>
                )}

                {/* Trust Score */}
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
                  <span className={`text-xs font-bold ${trustScore.color}`}>Trust Score: {trustScore.score}%</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${trustScore.color} bg-current/10`}>{trustScore.label}</span>
                </div>

                {/* Report + Block */}
                {!isOwn && currentUser && (
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={() => setShowReportModal(true)}
                      className="flex items-center gap-1.5 text-xs text-[var(--muted)] transition hover:text-amber-400">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                      </svg>
                      Report
                    </button>
                    <button onClick={toggleBlock}
                      className="flex items-center gap-1.5 text-xs text-[var(--muted)] transition hover:text-red-400">
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
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">About</h2>
                  <p className="text-sm leading-relaxed text-[var(--foreground)]">{profile.bio}</p>
                </div>
              )}

              {/* Pinned Listings */}
              {pinnedListings.length > 0 && (
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">📌 Pinned</h2>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {pinnedListings.map((item) => (
                      <div key={item.id} onClick={() => router.push(item.type === "service" ? "/services" : `/post/listing/${item.id}`)}
                        className="group/card shrink-0 w-44 cursor-pointer overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-800/30 transition-all duration-300 hover:border-sky-500/40 hover:shadow-[0_0_20px_rgba(14,165,233,0.15)]">
                        {item.images?.[0] || item.imageUrl || item.image ? (
                          <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-28 w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
                        ) : (
                          <div className="flex h-28 items-center justify-center bg-zinc-700/30 text-xs font-medium text-[var(--muted)]">No image</div>
                        )}
                        <div className="p-3">
                          <p className="truncate text-sm font-bold text-[var(--foreground)]">{item.title}</p>
                          <p className="mt-0.5 text-sm font-bold text-sky-300">${item.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Listings */}
              <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">
                  Listings ({activeListings.length})
                </h2>
                {activeListings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <svg className="mb-2 h-8 w-8 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    <p className="text-sm font-medium text-[var(--muted)]">No active listings</p>
                    <button onClick={() => router.push("/")} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                      Browse Marketplace
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {activeListings.map((item) => (
                      <div key={item.id} onClick={() => router.push(item.type === "service" ? "/services" : `/post/listing/${item.id}`)}
                        className="group/card cursor-pointer overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-800/30 transition-all duration-300 hover:border-sky-500/40 hover:shadow-[0_0_20px_rgba(14,165,233,0.15)]">
                        {item.images?.[0] || item.imageUrl || item.image ? (
                          <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-28 w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
                        ) : (
                          <div className="flex h-28 items-center justify-center bg-zinc-700/30 text-xs font-medium text-[var(--muted)]">No image</div>
                        )}
                        <div className="p-3">
                          <div className="flex items-center gap-1.5">
                            {item.category && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-400">{item.category}</span>}
                            {item.condition && <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[9px] font-medium text-[var(--muted)]">{item.condition}</span>}
                          </div>
                          <p className="mt-1.5 truncate text-sm font-bold text-[var(--foreground)]">{item.title}</p>
                          <p className="mt-0.5 text-sm font-bold text-sky-300">${item.price}</p>
                          {item.location && <p className="text-[11px] font-medium text-[var(--muted)]">📍 {item.location}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sold Listings */}
              {soldListings.length > 0 && (
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">
                    Sold ({soldListings.length})
                  </h2>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {soldListings.map((item) => (
                      <div key={item.id} className="relative shrink-0 w-40 overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-800/30 opacity-75">
                        {item.images?.[0] || item.imageUrl || item.image ? (
                          <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-24 w-full object-cover" />
                        ) : (
                          <div className="flex h-24 items-center justify-center bg-zinc-700/30 text-xs font-medium text-[var(--muted)]">No image</div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <span className="rounded-full bg-emerald-600/90 px-3 py-1 text-[10px] font-black text-[var(--foreground)]">Sold</span>
                        </div>
                        <div className="p-2.5">
                          <p className="truncate text-xs font-bold text-[var(--foreground)]">{item.title}</p>
                          <p className="mt-0.5 text-xs font-bold text-emerald-400">${item.price}</p>
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
              <div className={`overflow-hidden rounded-xl border bg-zinc-900/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)] ${isNotVerified ? 'border-red-500/30 animate-breathe-border' : 'border-zinc-700/50'}`}>
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">Trust &amp; Safety</h2>
                <div className="space-y-3">
                  {profile.verified ? (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-[10px]">✓</span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">Verified Seller</p>
                        <p className="text-[10px] text-[var(--muted)]">ID verification approved</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-[10px] animate-pulse-dot">!</span>
                      <div>
                        <p className="text-xs font-bold text-red-400">Not Verified</p>
                        <p className="text-[10px] text-[var(--muted)]">ID verification not completed</p>
                      </div>
                    </div>
                  )}
                  {profile.phoneVerified ? (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-[10px]">📱</span>
                      <div>
                        <p className="text-xs font-bold text-sky-400">Phone Verified</p>
                        <p className="text-[10px] text-[var(--muted)]">Phone number confirmed</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700/40 text-[10px]">📱</span>
                      <div>
                        <p className="text-xs font-bold text-[var(--muted)]">Phone Not Verified</p>
                        <p className="text-[10px] text-zinc-600">Phone number not confirmed</p>
                      </div>
                    </div>
                  )}
                  {profile.trustedSeller && (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[10px]">★</span>
                      <div>
                        <p className="text-xs font-bold text-emerald-400">Trusted Trader</p>
                        <p className="text-[10px] text-[var(--muted)]">Elite seller status</p>
                      </div>
                    </div>
                  )}
                  {profile.profileBadge === "epic" && (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-[10px]">💎</span>
                      <div>
                        <p className="text-xs font-bold text-violet-400">Epic Seller</p>
                        <p className="text-[10px] text-[var(--muted)]">Earned from Sky Crate</p>
                      </div>
                    </div>
                  )}
                  {profile.profileBadge === "legendary" && (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-[10px] animate-breathe-orange">👑</span>
                      <div>
                        <p className="text-xs font-bold text-amber-400">The Five</p>
                        <p className="text-[10px] text-[var(--muted)]">Ultimate Sky Crate reward</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Social */}
              {(profile.discord || profile.instagram || profile.tiktok) && (
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">Links</h2>
                  <div className="space-y-2">
                    {profile.discord && <p className="text-sm font-medium text-[var(--foreground)]">💬 Discord: {profile.discord}</p>}
                    {profile.instagram && <p className="text-sm font-medium text-[var(--foreground)]">📸 Instagram: {profile.instagram}</p>}
                    {profile.tiktok && <p className="text-sm font-medium text-[var(--foreground)]">🎵 TikTok: {profile.tiktok}</p>}
                  </div>
                </div>
              )}

              {/* Reviews */}
              <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">
                    Reviews ({reviews.length})
                  </h2>
                  {avgRating > 0 && (
                    <span className="text-xs font-bold text-amber-400">
                      {'★'.repeat(stars)}{hasHalf ? '½' : ''} {avgRating.toFixed(1)}
                    </span>
                  )}
                </div>

                {/* Rating bars */}
                {reviews.length > 0 && (
                  <div className="mb-4 space-y-1">
                    {[5,4,3,2,1].map((n) => {
                      const count = ratingCounts[n as keyof typeof ratingCounts];
                      const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                      return (
                        <div key={n} className="flex items-center gap-2 text-[11px]">
                          <span className="w-4 font-bold text-[var(--muted)]">{n}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-700/40">
                            <div className="h-full rounded-full bg-amber-500/70 transition-all duration-300" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-4 text-right font-medium text-[var(--muted)]">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="max-h-48 space-y-3 overflow-y-auto scrollbar-none">
                  {reviews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <svg className="mb-2 h-8 w-8 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                      <p className="text-sm font-medium text-[var(--muted)]">No reviews yet</p>
                    </div>
                  ) : (
                    reviews.map((r) => (
                      <div key={r.id} className="rounded-lg border border-zinc-700/30 bg-zinc-800/25 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[var(--foreground)]">{r.buyerName || r.buyerEmail?.split("@")[0] || "Anonymous"}</span>
                          <span className="text-[11px] font-bold text-amber-400">{'★'.repeat(Math.round(r.rating))}</span>
                        </div>
                        {r.comment && <p className="mt-1 text-xs leading-relaxed text-[var(--foreground)]">{r.comment}</p>}
                        {r.createdAt?.toMillis && (
                          <p className="mt-1 text-[10px] font-medium text-[var(--muted)]">{timeAgo(Math.floor(r.createdAt.toMillis() / 1000))}</p>
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
