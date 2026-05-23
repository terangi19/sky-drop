"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import CheckoutModal from "../components/CheckoutModal";
import PromoteModal from "../components/PromoteModal";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db, storage } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { showToast } from "../components/Toast";
import { checkShout } from "../lib/shoutFilter";
import confetti from "canvas-confetti";
import { playOffer, playSuccess, playClick } from "../lib/sounds";
import { createNotification } from "../lib/notifications";

const WORLDS = [
  { id: "all", label: "All Worlds", icon: "🌐", accent: "border-sky-500/20", glow: "shadow-[0_0_12px_rgba(14,165,233,0.06)]", color: "from-sky-400" },
  { id: "gaming", label: "Gaming", icon: "🎮", accent: "border-sky-500/20", glow: "shadow-[0_0_20px_rgba(14,165,233,0.12)]", color: "from-sky-400" },
  { id: "cars", label: "Cars", icon: "🚗", accent: "border-zinc-400/20", glow: "shadow-[0_0_20px_rgba(161,161,170,0.12)]", color: "from-zinc-300" },
  { id: "fashion", label: "Fashion", icon: "👟", accent: "border-rose-400/20", glow: "shadow-[0_0_20px_rgba(251,113,133,0.12)]", color: "from-rose-400" },
  { id: "tech", label: "Tech", icon: "💻", accent: "border-blue-400/20", glow: "shadow-[0_0_20px_rgba(96,165,250,0.12)]", color: "from-blue-400" },
  { id: "collector", label: "Collector", icon: "⭐", accent: "border-amber-400/20", glow: "shadow-[0_0_20px_rgba(251,191,36,0.12)]", color: "from-amber-400" },
];

const SUBCATEGORIES: Record<string, string[]> = {
  all: ["All Posts"],
  gaming: ["All Posts", "In-Game Collectibles", "PC Parts", "Consoles", "Gaming Setups"],
  cars: ["All Posts", "Wheels", "Parts", "Cars", "Performance", "Detailing", "Tools"],
  fashion: ["All Posts", "Sneakers", "Streetwear", "Designer", "Vintage", "Accessories"],
  tech: ["All Posts", "Phones", "PCs", "Cameras", "Audio", "Smart Home"],
  collector: ["All Posts", "Cards", "Figures", "Memorabilia", "Rare Items"],
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
  if (type === "WTB") return "bg-emerald-500/15 text-emerald-400";
  if (type === "Trading") return "bg-violet-500/15 text-violet-400";
  return "bg-sky-500/15 text-sky-400";
}

