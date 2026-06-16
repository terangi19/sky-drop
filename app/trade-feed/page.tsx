"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";
import Background from "../components/Background";
import CheckoutModal from "../components/CheckoutModal";
import PromoteModal from "../components/PromoteModal";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { User } from "firebase/auth";
import { auth, db, storage, onAuthStateChanged } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { checkImage } from "../lib/nsfw";
import { showToast } from "../components/Toast";
import { checkShout } from "../lib/shoutFilter";
import confetti from "canvas-confetti";
import { playOffer, playSuccess, playClick } from "../lib/sounds";
import { createNotification } from "../lib/notifications";
import { useProfile } from "../contexts/ProfileContext";
import { REVIEW_STAR_CLASS } from "../components/SellerReviewStars";

const WORLDS = [
  { id: "all", label: "Categories", icon: "🌐", accent: "border-sky-500/20", glow: "shadow-[0_0_12px_rgba(14,165,233,0.06)]", color: "from-sky-400" },
  { id: "gaming", label: "Gaming", icon: "🎮", accent: "border-sky-500/20", glow: "shadow-[0_0_20px_rgba(14,165,233,0.12)]", color: "from-sky-400" },
  { id: "cars", label: "Cars", icon: "🚗", accent: "border-zinc-400/20", glow: "shadow-[0_0_20px_rgba(161,161,170,0.12)]", color: "from-zinc-300" },
  { id: "fashion", label: "Fashion", icon: "👟", accent: "border-sky-400/20", glow: "shadow-[0_0_20px_rgba(251,113,133,0.12)]", color: "from-sky-400" },
  { id: "tech", label: "Tech", icon: "💻", accent: "border-blue-400/20", glow: "shadow-[0_0_20px_rgba(96,165,250,0.12)]", color: "from-blue-400" },
  { id: "collector", label: "Collector", icon: "⭐", accent: "border-sky-400/20", glow: "shadow-[0_0_20px_rgba(251,191,36,0.12)]", color: "from-sky-400" },
  { id: "digital", label: "Digital", icon: "📥", accent: "border-sky-400/20", glow: "shadow-[0_0_20px_rgba(14,165,233,0.12)]", color: "from-sky-400" },
];

const SUBCATEGORIES: Record<string, string[]> = {
  all: [],
  gaming: ["In-Game Collectibles", "PC Parts", "Consoles", "Gaming Setups"],
  cars: ["Wheels", "Parts", "Cars", "Performance", "Detailing", "Tools"],
  fashion: ["Sneakers", "Streetwear", "Designer", "Vintage", "Accessories"],
  tech: ["Phones", "PCs", "Cameras", "Audio", "Smart Home"],
  collector: ["Cards", "Figures", "Memorabilia", "Rare Items"],
  digital: ["Templates & Assets", "E-books & Guides", "Art & Photography", "Software & Audio", "Gaming & 3D", "Web & App Development", "Graphic Design", "SEO & Digital Marketing", "Other Digital Services"],
};

const QUICK_REPLIES = ["Still available?", "Can pickup tonight.", "Sent offer.", "PM me", "Price negotiable?", "Trade?", "Interested"];