export default function TradeFeedPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [posts, setPosts] = useState<any[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState("All Posts");
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser?.uid) {
        const snap = await getDoc(doc(db, "profiles", currentUser.uid));
        if (snap.exists()) setUsername(snap.data().username || "");
      }
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

  // Live event ticker for new posts
  useEffect(() => {
    if (posts.length === 0) return;
    const latest = posts[0];
    if (latest && latest.sellerUsername !== "TradeBot" && latest.createdAt && (Date.now() / 1000 - latest.createdAt.seconds) < 10) {
      const id = ++eventId.current;
      const worldName = WORLDS.find((w) => w.id === latest.world)?.label || "";
      setLiveEvents((prev) => [{ id, icon: "📢", text: `${latest.title} posted${worldName ? ` in ${worldName}` : ""}`, world: latest.world }, ...prev].slice(0, 6));
      setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 6000);
    }
  }, [posts.length]);

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
    await addDoc(collection(db, "tradeShouts"), {
      world: selectedWorld.length === 1 && selectedWorld[0] !== "all" ? selectedWorld[0] : "__general__",
      text: msg,
      by: username || user.email,
      createdAt: serverTimestamp(),
    });
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
      const profileSnap = await getDoc(doc(db, "profiles", user.uid));
      if (profileSnap.exists() && profileSnap.data().restricted === true) {
        showToast("Your account is restricted. You cannot create posts.", "error");
        return;
      }
    } catch {}
    lastPostTime.current = Date.now();
    setPosting(true);
    try {
      const images: string[] = [];
      for (const file of imageFiles) {
        const storageRef = ref(storage, `trade_posts/${user.uid}/${Date.now()}_${file.name}`);
        const snap = await uploadBytes(storageRef, file);
        images.push(await getDownloadURL(snap.ref));
      }
      await addDoc(collection(db, "tradePosts"), {
        type, title, price: price || "", message: message || "",
        sellerEmail: user.email, sellerUsername: username || user.email,
        world: selectedWorld.length === 1 ? selectedWorld[0] : null,
        category: selectedFilter !== "All Posts" ? selectedFilter : null,
        status: "live",
        saleType: type === "WTS" ? "buy_now" : type === "WTB" ? "buy_now_offers" : "trade",
        replies: [], images, views: 1, offers: 0,
        location: null,
        pickupAvailable, shippingAvailable, pickupArea,
        shippingFee: shippingAvailable && shippingFee ? Number(shippingFee) : null,
        freeShipping: shippingAvailable ? freeShipping : false,
        createdAt: serverTimestamp(),
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
    await deleteDoc(doc(db, "tradePosts", id));
  }

  async function updateTradeStatus(id: string, status: string) {
    try {
      await updateDoc(doc(db, "tradePosts", id), { status });
      showToast(`Marked as ${status}`, "success");
      playSuccess();
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
    } catch { showToast("Failed to update status", "error"); }
  }

  async function addReply(postId: string, text: string) {
    if (!text.trim() || !user?.email) return;
    try {
      const post = posts.find((p) => p.id === postId);
      const replies = Array.isArray(post?.replies) ? [...post.replies] : [];
      replies.push({ text: text.trim(), by: username || user.email, at: new Date().toISOString() });
      await updateDoc(doc(db, "tradePosts", postId), { replies });
      await addDoc(collection(db, "messages"), {
        text: text.trim(),
        sender: user.email,
        receiver: post?.sellerEmail || "",
        participants: [user.email, post?.sellerEmail].filter(Boolean),
        listingId: postId,
        listingTitle: post?.title || null,
        createdAt: serverTimestamp(),
      }).catch((err) => console.error("Failed to add message doc:", err));
      await addDoc(collection(db, "notifications"), {
        type: "message",
        targetEmail: post?.sellerEmail || "",
        fromEmail: user.email,
        title: "New reply on your trade",
        message: `${user.email?.split("@")[0] || "Someone"}: ${text.trim().slice(0, 100)}`,
        listingId: postId,
        listingTitle: post?.title || "a trade",
        read: false,
        createdAt: serverTimestamp(),
      }).catch((err) => console.error("Failed to add notification doc:", err));
      setReplyTexts((prev) => ({ ...prev, [postId]: "" }));
      const id = ++eventId.current;
      setLiveEvents((prev) => [{ id, icon: "💬", text: `New reply on ${post?.title || "a trade"}`, world: post?.world }, ...prev].slice(0, 6));
      setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 6000);
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
      message: `${user?.email || "Someone"} sent an offer on "${post.title}".`,
      listingId: post.id,
      listingTitle: post.title,
      listingImage: post.images?.[0] || post.image || "",
    });
    const id = ++eventId.current;
    setLiveEvents((prev) => [{ id, icon: "💰", text: `Offer received on ${post.title}`, world: post.world }, ...prev].slice(0, 6));
    setTimeout(() => setLiveEvents((prev) => prev.filter((e) => e.id !== id)), 6000);
  }

  async function toggleWatchlist(post: any) {
    if (!user?.uid) { showToast("Sign in first", "info"); return; }
    const ref_ = doc(db, "users", user.uid, "watchlist", post.id);
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

  const trends = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => { if (p.world) counts[p.world] = (counts[p.world] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return sorted.map(([world, count]) => ({
      world, label: WORLDS.find((w) => w.id === world)?.label || world,
      icon: WORLDS.find((w) => w.id === world)?.icon || "🌐", count,
      change: count > 0 ? "+" + Math.min(count, 25) + "%" : "0%",
    }));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    let items = posts;
    if (selectedWorld.length > 0 && !selectedWorld.includes("all")) items = items.filter((p) => selectedWorld.includes(p.world));
    if (selectedFilter !== "All Posts") items = items.filter((p) => p.category === selectedFilter);
    if (selectedType === "WTS") items = items.filter((p) => p.type === "WTS");
    else if (selectedType === "WTB") items = items.filter((p) => p.type === "WTB");
    else if (selectedType === "Trading") items = items.filter((p) => p.type === "Trading");
    if (showMyTrades && user?.email) items = items.filter((p) => p.sellerEmail === user.email);
    if (showImagesOnly) items = items.filter((p) => (p.images?.length > 0) || p.image);
    if (statusFilter === "active") items = items.filter((p) => p.status === "live" || !p.status);
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

  const onlineCount = posts.length > 50 ? 50 + Math.floor(posts.length * 0.3) : Math.floor(Math.random() * 30) + 10;
  const viewerCount = Math.floor(posts.length * 0.15) + 1;
  const activeWorldColor = selectedWorld.length === 1 ? WORLDS.find((w) => w.id === selectedWorld[0])?.color || "from-sky-400" : "from-red-400";
  const activeWorldGlow = selectedWorld.length === 1 ? WORLDS.find((w) => w.id === selectedWorld[0])?.glow || "" : "";

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-[1600px] px-4 pb-8 pt-4">
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className={`bg-gradient-to-r ${activeWorldColor} to-transparent bg-clip-text text-[10px] font-bold uppercase tracking-widest text-transparent`}>Live</span>
            </div>
            <span className="text-[11px] text-[var(--muted)]">{onlineCount} online</span>
            <span className="text-[11px] text-[var(--muted)]">· {posts.length} trades</span>
            <span className="text-[11px] text-[var(--muted)]">· 👁 {viewerCount} viewing</span>
          </div>

          {/* Live event ticker */}
          <div className="hidden lg:flex items-center gap-3 flex-1 max-w-md overflow-hidden">
            {liveEvents.slice(0, 2).map((ev) => (
              <span key={ev.id} className="flex items-center gap-1.5 shrink-0 rounded-full bg-zinc-800/60 px-3 py-1 text-[10px] text-[var(--foreground)]"
                style={{ animation: "fadeIn 0.3s ease-out" }}>
                {ev.icon} {ev.text}
              </span>
            ))}
          </div>

          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search trades..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-44 rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-3 text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40" />
          </div>
        </div>

        {/* ── WORLDS ── */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none justify-center">
          {WORLDS.map((world) => (
            <button key={world.id}
              onClick={() => {
                if (world.id === "all") setSelectedWorld([]);
                else setSelectedWorld((prev) => prev.includes(world.id) ? prev.filter((w) => w !== world.id) : [...prev, world.id]);
              }}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold transition ${
                (world.id === "all" && selectedWorld.length === 0) || selectedWorld.includes(world.id)
                  ? `bg-sky-500/10 text-sky-400 border-sky-500/30 ${world.glow}`
                  : "border-zinc-800 bg-zinc-900/50 text-[var(--muted)] hover:border-zinc-700 hover:text-[var(--foreground)]"
              }`}>
              <span className="text-lg">{world.icon}</span>
              <span>{world.label}</span>
              {world.id !== "all" && <span className="text-xs text-[var(--muted)]">{posts.filter((p) => p.world === world.id).length}</span>}
            </button>
          ))}
        </div>

        {/* ── FILTER TOOLBAR ── */}
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {SUBCATEGORIES[selectedWorld.length === 1 ? selectedWorld[0] : "all"]?.map((cat) => (
              <button key={cat} onClick={() => setSelectedFilter(cat)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  selectedFilter === cat ? "bg-sky-500/15 text-sky-400" : "text-[var(--muted)] hover:bg-zinc-800/50 hover:text-[var(--foreground)]"
                }`}>{cat}</button>
            ))}
          </div>
          <div className="w-px h-5 bg-zinc-800" />
          <div className="flex gap-1">
            {["All", "WTS", "WTB", "Trading"].map((t) => (
              <button key={t} onClick={() => setSelectedType(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  selectedType === t
                    ? t === "WTB" ? "bg-emerald-500/15 text-emerald-400" : t === "Trading" ? "bg-violet-500/15 text-violet-400" : "bg-sky-500/15 text-sky-400"
                    : "bg-zinc-800/50 text-[var(--muted)] hover:bg-zinc-800"
                }`}>{t === "All" ? "All" : t}</button>
            ))}
          </div>
          <div className="w-px h-5 bg-zinc-800" />
          <div className="flex items-center gap-1.5">
            <input type="number" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
              className="w-14 rounded-lg border border-zinc-800 bg-zinc-800/50 px-2 py-1.5 text-xs outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40" />
            <span className="text-xs text-[var(--muted)]">–</span>
            <input type="number" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
              className="w-14 rounded-lg border border-zinc-800 bg-zinc-800/50 px-2 py-1.5 text-xs outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40" />
          </div>
          <div className="w-px h-5 bg-zinc-800" />
          <div className="flex gap-1">
            <button onClick={() => setShowImagesOnly(!showImagesOnly)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${showImagesOnly ? "bg-sky-500/15 text-sky-400" : "bg-zinc-800/50 text-[var(--muted)]"}`}>
              📷 Images
            </button>
            {user && (
              <button onClick={() => setShowMyTrades(!showMyTrades)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${showMyTrades ? "bg-sky-500/15 text-sky-400" : "bg-zinc-800/50 text-[var(--muted)]"}`}>
                👤 My Trades
              </button>
            )}
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_240px]">
          {/* ── FEED ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--foreground)]">
                  {selectedWorld.length === 1 ? WORLDS.find((w) => w.id === selectedWorld[0])?.label : "All Trades"}
                </h2>
                <span className="text-[11px] text-[var(--muted)]">{filteredPosts.length} trades</span>
                {hotPosts.length > 0 && <span className="text-[10px] font-bold text-orange-400">🔥 {hotPosts.length} hot</span>}
              </div>
              <div className="flex items-center gap-2">
                {["all", "active", "completed", "sold"].map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`rounded-lg px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition ${
                      statusFilter === s
                        ? s === "sold" ? "bg-red-500/15 text-red-400" : s === "completed" ? "bg-zinc-500/15 text-zinc-400" : s === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-sky-500/15 text-sky-400"
                        : "bg-zinc-800/50 text-[var(--muted)] hover:bg-zinc-800"
                    }`}>{s === "all" ? "All" : s}</button>
                ))}
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-[var(--foreground)] outline-none focus:border-sky-500/40 cursor-pointer">
                  <option value="newest">Newest</option>
                  <option value="replies">Most Replies</option>
                  <option value="price_low">Price: Low</option>
                  <option value="price_high">Price: High</option>
                </select>
                <button onClick={() => setShowComposer(!showComposer)}
                  className="rounded-lg bg-sky-500 px-3.5 py-2 text-[11px] font-bold text-white transition hover:bg-sky-400">
                  {showComposer ? "Cancel" : "+ New Post"}
                </button>
              </div>
            </div>

            {/* ── COMPOSER ── */}
            {showComposer && (
              <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex gap-1.5 mb-2">
                  {["WTS", "WTB", "Trading"].map((t) => (
                    <button key={t} onClick={() => setType(t)}
                      className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
                        type === t ? "bg-sky-500 text-white" : "bg-zinc-800 text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}>{t}</button>
                  ))}
                </div>
                <input type="text" placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40 mb-2" />
                <div className="flex gap-2 mb-2">
                  {type !== "Trading" && (
                    <input type="text" placeholder={type === "WTB" ? "Budget" : "Price"} value={price} onChange={(e) => setPrice(e.target.value)}
                      className="w-28 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40" />
                  )}
                  <textarea placeholder="Description (optional)" value={message} onChange={(e) => e.target.value.length <= 300 && setMessage(e.target.value)} rows={2} maxLength={300}
                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40 resize-none" />
                  <span className="self-end text-[10px] text-[var(--muted)] pb-1">{message.length}/300</span>
                </div>
                {/* Delivery + upload row */}
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-2 text-[10px] text-[var(--muted)] hover:border-zinc-600 has-[:checked]:border-sky-500/40 has-[:checked]:bg-sky-500/10 has-[:checked]:text-sky-400">
                    <input type="checkbox" checked={pickupAvailable} onChange={(e) => setPickupAvailable(e.target.checked)} className="hidden" />📍 Pickup
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-2 text-[10px] text-[var(--muted)] hover:border-zinc-600 has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/10 has-[:checked]:text-emerald-400">
                    <input type="checkbox" checked={shippingAvailable} onChange={(e) => setShippingAvailable(e.target.checked)} className="hidden" />📦 Ship
                  </label>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-[11px] text-[var(--muted)] transition hover:border-zinc-600 hover:text-[var(--foreground)]">📷 {imageFiles.length > 0 && `(${imageFiles.length})`}</button>
                  <div className="flex-1" />
                  <button onClick={postTrade} disabled={posting || !title}
                    className="rounded-lg bg-sky-500 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-sky-400 disabled:opacity-50">
                    {posting ? "Posting..." : "Post"}
                  </button>
                </div>
                {imagePreviews.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {imagePreviews.map((preview, i) => (
                      <div key={i} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
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
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-1.5 text-[10px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40" />
                    )}
                    {shippingAvailable && (
                      <div className="flex gap-1.5">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted)]">$</span>
                          <input type="number" placeholder="Fee" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)}
                            className="w-20 rounded-lg border border-zinc-800 bg-zinc-800/50 py-1.5 pl-5 pr-2 text-[10px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40" />
                        </div>
                        <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-2 py-1.5 text-[9px] text-[var(--muted)] has-[:checked]:text-emerald-400">
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
                <div className="flex items-center justify-center py-3">
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Refreshing...
                  </div>
                </div>
              )}
              {pullDistance > 0 && !isRefreshing && (
                <div className="flex items-center justify-center py-2 transition-all" style={{ transform: `translateY(${pullDistance * 0.5}px)` }}>
                  <span className={`text-xs text-[var(--muted)] transition-opacity ${pullDistance > 80 ? "text-sky-400" : ""}`}>
                    {pullDistance > 80 ? "Release to refresh" : "↓ Pull to refresh"}
                  </span>
                </div>
              )}
              {!postsLoaded ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 animate-pulse">
                      <div className="h-24 w-24 shrink-0 rounded-xl bg-zinc-800" />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex gap-2">
                          <div className="h-4 w-16 rounded bg-zinc-800" />
                          <div className="h-4 w-12 rounded bg-zinc-800" />
                        </div>
                        <div className="h-5 w-3/4 rounded bg-zinc-800" />
                        <div className="h-4 w-1/2 rounded bg-zinc-800" />
                        <div className="flex gap-3">
                          <div className="h-6 w-16 rounded bg-zinc-800" />
                          <div className="h-6 w-16 rounded bg-zinc-800" />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="h-4 w-4 rounded-full bg-zinc-800" />
                        <div className="h-8 w-16 rounded-lg bg-zinc-800" />
                        <div className="h-8 w-16 rounded-lg bg-zinc-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-16 text-center">
                  <div className="text-4xl mb-3">📦</div>
                  <p className="text-sm text-[var(--muted)]">No trades here yet.</p>
                  <button onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => setShowComposer(true), 300); }}
                    className="mt-4 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-sky-400">
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
                  const postViews = post.views || Math.floor(Math.random() * 5) + 1;
                  const imgs = post.images || (post.image ? [post.image] : []);

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
                        className={`relative flex gap-5 rounded-xl border p-5 transition-all duration-200 cursor-pointer overflow-hidden hover:scale-[1.01] hover:shadow-lg hover:shadow-black/20 ${
                          isNew ? "border-amber-500/30 bg-amber-500/5 shadow-[0_0_15px_rgba(251,191,36,0.06)] hover:border-amber-500/50" : isHot ? "border-orange-500/20 bg-orange-500/3 hover:border-orange-500/30" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700/60"
                        } ${worldData ? worldData.glow : ""}`}
                      >
                        {/* Swipe actions overlay */}
                        {swipedId === post.id && (
                          <div className="absolute inset-0 z-20 flex items-center justify-end gap-2 rounded-xl bg-black/60 backdrop-blur-sm px-4" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => { setExpandedPost(post.id); setSwipedId(null); }}
                              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-bold text-[var(--foreground)]">💬 Chat</button>
                            {user?.email !== post.sellerEmail && (
                              <>
                                {post.price && <button onClick={() => { setCheckoutPost(post); setSwipedId(null); }}
                                  className="rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-bold text-white">🛒 Buy</button>}
                                <button onClick={() => { sendOffer(post.id); setSwipedId(null); }}
                                  className="rounded-lg bg-sky-500/20 px-4 py-2.5 text-xs font-bold text-sky-400">💰 Offer</button>
                              </>
                            )}
                            {user?.email === post.sellerEmail && (
                              <button onClick={() => { setSwipedId(null); }}
                                className="rounded-lg bg-zinc-800 px-4 py-2.5 text-xs font-bold text-[var(--muted)]">✕</button>
                            )}
                          </div>
                        )}
                        {/* World accent line */}
                        {worldData && (
                          <div className={`absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b ${worldData.color} to-transparent`} />
                        )}

                        {/* Image */}
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-800 cursor-pointer" onClick={(e) => { e.stopPropagation(); if (imgs.length > 0) { setLightboxImages(imgs); setLightboxIndex(0); setLightboxImg(imgs[0]); } }}>
                          {imgs.length > 0 ? (
                            <img src={imgs[0]} alt="" className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-lg text-[var(--muted)]">
                              {post.type === "WTB" ? "🛒" : post.type === "Trading" ? "🔄" : "💰"}
                            </div>
                          )}
                          {imgs.length > 1 && (
                            <div className="absolute -bottom-1 -right-1 flex">
                              {imgs.slice(1, 4).map((img: string, i: number) => (
                                <div key={i} className={`h-7 w-7 -ml-1.5 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 shadow-lg ${i > 0 ? "-ml-3" : ""}`}>
                                  <img src={img} alt="" className="h-full w-full object-cover" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`rounded px-2.5 py-1 font-bold uppercase tracking-wider ${getTypePill(post.type)}`}>{post.type}</span>
                            {post.saleType === "buy_now" && <span className="rounded border border-sky-500/20 bg-sky-500/5 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">Buy Now</span>}
                            {post.saleType === "buy_now_offers" && <span className="rounded border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">Offers</span>}
                            {post.saleType === "trade" && <span className="rounded border border-violet-500/20 bg-violet-500/5 px-1.5 py-0.5 text-[10px] font-bold text-violet-400">Trade</span>}
                            {post.promotedUntil?.toMillis?.() > Date.now() && <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">📈 Promoted</span>}
                            {post.status === "live" && <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">Active</span>}
                            {post.status === "completed" && <span className="rounded border border-zinc-500/20 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">Completed</span>}
                            {post.status === "sold" && <span className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-400">Sold</span>}
                            {isHot && <span className="rounded border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[11px] font-bold text-orange-400">HOT</span>}
                            {isNew && <span className="text-[11px] font-bold text-red-400">NEW</span>}
                            {post.world && <span className="text-[var(--muted)]">{worldData?.icon}</span>}
                            <span className="text-[9px] text-zinc-600">{formatTime(post.createdAt)}</span>
                          </div>

                          <h3 className="mt-1.5 text-lg font-black text-[var(--foreground)] leading-snug">{post.title}</h3>
                          {post.message && !isExpanded && <p className="mt-1 truncate text-sm text-[var(--muted)]">{post.message}</p>}
                          {replies.length > 0 && !isExpanded && (
                            <p className="mt-1 truncate text-xs text-zinc-600">💬 {replies[replies.length - 1].by?.split("@")[0]}: {replies[replies.length - 1].text}</p>
                          )}

                          {/* Price + Stats row */}
                          <div className="mt-3 flex items-center gap-3 flex-wrap">
                            {post.price && <span className="text-xl font-black text-sky-400">${post.price}</span>}
                            <div className="flex items-center gap-2.5 text-xs text-[var(--muted)]">
                              <span>👁 {postViews}</span>
                              {replyCount > 0 && <span>💬 {replyCount}</span>}
                              {offers > 0 && <span>💰 {offers}</span>}
                          </div>
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-xs text-[var(--muted)]">
                            <Link href={`/seller/${post.sellerUsername || post.sellerEmail}`} onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 hover:text-sky-400 transition-colors">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 text-[10px] font-bold text-white">
                                {(post.sellerUsername || post.sellerEmail || "?").charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-[var(--foreground)]">{post.sellerUsername?.split("@")[0] || post.sellerEmail?.split("@")[0]}</span>
                              {stats && stats.count > 0 && (
                                <span className="text-amber-400">{'★'.repeat(Math.min(Math.floor(stats.avg), 5))} {stats.avg.toFixed(1)}</span>
                              )}
                            </Link>
                            {post.pickupAvailable && <span>📍 {post.pickupArea || "Pickup"}</span>}
                            {post.shippingAvailable && <span>{post.freeShipping ? "🚚 Free" : `📦 $${post.shippingFee || ""}`}</span>}
                            <span className="text-zinc-700">·</span>
                            <span>{formatTime(post.createdAt)}</span>
                          </div>
                        </div>

                        {/* Actions column */}
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {/* Watchlist heart */}
                          <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(post); }}
                            className="text-sm transition hover:scale-110" title="Save to watchlist">
                            ♡
                          </button>
                          {/* Three-dot menu */}
                          <div className="relative">
                            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === post.id ? null : post.id); }}
                              className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-zinc-800/50 hover:text-[var(--foreground)]">
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                            </button>
                            {menuOpen === post.id && (
                              <div className="absolute right-0 top-8 z-50 w-36 rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => { const url = `${window.location.origin}/post/listing/${post.id}`; if (navigator.share) { navigator.share({ url, title: post.title }); } else { navigator.clipboard.writeText(url); showToast("Link copied!"); } setMenuOpen(null); }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[var(--foreground)] hover:bg-zinc-800">📤 Share</button>
                                {user?.email === post.sellerEmail && (
                                  <Link href={`/post/edit/${post.id}`} onClick={() => setMenuOpen(null)}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[var(--foreground)] hover:bg-zinc-800">✏️ Edit</Link>
                                )}
                                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/post/listing/${post.id}`); showToast("Link copied!"); setMenuOpen(null); }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[var(--foreground)] hover:bg-zinc-800">🔗 Copy link</button>
                                <button onClick={() => { setMenuOpen(null); }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-xs text-red-400 hover:bg-zinc-800">🚩 Report</button>
                              </div>
                            )}
                          </div>
                          {/* Buy/Message/Offer buttons */}
                          {user?.email !== post.sellerEmail && post.price && (
                            <button onClick={(e) => { e.stopPropagation(); setCheckoutPost(post); }}
                              className="w-full rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-400">Buy Now</button>
                          )}
                          {user?.email !== post.sellerEmail && (
                            <Link href={`/messages?user=${encodeURIComponent(post.sellerEmail || "")}&listing=${encodeURIComponent(post.id)}`}
                              className="block w-full rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-[var(--foreground)] text-center transition hover:border-zinc-600">Message</Link>
                          )}
                          {user?.email !== post.sellerEmail && (
                            <Link href={`/messages?user=${encodeURIComponent(post.sellerEmail || "")}&listing=${encodeURIComponent(post.id)}`}
                              className="block w-full rounded-lg bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-400 text-center transition hover:bg-sky-500/20">💰 Offer</Link>
                          )}
                          {user?.email === post.sellerEmail && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setPromotePost(post); }}
                                className="w-full rounded-lg border border-amber-500/30 px-4 py-1.5 text-[10px] font-bold text-amber-400 transition hover:bg-amber-500/10">📈 Promote</button>
                              {post.status !== "sold" && post.status !== "completed" && (
                                <div className="flex gap-1 w-full">
                                  <button onClick={(e) => { e.stopPropagation(); updateTradeStatus(post.id, "completed"); }}
                                    className="flex-1 rounded-lg border border-zinc-500/30 px-2 py-1.5 text-[9px] font-bold text-zinc-400 transition hover:bg-zinc-500/10">Complete</button>
                                  <button onClick={(e) => { e.stopPropagation(); updateTradeStatus(post.id, "sold"); }}
                                    className="flex-1 rounded-lg border border-red-500/30 px-2 py-1.5 text-[9px] font-bold text-red-400 transition hover:bg-red-500/10">Sold</button>
                                </div>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); deleteTrade(post.id); }}
                                className="w-full rounded-lg bg-red-500/10 px-4 py-1.5 text-[10px] font-bold text-red-400 transition hover:bg-red-500/20">Delete</button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded replies */}
                      {isExpanded && (
                        <div className="ml-[124px] mt-3 space-y-2.5">
                          {replies.slice(-3).map((r: any, i: number) => (
                            <div key={i} className="group flex items-center gap-2 rounded-lg bg-zinc-800/30 px-4 py-2.5">
                              <span className="text-xs font-medium text-[var(--foreground)]">{r.by?.split("@")[0]}:</span>
                              <span className="text-xs text-[var(--muted)]">{r.text}</span>
                              <div className="flex gap-1 ml-auto">
                                {["👍", "❤️", "😮", "😂"].map((emoji) => (
                                  <button key={emoji} onClick={(e) => { e.stopPropagation(); addReply(post.id, emoji); }}
                                    className="rounded px-1.5 py-0.5 text-[11px] opacity-0 group-hover:opacity-100 md:opacity-100 md:hover:opacity-100 transition hover:bg-zinc-700/50">{emoji}</button>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <input type="text" placeholder="Quick reply..." value={replyTexts[post.id] || ""}
                              onChange={(e) => setReplyTexts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") addReply(post.id, replyTexts[post.id] || ""); }}
                              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40" />
                            <button onClick={() => addReply(post.id, replyTexts[post.id] || "")} className="rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-400">Reply</button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[...QUICK_REPLIES, ...customReplies].slice(0, 6).map((qr) => (
                              <button key={qr} onClick={() => addReply(post.id, qr)}
                                className="rounded-md border border-zinc-700/50 px-3 py-1.5 text-[10px] text-[var(--muted)] transition hover:border-zinc-600 hover:text-[var(--foreground)]">{qr}</button>
                            ))}
                            <div className="relative">
                              <button onClick={(e) => { e.stopPropagation(); setAddingReply(addingReply === post.id ? "" : post.id); }}
                                className="rounded-md border border-dashed border-zinc-700/50 px-3 py-1.5 text-[10px] text-[var(--muted)] hover:border-zinc-600 hover:text-[var(--foreground)]">+ Add</button>
                              {addingReply === post.id && (
                                <div className="absolute bottom-full left-0 mb-1.5 z-50 flex gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                                  <input type="text" placeholder="Quick reply..." autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) { setCustomReplies((p) => [e.currentTarget.value.trim(), ...p].slice(0, 10)); e.currentTarget.value = ""; setAddingReply(""); } }}
                                    className="w-32 rounded-md border border-zinc-800 bg-zinc-800/80 px-2 py-1 text-[10px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]" />
                                </div>
                              )}
                            </div>
                            {customReplies.length > 0 && (
                              <button onClick={(e) => { e.stopPropagation(); setCustomReplies([]); }}
                                className="rounded-md border border-red-500/20 px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10">Reset</button>
                            )}
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
            {/* ── LIVE ── */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[var(--foreground)]">🔴 Live</p>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg bg-zinc-800/30 px-3.5 py-2.5">
                  <p className="text-xs text-[var(--muted)]">🟢 Online</p>
                  <p className="mt-0.5 text-lg font-black text-emerald-400">{onlineCount}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/30 px-3.5 py-2.5">
                  <p className="text-xs text-[var(--muted)]">👁 Viewing</p>
                  <p className="mt-0.5 text-lg font-black text-[var(--foreground)]">{viewerCount}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/30 px-3.5 py-2.5">
                  <p className="text-xs text-[var(--muted)]">📊 In view</p>
                  <p className="mt-0.5 text-lg font-black text-sky-400">{filteredPosts.length}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/30 px-3.5 py-2.5">
                  <p className="text-xs text-[var(--muted)]">🔥 Hot</p>
                  <p className="mt-0.5 text-lg font-black text-orange-400">{hotPosts.length}</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 max-h-32 overflow-y-auto">
                {liveEvents.length > 0 ? (
                  liveEvents.map((ev) => (
                    <div key={ev.id} className="flex items-center gap-2 rounded-lg bg-zinc-800/20 px-3 py-2 text-sm" style={{ animation: "fadeIn 0.3s ease-out" }}>
                      <span>{ev.icon}</span>
                      <span className="truncate text-[var(--foreground)]">{ev.text}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">Waiting for activity...</p>
                )}
              </div>
            </div>

            {/* ── TRENDING WORLDS ── */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl p-5">
              <p className="text-sm font-bold text-[var(--foreground)] mb-4">🌍 Trending Worlds</p>
              <div className="space-y-2.5">
                {trends.map((t) => (
                  <div key={t.world} className="flex items-center justify-between cursor-pointer hover:opacity-80" onClick={() => { setSelectedWorld([t.world]); setSelectedFilter("All Posts"); }}>
                    <div className="flex items-center gap-2"><span>{t.icon}</span><span className="text-sm font-medium text-[var(--foreground)]">{t.label}</span></div>
                    <div className="flex items-center gap-2"><span className="text-sm text-[var(--muted)]">{t.count}</span><span className="text-xs font-bold text-emerald-400">{t.change}</span></div>
                  </div>
                ))}
                {trends.length === 0 && <p className="text-sm text-[var(--muted)]">No data yet...</p>}
              </div>
            </div>

            {/* ── SHOUTBOX ── */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[var(--foreground)]">💬 Shoutbox</p>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="max-h-80 overflow-y-auto mb-3 scrollbar-thin space-y-0.5" ref={shoutsEndRef} onScroll={handleShoutsScroll}>
                {shouts.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-sm text-[var(--muted)]">
                    <span className="mb-2 text-2xl">💬</span>
                    <span>No messages yet...</span>
                  </div>
                ) : (
                  shouts.map((s) => (
                    <div key={s.id} className="group relative rounded-lg px-2 py-2 transition hover:bg-zinc-800/20">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 text-xs font-bold text-white mt-0.5">
                          {(s.by?.split("@")[0] || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-bold text-[var(--foreground)]">{s.by?.split("@")[0]}</span>
                            <span className="text-[11px] text-zinc-600">{s.createdAt?.seconds ? formatTime(s.createdAt) : ""}</span>
                          </div>
                          <p className="text-sm text-[var(--muted)] break-words mt-0.5">{s.text}</p>
                        </div>
                        {user?.email === s.by && (
                          <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, "tradeShouts", s.id)); }}
                            className="absolute right-1 top-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded bg-zinc-800 text-[10px] text-[var(--muted)] hover:text-red-400 transition"
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
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-800/80 px-3.5 py-2.5 pr-10 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-sky-500/40 transition" />
                <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] ${shoutText.length > 180 ? "text-amber-400" : "text-zinc-600"}`}>
                  {shoutText.length}/200
                </span>
              </div>
              <div className="flex gap-1 mt-1.5">
                {["👍", "❤️", "😂", "😮", "🔥", "🙏"].map((emoji) => (
                  <button key={emoji} onClick={() => { setShoutText((prev) => prev + emoji); }}
                    className="rounded px-1.5 py-0.5 text-sm opacity-60 hover:opacity-100 transition hover:bg-zinc-800/50">{emoji}</button>
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
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