function formatTime(ts: any) {
  if (!ts?.seconds) return "Now";
  const diff = Math.floor(Date.now() / 1000) - ts.seconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getTypePill(type: string) {
  if (type === "WTB") return "bg-sky-500/15 text-sky-400";
  if (type === "Trading") return "bg-sky-500/15 text-sky-400";
  return "bg-sky-500/15 text-sky-400";
}

export default function TradeFeedPage() {
  const router = useRouter();
  const { username } = useProfile();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
  const [search, setSearch] = useState("");
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  const [showComposer, setShowComposer] = useState(false);
  const [type, setType] = useState("WTS");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);

  const [pickupAvailable, setPickupAvailable] = useState(false);
  const [pickupArea, setPickupArea] = useState("");
  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [shippingFee, setShippingFee] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);

  const [checkoutPost, setCheckoutPost] = useState<any>(null);
  const [promotePost, setPromotePost] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const [liveEvents, setLiveEvents] = useState<Array<{id: number; text: string; icon: string; world?: string}>>([]);
  const eventId = useRef(0);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<any[] | null>(null);
  const [shouts, setShouts] = useState<any[]>([]);
  const [shoutText, setShoutText] = useState("");
  const shoutsEndRef = useRef<HTMLDivElement>(null);
  const shoutsAtBottom = useRef(true);
  const lastShoutTime = useRef(0);
  const lastOfferTime = useRef(0);
  const lastPostTime = useRef(0);
  const knownSoldIds = useRef(new Set<string>());
  const knownHotIds = useRef(new Set<string>());
  const knownShoutCount = useRef(0);
  const lastClaimUsername = useRef<string | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [showImagesOnly, setShowImagesOnly] = useState(false);
  const [showMyTrades, setShowMyTrades] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [statusFilter, setStatusFilter] = useState("all");
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [customReplies, setCustomReplies] = useState<string[]>([]);
  const [addingReply, setAddingReply] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("customQuickReplies");
    if (saved) {
      try { setCustomReplies(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("customQuickReplies", JSON.stringify(customReplies));
  }, [customReplies]);

  // Load persisted filters
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tradeFilters");
      if (saved) {
        const f = JSON.parse(saved);
        if (f.minPrice !== undefined) setMinPrice(f.minPrice);
        if (f.maxPrice !== undefined) setMaxPrice(f.maxPrice);
        if (f.showImagesOnly !== undefined) setShowImagesOnly(f.showImagesOnly);
        if (f.sortBy) setSortBy(f.sortBy);
        if (f.statusFilter) setStatusFilter(f.statusFilter);
        if (f.selectedWorld) setSelectedWorld(f.selectedWorld);
        if (f.selectedFilter) setSelectedFilter(f.selectedFilter);
        if (f.selectedType) setSelectedType(f.selectedType);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("tradeFilters", JSON.stringify({
      minPrice, maxPrice, showImagesOnly, sortBy, statusFilter,
      selectedWorld, selectedFilter, selectedType,
    }));
  }, [minPrice, maxPrice, showImagesOnly, sortBy, statusFilter, selectedWorld, selectedFilter, selectedType]);

  // Seller review stats
  const [sellerReviewStats, setSellerReviewStats] = useState<Record<string, { avg: number; count: number }>>({});
  const [sellerBadges, setSellerBadges] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "tradePosts"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPostsLoaded(true);
    }, (err) => {
      console.error("Trade posts error:", err);
      setPostsLoaded(true);
    });
    return () => unsub();
  }, []);

  // Fetch seller review stats
  useEffect(() => {
    const uniqueEmails = [...new Set(posts.map((p: any) => p.sellerEmail).filter(Boolean))] as string[];
    if (uniqueEmails.length === 0) return;
    const fetchStats = async () => {
      const stats: Record<string, { avg: number; count: number }> = {};
      for (const email of uniqueEmails) {
        try {
          const snap = await getDocs(query(collection(db, "reviews"), where("sellerEmail", "==", email)));
          const ratings: number[] = [];
          snap.docs.forEach((d) => { const r = d.data().rating; if (r) ratings.push(Number(r)); });
          if (ratings.length > 0) stats[email] = { avg: ratings.reduce((a, b) => a + b, 0) / ratings.length, count: ratings.length };
        } catch {}
      }
      setSellerReviewStats(stats);
    };
    fetchStats();
  }, [posts.length]);

  // Fetch seller profile badges (legendary/epic)
  useEffect(() => {
    const uniqueEmails = [...new Set(posts.map((p: any) => p.sellerEmail).filter(Boolean))] as string[];
    if (uniqueEmails.length === 0) return;
    const fetchBadges = async () => {
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
  }, [posts.length]);

  // Live event ticker for new posts
  useEffect(() => {
    if (posts.length === 0) return;
    const latest = posts[0];
    if (latest && latest.createdAt && (Date.now() / 1000 - latest.createdAt.seconds) < 10) {
      const id = ++eventId.current;
      const worldName = WORLDS.find((w) => w.id === latest.world)?.label || "";
      setLiveEvents((prev) => [{ id, icon: "📢", text: `${latest.title} posted${worldName ? ` in ${worldName}` : ""}` }, ...prev].slice(0, 20));
      setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 8000);
    }
  }, [posts.length]);

  // Sold items → live events
  useEffect(() => {
    posts.forEach((p: any) => {
      if (p.status === "sold" && !knownSoldIds.current.has(p.id)) {
        knownSoldIds.current.add(p.id);
        const id = ++eventId.current;
        setLiveEvents((prev) => [{ id, icon: "💰", text: `${p.title} sold` }, ...prev].slice(0, 20));
        setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 8000);
      }
    });
  }, [posts]);

  // Shouts → live events
  useEffect(() => {
    if (shouts.length > knownShoutCount.current) {
      const newShouts = shouts.slice(knownShoutCount.current);
      knownShoutCount.current = shouts.length;
      for (const s of newShouts) {
        const id = ++eventId.current;
        const name = (s.by || "?").split("@")[0];
        setLiveEvents((prev) => [{ id, icon: "💬", text: `${name}: "${(s.text || "").slice(0, 60)}"` }, ...prev].slice(0, 20));
        setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 8000);
      }
    }
  }, [shouts]);

  // Legendary badge claims → live events
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "platform"), (snap) => {
      const data = snap.data();
      const claim = data?.lastLegendaryClaim;
      if (claim?.username && claim.username !== lastClaimUsername.current) {
        lastClaimUsername.current = claim.username;
        const id = ++eventId.current;
        setLiveEvents((prev) => [{ id, icon: "⚡", text: `${claim.username} unlocked 👑 The Five` }, ...prev].slice(0, 20));
        setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 10000);
      }
    });
    return () => unsub();
  }, []);

  // Shouts — real-time world chat
  useEffect(() => {
    const worldFilter = selectedWorld.length === 1 && selectedWorld[0] !== "all" ? selectedWorld[0] : "__general__";
    const q = query(collection(db, "tradeShouts"), where("world", "==", worldFilter), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setShouts(items);
    });
    return () => unsub();
  }, [selectedWorld]);

  // Shoutbox auto-clear old shouts (older than 1 hour) every 5 minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const cutoff = Date.now() / 1000 - 3600;
        const q = query(collection(db, "tradeShouts"), where("createdAt", "<", cutoff), limit(50));
        const snap = await getDocs(q);
        if (snap.empty) return;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(doc(db, "tradeShouts", d.id)));
        await batch.commit();
      } catch (e) {
        console.error("Shoutbox auto-clear failed:", e);
      }
    }, 300000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll shoutbox to bottom
  useEffect(() => {
    if (shoutsAtBottom.current) {
      shoutsEndRef.current?.scrollTo({ top: shoutsEndRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [shouts]);

  useEffect(() => {
    if (!expandedPost) { setExpandedReplies(null); return; }
    const unsub = onSnapshot(doc(db, "tradePosts", expandedPost), (snap) => {
      if (snap.exists()) setExpandedReplies(snap.data().replies || []);
    });
    return () => unsub();
  }, [expandedPost]);

  function handleShoutsScroll() {
    const el = shoutsEndRef.current;
    if (!el) return;
    shoutsAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  }

  async function sendShout(text?: string) {
    const msg = (text || shoutText).trim();
    if (!msg || !user?.email) return;
    if (Date.now() - lastShoutTime.current < 2000) {
      showToast("Please wait before sending another message", "info");
      return;
    }
    const check = checkShout(msg);
    if (!check.clean) {
      showToast("⚠️ Watch your language! Swearing can result in a temporary suspension or ban.", "error");
      return;
    }
    lastShoutTime.current = Date.now();
    try {
      const token = await user.getIdToken();
      await fetch("/api/create-trade-shout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: msg,
          world: selectedWorld.length === 1 && selectedWorld[0] !== "all" ? selectedWorld[0] : "__general__",
        }),
      });
    } catch (e) { console.error("Failed to send shout:", e); }
    if (!text) setShoutText("");
    playClick();
  }

  async function postTrade() {
    if (!user?.email || !title) return;
    if (Date.now() - lastPostTime.current < 10000) {
      showToast("Please wait 10 seconds between posts", "info");
      return;
    }
    // Check if user is restricted
    try {
      const profileSnap = await getDoc(doc(db, "profiles", user?.uid));
      if (profileSnap.exists() && (profileSnap.data().restricted === true || profileSnap.data().restricted === "true")) {
        showToast("Your account is restricted. You cannot create posts.", "error");
        return;
      }
    } catch {}
    lastPostTime.current = Date.now();
    setPosting(true);
    try {
      const images: string[] = [];
      for (const file of imageFiles) {
        const nsfwResult = await checkImage(file);
        if (!nsfwResult.safe) {
          showToast(`"${file.name}" flagged: ${nsfwResult.reason}. Remove it and try again.`, "error");
          setPosting(false);
          return;
        }
        const storageRef = ref(storage, `trade_posts/${user?.uid}/${Date.now()}_${file.name}`);
        const snap = await uploadBytes(storageRef, file);
        images.push(await getDownloadURL(snap.ref));
      }
      const token = await user.getIdToken();
      await fetch("/api/create-trade-post", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type, title, price: price || "", message: message || "",
          world: selectedWorld.length === 1 ? selectedWorld[0] : null,
          category: selectedFilter !== "All" ? selectedFilter : null,
          images,
          pickupAvailable, shippingAvailable, pickupArea,
          shippingFee: shippingAvailable && shippingFee ? Number(shippingFee) : null,
          freeShipping: shippingAvailable ? freeShipping : false,
        }),
      });
      setTitle(""); setPrice(""); setMessage(""); setImageFiles([]); setImagePreviews([]); setShowComposer(false);
      setPickupAvailable(false); setShippingAvailable(false); setPickupArea(""); setShippingFee(""); setFreeShipping(false);
    } catch (e) { console.error(e); }
    setPosting(false);
  }

  async function deleteTrade(id: string) {
    if (!confirm("Delete this trade post? This cannot be undone.")) return;
    const post = posts.find((p) => p.id === id);
    if (!post || post.sellerEmail !== user?.email) {
      showToast("You can only delete your own posts", "error");
      return;
    }
    try {
      const token = await user!.getIdToken();
      await fetch("/api/manage-trade-post", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "delete", postId: id }),
      });
    } catch (e) { console.error(e); }
  }

  async function updateTradeStatus(id: string, status: string) {
    try {
      const token = await user!.getIdToken();
      await fetch("/api/manage-trade-post", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "status", postId: id, status }),
      });
      showToast(`Marked as ${status}`, "success");
      playSuccess();
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
    } catch { showToast("Failed to update status", "error"); }
  }

  async function addReply(postId: string, text: string) {
    if (!text.trim() || !user?.email) return;
    try {
      const token = await user.getIdToken();
      await fetch("/api/manage-trade-post", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "reply", postId, text: text.trim() }),
      });
      await createNotification({
        type: "message",
        targetEmail: post?.sellerEmail || "",
        fromEmail: user.email,
        title: "New reply on your trade",
        message: `${username || user.email?.split("@")[0] || "Someone"}: ${text.trim().slice(0, 100)}`,
        listingId: postId,
        listingTitle: post?.title || "a trade",
      }).catch((err) => console.error("Failed to add notification:", err));
      setReplyTexts((prev) => ({ ...prev, [postId]: "" }));
      const id = ++eventId.current;
      setLiveEvents((prev) => [{ id, icon: "💬", text: `New reply on ${post?.title || "a trade"}` }, ...prev].slice(0, 20));
      setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 8000);
    } catch (e) { console.error(e); }
  }

  async function sendOffer(postId: string) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (Date.now() - lastOfferTime.current < 5000) {
      showToast("Please wait before sending another offer", "info");
      return;
    }
    lastOfferTime.current = Date.now();
    await updateDoc(doc(db, "tradePosts", postId), { offers: (post.offers || 0) + 1 });
    showToast("Offer sent!", "success");
    playOffer();
    confetti({ particleCount: 30, spread: 50, origin: { y: 0.5 } });
    createNotification({
      targetEmail: post.sellerEmail,
      fromEmail: user!.email!,
      type: "offer",
      title: "New offer received! 💰",
      message: `${username || user?.email?.split("@")[0] || "Someone"} sent an offer on "${post.title}".`,
      listingId: post.id,
      listingTitle: post.title,
      listingImage: post.images?.[0] || post.image || "",
    });
    const id = ++eventId.current;
    setLiveEvents((prev) => [{ id, icon: "💰", text: `Offer received on ${post.title}` }, ...prev].slice(0, 20));
    setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 8000);
  }

  async function toggleWatchlist(post: any) {
    if (!user?.uid) { showToast("Sign in first", "info"); return; }
      const ref_ = doc(db, "users", user?.uid, "watchlist", post?.id);
    try {
      const snap = await getDoc(ref_);
      if (snap.exists()) { await deleteDoc(ref_); showToast("Removed from watchlist", "info"); }
      else {
        await setDoc(ref_, { id: post.id, title: post.title, price: String(post.price || ""), imageUrl: post.images?.[0] || post.image || "", savedAt: new Date().toISOString() });
        showToast("Added to watchlist");
      }
    } catch {}
  }

  const hotPosts = useMemo(() => {
    return posts.filter((p) => {
      const replies = Array.isArray(p.replies) ? p.replies.length : 0;
      const offers = p.offers || 0;
      return (replies + offers) >= 2 || p.status === "hot";
    });
  }, [posts]);

  // Trending items → live events
  useEffect(() => {
    (hotPosts as any[]).forEach((p: any) => {
      if (!knownHotIds.current.has(p.id)) {
        knownHotIds.current.add(p.id);
        const id = ++eventId.current;
        setLiveEvents((prev) => [{ id, icon: "🔥", text: `${p.title} is trending` }, ...prev].slice(0, 20));
        setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 8000);
      }
    });
  }, [hotPosts.length]);

  const trends = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => { if (p.world) counts[p.world] = (counts[p.world] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return sorted.map(([world, count]) => ({
      world, label: WORLDS.find((w) => w.id === world)?.label || world,
      icon: WORLDS.find((w) => w.id === world)?.icon || "🌐", count,
      change: count > 0 ? "+" + count + "%" : "0%",
    }));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    let items = posts;
    if (selectedWorld.length > 0 && !selectedWorld.includes("all")) items = items.filter((p) => selectedWorld.includes(p.world));
    if (selectedFilter !== "All") items = items.filter((p) => p.category === selectedFilter);
    if (selectedType === "WTS") items = items.filter((p) => p.type === "WTS");
    else if (selectedType === "WTB") items = items.filter((p) => p.type === "WTB");
    else if (selectedType === "Trading") items = items.filter((p) => p.type === "Trading");
    if (showMyTrades && user?.email) items = items.filter((p) => p.sellerEmail === user.email);
    if (showImagesOnly) items = items.filter((p) => (p.images?.length > 0) || p.image);
    if (statusFilter === "all") items = items.filter((p) => p.status !== "sold" && p.status !== "completed");
    else if (statusFilter === "active") items = items.filter((p) => p.status === "live" || !p.status);
    else if (statusFilter === "sold") items = items.filter((p) => p.status === "sold");
    else if (statusFilter === "completed") items = items.filter((p) => p.status === "completed");
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((p) => p.title?.toLowerCase().includes(q) || p.message?.toLowerCase().includes(q));
    }
    if (minPrice) items = items.filter((p) => Number(p.price) >= Number(minPrice));
    if (maxPrice) items = items.filter((p) => Number(p.price) <= Number(maxPrice));
    const now = Date.now();
    items.sort((a: any, b: any) => {
      const aProm = a.promotedUntil?.toMillis?.() > now ? 1 : 0;
      const bProm = b.promotedUntil?.toMillis?.() > now ? 1 : 0;
      if (aProm !== bProm) return bProm - aProm;
      if (sortBy === "replies") return (b.replies?.length || 0) - (a.replies?.length || 0);
      if (sortBy === "price_low") return Number(a.price) - Number(b.price);
      if (sortBy === "price_high") return Number(b.price) - Number(a.price);
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
    return items;
  }, [posts, selectedWorld, selectedFilter, selectedType, search, showMyTrades, showImagesOnly, minPrice, maxPrice, user?.email, sortBy, statusFilter]);

  const activeWorldColor = selectedWorld.length === 1 ? WORLDS.find((w) => w.id === selectedWorld[0])?.color || "from-sky-400" : "from-red-400";
  const activeWorldGlow = selectedWorld.length === 1 ? WORLDS.find((w) => w.id === selectedWorld[0])?.glow || "" : "";

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-[1600px] px-4 pb-8 pt-6">
        {/* ── PAGE TITLE ── */}
        <div className="relative mb-6 text-center">
          <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/5 via-sky-500/5 to-transparent blur-3xl pointer-events-none" />
          <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
            <span className="text-white drop-shadow-[0_0_12px_rgba(14,165,233,0.25)]">Trade Live</span>
          </h1>
          <AwhinaUnderHeader centered />
            <p className="relative mt-3 text-sm text-zinc-400 leading-relaxed max-w-xl mx-auto">A real-time community marketplace where members post, trade, and negotiate live. Browse active listings, make offers, and connect with buyers and sellers as deals happen — all in one feed.</p>
        </div>

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 h-2 w-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">Live</span>
            </div>
            <span className="h-3 w-px bg-zinc-800" />
            <span className="text-xs font-mono text-zinc-600">{String(posts.length).padStart(2, '0')} trades</span>
          </div>

          {/* Live event ticker */}
          <div className="hidden lg:flex items-center gap-2 flex-1 max-w-md overflow-hidden justify-center">
            {liveEvents.slice(0, 1).map((ev) => (
              <span key={ev.id} className="flex items-center gap-1.5 shrink-0 rounded-full bg-white/[0.03] border border-white/[0.05] px-3 py-1 text-[10px] text-zinc-400"
                style={{ animation: "fadeIn 0.3s ease-out" }}>
                {ev.icon} {ev.text}
              </span>
            ))}
          </div>

          <div className="relative group">
            <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600 group-focus-within:text-sky-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search trades..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-36 lg:w-48 rounded-xl border border-white/[0.06] bg-white/[0.02] py-2.5 pl-9 pr-3 text-xs text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.04] transition-all" />
          </div>
        </div>

        {/* ── WORLDS ── */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none justify-center">
          {WORLDS.map((world) => (
            <button key={world.id}
              onClick={() => {
                if (world.id === "all") setSelectedWorld([]);
                else setSelectedWorld((prev) => prev.includes(world.id) ? prev.filter((w) => w !== world.id) : [...prev, world.id]);
                setSelectedFilter("All");
              }}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
                (world.id === "all" && selectedWorld.length === 0) || selectedWorld.includes(world.id)
                  ? "text-sky-400 bg-sky-500/[0.06] border border-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.06)]"
                  : "text-zinc-500 border border-transparent hover:text-zinc-300 hover:bg-white/[0.02] hover:border-white/[0.06]"
              }`}>
              <span className="opacity-80">{world.icon}</span>
              <span className="font-semibold">{world.label}</span>
              {world.id !== "all" && <span className="text-[10px] text-zinc-600 font-mono">{posts.filter((p) => p.world === world.id).length}</span>}
            </button>
          ))}
        </div>

        {/* ── FILTER TOOLBAR ── */}
        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.01] px-3.5 py-2.5">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {SUBCATEGORIES[selectedWorld.length === 1 ? selectedWorld[0] : "all"]?.map((cat) => (
              <button key={cat} onClick={() => setSelectedFilter(selectedFilter === cat ? "All" : cat)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                  selectedFilter === cat ? "bg-white/[0.06] text-[var(--foreground)]" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                }`}>{cat}</button>
            ))}
          </div>
          <div className="w-px h-4 bg-white/[0.04]" />
          <div className="flex gap-0.5">
            {["All", "WTS", "WTB", "Trading"].map((t) => (
              <button key={t} onClick={() => setSelectedType(t)}
                title={t === "WTS" ? "Want to Sell" : t === "WTB" ? "Want to Buy" : t === "Trading" ? "Open to trades" : ""}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                  selectedType === t
                    ? t === "WTB" ? "text-sky-400 bg-sky-500/[0.06]" : t === "Trading" ? "text-sky-400 bg-sky-500/[0.06]" : "text-sky-400 bg-sky-500/[0.06]"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                }`}>{t === "All" ? "All" : t}</button>
            ))}
          </div>
          <div className="w-px h-4 bg-white/[0.04]" />
          <div className="flex items-center gap-1.5">
            <input type="number" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
              className="w-12 rounded-lg border border-white/[0.04] bg-white/[0.02] px-1.5 py-1.5 text-[11px] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 text-[var(--foreground)]" />
            <span className="text-[10px] text-zinc-600">–</span>
            <input type="number" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
              className="w-12 rounded-lg border border-white/[0.04] bg-white/[0.02] px-1.5 py-1.5 text-[11px] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 text-[var(--foreground)]" />
          </div>
          <div className="w-px h-4 bg-white/[0.04]" />
          <button onClick={() => setShowMyTrades(!showMyTrades)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${showMyTrades ? "text-sky-400 bg-sky-500/[0.06]" : "text-zinc-500 hover:text-zinc-300"}`}>My Trades</button>
        </div>
        <p className="text-[10px] text-zinc-600 text-center mt-2">WTS = Want to Sell · WTB = Want to Buy · Trading = Open to offers</p>

        {/* ── MAIN CONTENT ── */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_240px]">
          {/* ── FEED ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-[var(--foreground)] tracking-tight">
                  {selectedWorld.length === 1 ? WORLDS.find((w) => w.id === selectedWorld[0])?.label : "All Trades"}
                </h2>
                <span className="h-3 w-px bg-white/[0.04]" />
                <span className="text-[11px] font-mono text-zinc-600">{String(filteredPosts.length).padStart(2, '0')}</span>
                {hotPosts.length > 0 && <span className="text-[11px] font-medium text-sky-400/80">🔥 {hotPosts.length} hot</span>}
              </div>
              <div className="flex items-center gap-2">
                {["all", "active"].map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition ${
                      statusFilter === s
                        ? s === "active" ? "text-sky-400 bg-sky-500/[0.06]" : "text-sky-400 bg-sky-500/[0.06]"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}>{s === "all" ? "All" : s}</button>
                ))}
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-[var(--foreground)] outline-none focus:border-sky-500/30 cursor-pointer">
                  <option value="newest">Newest</option>
                  <option value="replies">Most Replies</option>
                  <option value="price_low">Price: Low</option>
                  <option value="price_high">Price: High</option>
                </select>
                <button onClick={() => setShowComposer(!showComposer)}
                  className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2 text-[11px] font-bold text-white transition-all hover:shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:brightness-110 active:scale-[0.97]">
                  {showComposer ? "Cancel" : "+ New Post"}
                </button>
              </div>
            </div>

            {/* ── COMPOSER ── */}
            {showComposer && (
              <div className="mb-4 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-5">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Create Trade Post</p>
                <div className="flex gap-1.5 mb-3">
                  {["WTS", "WTB", "Trading"].map((t) => (
                    <button key={t} onClick={() => setType(t)}
                      className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
                        type === t ? "bg-sky-500 text-white" : "bg-white/[0.04] text-zinc-500 hover:text-[var(--foreground)]"
                      }`}>{t}</button>
                  ))}
                </div>
                <input type="text" placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.04] transition-all mb-2" />
                <div className="flex gap-2 mb-3">
                  {type !== "Trading" && (
                    <input type="text" placeholder={type === "WTB" ? "Budget" : "Price"} value={price} onChange={(e) => setPrice(e.target.value)}
                      className="w-28 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.04] transition-all" />
                  )}
                  <textarea placeholder="Description (optional)" value={message} onChange={(e) => e.target.value.length <= 300 && setMessage(e.target.value)} rows={2} maxLength={300}
                    className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.04] transition-all resize-none" />
                  <span className="self-end text-[10px] text-zinc-600 pb-1">{message.length}/300</span>
                </div>
                {/* Delivery + upload row */}
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex cursor-pointer items-center gap-1 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08] has-[:checked]:border-sky-500/40 has-[:checked]:bg-sky-500/[0.06] has-[:checked]:text-sky-400 transition-all">
                    <input type="checkbox" checked={pickupAvailable} onChange={(e) => setPickupAvailable(e.target.checked)} className="hidden" />📍 Pickup
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08] has-[:checked]:border-sky-500/40 has-[:checked]:bg-sky-500/[0.06] has-[:checked]:text-sky-400 transition-all">
                    <input type="checkbox" checked={shippingAvailable} onChange={(e) => setShippingAvailable(e.target.checked)} className="hidden" />📦 Ship
                  </label>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08] transition-all">📷 {imageFiles.length > 0 && `(${imageFiles.length})`}</button>
                  <div className="flex-1" />
                  <button onClick={postTrade} disabled={posting || !title}
                    className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-2.5 text-xs font-bold text-white transition-all hover:shadow-[0_0_20px_rgba(14,165,233,0.3)] disabled:opacity-50">
                    {posting ? "Posting..." : "Post"}
                  </button>
                </div>
                {imagePreviews.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {imagePreviews.map((preview, i) => (
                      <div key={i} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
                        <img src={preview} alt="" className="h-full w-full object-cover" />
                        <button onClick={() => { setImageFiles((prev) => prev.filter((_, j) => j !== i)); setImagePreviews((prev) => prev.filter((_, j) => j !== i)); }}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600/80 text-[8px] text-white opacity-0 transition group-hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const remaining = 4 - imagePreviews.length;
                    const toAdd = files.slice(0, remaining);
                    for (const file of toAdd) {
                      const reader = new FileReader();
                      reader.onload = () => setImagePreviews((prev) => [...prev, reader.result as string]);
                      reader.readAsDataURL(file);
                    }
                    setImageFiles((prev) => [...prev, ...toAdd]);
                    if (e.target) e.target.value = "";
                  }} className="hidden" />
                {(pickupAvailable || shippingAvailable) && (
                  <div className="mt-2 flex gap-2">
                    {pickupAvailable && (
                      <input type="text" placeholder="Pickup area/suburb" value={pickupArea} onChange={(e) => setPickupArea(e.target.value)}
                        className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[10px] text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.04] transition-all" />
                    )}
                    {shippingAvailable && (
                      <div className="flex gap-1.5">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">$</span>
                          <input type="number" placeholder="Fee" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)}
                            className="w-20 rounded-xl border border-white/[0.06] bg-white/[0.02] py-1.5 pl-5 pr-2 text-[10px] text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.04] transition-all" />
                        </div>
                        <label className="flex cursor-pointer items-center gap-1 rounded-xl border border-white/[0.04] bg-white/[0.02] px-2 py-1.5 text-[9px] text-zinc-500 has-[:checked]:text-sky-400 transition-all">
                          <input type="checkbox" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} className="hidden" />Free
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── TRADE CARDS ── */}
            <div className="space-y-3 relative"
              onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; setPullDistance(0); }}
                  onTouchMove={(e) => { const dist = e.touches[0].clientY - touchStartY.current; if (dist > 0 && window.scrollY === 0) { setPullDistance(Math.min(dist, 120)); if (dist > 80) navigator.vibrate?.(10); } }}
              onTouchEnd={() => { if (pullDistance > 80) { setIsRefreshing(true); setPullDistance(0); setTimeout(() => setIsRefreshing(false), 1000); } else { setPullDistance(0); } }}
            >
              {isRefreshing && (
                <div className="flex items-center justify-center py-4">
                  <div className="flex items-center gap-2.5 text-xs text-zinc-500">
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Refreshing
                  </div>
                </div>
              )}
              {pullDistance > 0 && !isRefreshing && (
                <div className="flex items-center justify-center py-2 transition-all" style={{ transform: `translateY(${pullDistance * 0.5}px)` }}>
                  <span className={`text-[10px] font-mono tracking-wider transition-opacity ${pullDistance > 80 ? "text-sky-400" : "text-zinc-600"}`}>
                    {pullDistance > 80 ? "↕ release to refresh" : "↓ pull to refresh"}
                  </span>
                </div>
              )}
              {!postsLoaded ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4 rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4 animate-pulse">
                      <div className="h-20 w-20 shrink-0 rounded-xl bg-white/[0.04]" />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex gap-2">
                          <div className="h-3 w-16 rounded bg-white/[0.04]" />
                          <div className="h-3 w-12 rounded bg-white/[0.04]" />
                        </div>
                        <div className="h-5 w-3/4 rounded bg-white/[0.04]" />
                        <div className="h-4 w-1/2 rounded bg-white/[0.04]" />
                        <div className="flex gap-3">
                          <div className="h-5 w-16 rounded bg-white/[0.04]" />
                          <div className="h-5 w-16 rounded bg-white/[0.04]" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] py-20 text-center">
                  <div className="text-5xl mb-4 opacity-30">📦</div>
                  <p className="text-sm text-zinc-500">No trades here yet.</p>
                  <button onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => setShowComposer(true), 300); }}
                    className="mt-5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3 text-xs font-bold text-white transition-all hover:shadow-[0_0_20px_rgba(14,165,233,0.3)]">
                    + Create your first trade post
                  </button>
                </div>
              ) : (
                filteredPosts.map((post, index) => {
                  const isNew = post.createdAt && (Date.now() - (post.createdAt?.seconds || 0) * 1000) < 300000;
                  const isExpanded = expandedPost === post.id;
                  const replies = isExpanded && expandedReplies ? expandedReplies : (Array.isArray(post.replies) ? post.replies : []);
                  const replyCount = replies.length;
                  const offers = post.offers || 0;
                  const isHot = hotPosts.includes(post);
                  const worldData = WORLDS.find((w) => w.id === post.world);
                  const stats = sellerReviewStats[post.sellerEmail || ""];
                  const postViews = post.views || 0;
                  const postOffers = post.offers || 0;
                  const isPopular = post.promotedUntil?.toMillis?.() > Date.now() || postViews >= 10;
                  const imgs = post.images || (post.image ? [post.image] : []);
                  const sellerName = post.sellerUsername?.split("@")[0] || post.sellerEmail?.split("@")[0];

                  return (
                    <div key={post.id}>
                      <div
                        onClick={() => { setSwipedId(null); setExpandedPost(isExpanded ? null : post.id); }}
                        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                        onTouchEnd={(e) => {
                          const dx = touchStartX.current - e.changedTouches[0].clientX;
                          if (dx > 60) { setSwipedId(post.id); e.preventDefault(); }
                          else if (dx < -30) setSwipedId(null);
                          touchStartX.current = 0;
                        }}
                        className={`group relative flex gap-4 rounded-2xl border p-4 transition-all duration-300 cursor-pointer overflow-hidden ${
                          isNew ? "border-sky-500/20" : isPopular ? "border-sky-500/15" : "border-white/[0.04]"
                        } bg-white/[0.015] hover:bg-white/[0.03] hover:border-white/[0.08] hover:shadow-xl hover:shadow-black/30`}
                      >
                        {/* Glass top highlight */}
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                        {/* Status indicator dot */}
                        {isNew && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-sky-400 to-transparent" />}
                        {isPopular && !isNew && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-sky-400 to-transparent" />}

                        {/* Swipe actions overlay */}
                        {swipedId === post.id && (
                          <div className="absolute inset-0 z-20 flex items-center justify-end gap-2 rounded-2xl bg-black/70 backdrop-blur-md px-4" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => { setExpandedPost(post.id); setSwipedId(null); }}
                              className="rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-[var(--foreground)] hover:bg-white/[0.08] transition">💬 Chat</button>
                            {user?.email !== post.sellerEmail && (
                              <>
                                {post.price && <button onClick={() => { setCheckoutPost(post); setSwipedId(null); }}
                                  className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2.5 text-xs font-bold text-white">🛒 Buy</button>}
                                <button onClick={() => { sendOffer(post.id); setSwipedId(null); }}
                                  className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-2.5 text-xs font-bold text-sky-400">💰 Offer</button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Image */}
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.02] cursor-pointer ring-1 ring-white/[0.04]" onClick={(e) => { e.stopPropagation(); if (imgs.length > 0) { setLightboxImages(imgs); setLightboxIndex(0); setLightboxImg(imgs[0]); } }}>
                          {imgs.length > 0 ? (
                            <img src={imgs[0]} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-lg text-zinc-600">
                              {post.badgeForSale === "legendary" ? "👑" : post.badgeForSale === "epic" ? "💎" : post.type === "WTB" ? "🛒" : post.type === "Trading" ? "🔄" : "💰"}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getTypePill(post.type)}`}>{post.type}</span>
                            {post.status === "sold" && <span className="rounded-md bg-red-500/[0.08] px-2 py-0.5 text-[10px] font-medium text-red-400">Sold</span>}
                            {isNew && <span className="text-[10px] font-medium text-sky-400">New</span>}
                            <span className="text-[10px] text-zinc-600 ml-auto font-mono">{formatTime(post.createdAt)}</span>
                          </div>

                          <h3 className="mt-1.5 text-[15px] font-bold text-[var(--foreground)] leading-snug tracking-tight">{post.title}</h3>
                          {post.message && !isExpanded && <p className="mt-0.5 text-sm text-zinc-500 truncate">{post.message}</p>}
                          {replies.length > 0 && !isExpanded && (
                            <p className="mt-0.5 text-xs text-zinc-600 truncate">💬 {replies[replies.length - 1].username || replies[replies.length - 1].by?.split("@")[0] || "Someone"}: {replies[replies.length - 1].text}</p>
                          )}

                          {/* Price + Stats */}
                          <div className="mt-2.5 flex items-center gap-4">
                            {post.price && <span className="text-xl font-black text-sky-400 tracking-tight">${post.price}</span>}
                            <div className="flex items-center gap-2.5 text-[11px] text-zinc-600">
                              <span>👁 {postViews}</span>
                              {replyCount > 0 && <span>💬 {replyCount}</span>}
                              {offers > 0 && <span>💰 {offers}</span>}
                            </div>
                          </div>

                          {/* Seller + Actions row */}
                          <div className="mt-2.5 flex items-center gap-2 text-xs">
                            <Link href={`/seller/${post.sellerUsername || post.sellerEmail}`} onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 text-zinc-500 hover:text-sky-400 transition-colors">
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-500 text-[8px] font-bold text-white">
                                {sellerName?.charAt(0).toUpperCase() || "?"}
                              </div>
                              <span className="font-medium text-zinc-400">{sellerName}</span>
                              {sellerBadges[post.sellerEmail || ""] === "legendary" && <span className="rounded bg-sky-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold text-sky-400">👑 The Five</span>}
                              {stats && stats.count > 0 && (
                                <span className="inline-flex items-center gap-0.5">
                                  <span className={REVIEW_STAR_CLASS}>★</span>
                                  <span className="text-white">{stats.avg.toFixed(1)}</span>
                                </span>
                              )}
                            </Link>
                            <span className="text-zinc-700">·</span>
                            {post.pickupAvailable && <span className="text-zinc-600">📍 {post.pickupArea || "Pickup"}</span>}
                            {post.shippingAvailable && <span className="text-zinc-600">{post.freeShipping ? "🚚 Free" : `📦 $${post.shippingFee || ""}`}</span>}

                            <div className="ml-auto flex items-center gap-1.5">
                              {user?.email !== post.sellerEmail && post.price && (
                                <button onClick={(e) => { e.stopPropagation(); setCheckoutPost(post); }}
                                  className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-3.5 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-[0_0_12px_rgba(14,165,233,0.2)] active:scale-95">Buy</button>
                              )}
                              {user?.email !== post.sellerEmail && (
                                <Link href={`/messages?user=${encodeURIComponent(post.sellerUsername || post.sellerEmail || "")}&listing=${encodeURIComponent(post.id)}`} onClick={(e) => e.stopPropagation()}
                                  className="rounded-xl border border-white/[0.06] px-3.5 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-[var(--foreground)] hover:border-white/[0.12] transition">Chat</Link>
                              )}
                              {user?.email === post.sellerEmail && (
                                <button onClick={(e) => { e.stopPropagation(); setPromotePost(post); }}
                                  className="rounded-xl border border-sky-500/20 px-3.5 py-1.5 text-[10px] font-bold text-sky-400 hover:bg-sky-500/[0.06] transition">📈 Promote</button>
                              )}
                              <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === post.id ? null : post.id); }}
                                  className="rounded-xl p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] transition">
                                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                                </button>
                                {menuOpen === post.id && (
                                  <div className="absolute right-0 top-8 z-50 w-36 rounded-xl border border-white/[0.06] bg-zinc-950/95 backdrop-blur-xl py-1 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => { const url = `${window.location.origin}/post/listing/${post.id}`; if (navigator.share) { navigator.share({ url, title: post.title }); } else { navigator.clipboard.writeText(url); showToast("Link copied!"); } setMenuOpen(null); }}
                                      className="flex w-full items-center gap-2 px-4 py-2 text-xs text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/[0.04]">📤 Share</button>
                                    {user?.email === post.sellerEmail && (
                                      <Link href={`/post/ai?edit=${post.id}`} onClick={() => setMenuOpen(null)}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-xs text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/[0.04]">✏️ Edit</Link>
                                    )}
                                    <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/post/listing/${post.id}`); showToast("Link copied!"); setMenuOpen(null); }}
                                      className="flex w-full items-center gap-2 px-4 py-2 text-xs text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/[0.04]">🔗 Copy link</button>
                                    <button onClick={() => { setMenuOpen(null); }}
                                      className="flex w-full items-center gap-2 px-4 py-2 text-xs text-red-400 hover:bg-white/[0.04]">🚩 Report</button>
                                    {user?.email === post.sellerEmail && (
                                      <button onClick={() => { deleteTrade(post.id); setMenuOpen(null); }}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-xs text-red-400 hover:bg-white/[0.04]">🗑 Delete</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded replies */}
                      {isExpanded && (
                        <div className="ml-[88px] mt-3 space-y-2.5">
                          {replies.slice(-3).map((r: any, i: number) => (
                            <div key={i} className="group flex items-center gap-2 rounded-xl border border-white/[0.03] bg-white/[0.01] px-4 py-2.5">
                              <span className="text-xs font-medium text-[var(--foreground)]">{r.by?.split("@")[0]}:</span>
                              <span className="text-xs text-zinc-500">{r.text}</span>
                              <div className="flex gap-1 ml-auto">
                                {["👍", "❤️", "😮", "😂"].map((emoji) => (
                                  <button key={emoji} onClick={(e) => { e.stopPropagation(); addReply(post.id, emoji); }}
                                    className="rounded px-1.5 py-0.5 text-[11px] opacity-0 group-hover:opacity-100 md:opacity-100 md:hover:opacity-100 transition hover:bg-white/[0.04]">{emoji}</button>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <input type="text" placeholder="Quick reply..." value={replyTexts[post.id] || ""}
                              onChange={(e) => setReplyTexts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") addReply(post.id, replyTexts[post.id] || ""); }}
                              className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.04] transition-all" />
                            <button onClick={() => addReply(post.id, replyTexts[post.id] || "")} className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2.5 text-xs font-bold text-white transition-all hover:shadow-[0_0_12px_rgba(14,165,233,0.2)]">Reply</button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[...QUICK_REPLIES, ...customReplies].slice(0, 6).map((qr) => (
                              <button key={qr} onClick={() => addReply(post.id, qr)}
                                className="rounded-lg border border-white/[0.04] px-3 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08] transition">{qr}</button>
                            ))}
                            <div className="relative">
                              <button onClick={(e) => { e.stopPropagation(); setAddingReply(addingReply === post.id ? "" : post.id); }}
                                className="rounded-lg border border-dashed border-white/[0.04] px-3 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08] transition">+ Add</button>
                              {addingReply === post.id && (
                                <div className="absolute bottom-full left-0 mb-1.5 z-50 flex gap-1 rounded-xl border border-white/[0.06] bg-zinc-950/95 backdrop-blur-xl p-1.5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                                  <input type="text" placeholder="Quick reply..." autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) { setCustomReplies((p) => [e.currentTarget.value.trim(), ...p].slice(0, 10)); e.currentTarget.value = ""; setAddingReply(""); } }}
                                    className="w-32 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--foreground)] outline-none placeholder:text-zinc-600" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

            </div>
          </div>

          {/* ── SIDE PANEL ── */}
          <div className="space-y-3 xl:sticky xl:top-24">
            {/* ── ACTIVITY ── */}
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Activity</p>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-sky-400" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] px-3.5 py-3">
                  <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Trades</p>
                  <p className="mt-1 text-xl font-black tracking-tight text-sky-400">{String(filteredPosts.length).padStart(2, '0')}</p>
                </div>
                <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] px-3.5 py-3">
                  <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Trending</p>
                  <p className="mt-1 text-xl font-black tracking-tight text-sky-400">{String(hotPosts.length).padStart(2, '0')}</p>
                </div>
              </div>
              <div className="mt-3 space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
                {liveEvents.length > 0 ? (
                  liveEvents.slice(0, 5).map((ev, idx) => (
                    <div key={ev.id} className="flex items-start gap-2 py-1 text-xs leading-relaxed"
                      style={{ opacity: idx >= 3 ? 0.5 : 1 }}>
                      <span className="shrink-0 mt-0.5">{ev.icon}</span>
                      <span className="text-zinc-500 truncate">{ev.text}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-600 italic py-4 text-center">Waiting for activity...</p>
                )}
              </div>
            </div>

            {/* ── TRENDING WORLDS ── */}
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Trending</p>
                <span className="text-[10px] text-zinc-600">By activity</span>
              </div>
              <div className="space-y-1">
                {trends.length > 0 ? (
                  trends.map((t, i) => (
                    <div key={t.world} className="flex items-center gap-3 rounded-xl border border-white/[0.02] bg-white/[0.01] px-3.5 py-2.5 transition hover:bg-white/[0.03] hover:border-white/[0.04]">
                      <span className="text-lg">{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--foreground)] truncate">{t.label}</p>
                        <p className="text-[10px] text-zinc-600">{t.count} post{t.count !== 1 ? "s" : ""}</p>
                      </div>
                      {i === 0 && <span className="text-xs opacity-60">👑</span>}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-600 italic py-4 text-center">Not enough data yet...</p>
                )}
              </div>
            </div>

            {/* ── SHOUTBOX ── */}
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">💬 Shoutbox</p>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-sky-400" />
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto mb-3 scrollbar-thin space-y-0.5" ref={shoutsEndRef} onScroll={handleShoutsScroll}>
                {shouts.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-sm text-zinc-600">
                    <span className="mb-2 text-2xl">💬</span>
                    <span>No messages yet...</span>
                  </div>
                ) : (
                  shouts.map((s) => (
                    <div key={s.id} className="group relative rounded-lg px-2 py-2 transition hover:bg-white/[0.02]">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-500 text-xs font-bold text-white mt-0.5">
                          {(s.by?.split("@")[0] || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-bold text-[var(--foreground)]">{s.by?.split("@")[0]}</span>
                            <span className="text-[11px] text-zinc-600">{s.createdAt?.seconds ? formatTime(s.createdAt) : ""}</span>
                          </div>
                          <p className="text-sm text-zinc-500 break-words mt-0.5">{s.text}</p>
                        </div>
                        {user?.email === s.by && (
                          <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, "tradeShouts", s.id)); }}
                            className="absolute right-1 top-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded bg-white/[0.04] text-[10px] text-zinc-600 hover:text-red-400 transition"
                            title="Delete">✕</button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="relative">
                <input type="text" placeholder="Chat... (Enter to send)" value={shoutText} maxLength={200}
                  onChange={(e) => setShoutText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendShout(); }}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 pr-10 text-sm text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.04] transition-all" />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[9px] ${shoutText.length > 180 ? "text-sky-400" : "text-zinc-600"}`}>
                  {shoutText.length}/200
                </span>
              </div>
              <div className="flex gap-1 mt-2">
                {["👍", "❤️", "😂", "😮", "🔥", "🙏"].map((emoji) => (
                  <button key={emoji} onClick={() => { setShoutText((prev) => prev + emoji); }}
                    className="rounded px-1.5 py-0.5 text-sm opacity-40 hover:opacity-100 transition hover:bg-white/[0.04]">{emoji}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {checkoutPost && user?.email && (
        <CheckoutModal collectionName="tradePosts" listing={{
          id: checkoutPost.id, title: checkoutPost.title, price: String(checkoutPost.price || 0),
          images: checkoutPost.images || (checkoutPost.image ? [checkoutPost.image] : []),
          sellerEmail: checkoutPost.sellerEmail, sellerUsername: checkoutPost.sellerUsername,
          pickupAvailable: checkoutPost.pickupAvailable, shippingAvailable: checkoutPost.shippingAvailable,
          pickupArea: checkoutPost.pickupArea, shippingFee: checkoutPost.shippingFee, freeShipping: checkoutPost.freeShipping,
          badgeForSale: checkoutPost.badgeForSale,
        }} buyerEmail={user.email} onClose={() => setCheckoutPost(null)} />
      )}
      {promotePost && <PromoteModal collectionName="tradePosts" listing={promotePost} onClose={() => setPromotePost(null)} />}
      {lightboxImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setLightboxImg(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setLightboxImg(null); if (e.key === "ArrowLeft" && lightboxIndex > 0) { const i = lightboxIndex - 1; setLightboxIndex(i); setLightboxImg(lightboxImages[i]); } if (e.key === "ArrowRight" && lightboxIndex < lightboxImages.length - 1) { const i = lightboxIndex + 1; setLightboxIndex(i); setLightboxImg(lightboxImages[i]); } }}
          tabIndex={0}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img src={lightboxImg} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain fade-in" />
            {lightboxImages.length > 1 && (
              <>
                <div className="absolute -left-12 top-1/2 -translate-y-1/2">
                  {lightboxIndex > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); const i = lightboxIndex - 1; setLightboxIndex(i); setLightboxImg(lightboxImages[i]); }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900/80 text-[var(--foreground)] transition hover:bg-zinc-800 border border-zinc-700">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                  )}
                </div>
                <div className="absolute -right-12 top-1/2 -translate-y-1/2">
                  {lightboxIndex < lightboxImages.length - 1 && (
                    <button onClick={(e) => { e.stopPropagation(); const i = lightboxIndex + 1; setLightboxIndex(i); setLightboxImg(lightboxImages[i]); }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900/80 text-[var(--foreground)] transition hover:bg-zinc-800 border border-zinc-700">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  )}
                </div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {lightboxImages.map((_, i) => (
                    <button key={i} onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); setLightboxImg(lightboxImages[i]); }}
                      className={`h-2 rounded-full transition-all duration-150 ${i === lightboxIndex ? "w-5 bg-sky-400" : "w-2 bg-white/40 hover:bg-white/70"}`} />
                  ))}
                </div>
              </>
            )}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 text-xs text-white/60 bg-black/50 px-3 py-1 rounded-full">
              {lightboxIndex + 1} / {lightboxImages.length}
            </div>
          </div>
          <button onClick={() => setLightboxImg(null)} className="absolute right-4 top-4 text-2xl text-white/70 transition hover:text-white z-10">✕</button>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
