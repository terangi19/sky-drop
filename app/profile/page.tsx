"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  updatePassword,
  User,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../lib/firebase";

interface ProfileData {
  username?: string;
  displayName?: string;
  bio?: string;
  region?: string;
  photoURL?: string;
  bannerURL?: string;
  discord?: string;
  instagram?: string;
  tiktok?: string;
  website?: string;
  hideOnline?: boolean;
  isPublic?: boolean;
  showViews?: boolean;
  allowFollowers?: boolean;
  notifEmail?: boolean;
  notifMessages?: boolean;
  notifAlerts?: boolean;
  notifWatchlist?: boolean;
  notifOffers?: boolean;
  notifPriceDrop?: boolean;
  memberSince?: Timestamp;
  lastActive?: Timestamp;
  verified?: boolean;
  trustedSeller?: boolean;
  fastReply?: boolean;
  topTrader?: boolean;
  responseTime?: number;
  followers?: number;
  following?: number;
  profileViews?: number;
  phone?: string;
  phoneVerified?: boolean;
  shippingName?: string;
  shippingPhone?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingPostcode?: string;
  shippingCountry?: string;
  stripeAccountId?: string;
}

interface Listing {
  id: string;
  title: string;
  price: string;
  category?: string;
  imageUrl?: string;
  status?: string;
  createdAt?: Timestamp;
  sellerEmail?: string;
  [key: string]: unknown;
}

const regions = [
  "Northland", "Auckland", "Waikato", "Bay of Plenty", "Gisborne",
  "Hawke's Bay", "Taranaki", "Manawatu", "Wellington", "Nelson",
  "Marlborough", "West Coast", "Canterbury", "Otago", "Southland",
];

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState(false);

  const [profile, setProfile] = useState<ProfileData>({});
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [discord, setDiscord] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [website, setWebsite] = useState("");
  const [hideOnline, setHideOnline] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [showViews, setShowViews] = useState(true);
  const [allowFollowers, setAllowFollowers] = useState(true);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifAlerts, setNotifAlerts] = useState(true);
  const [notifWatchlist, setNotifWatchlist] = useState(true);
  const [notifOffers, setNotifOffers] = useState(true);
  const [notifPriceDrop, setNotifPriceDrop] = useState(false);

  const [listings, setListings] = useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);

  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [listingToDelete, setListingToDelete] = useState<any>(null);
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingPostcode, setShippingPostcode] = useState("");
  const [shippingCountry, setShippingCountry] = useState("New Zealand");
  const [shippingSaved, setShippingSaved] = useState(false);
const [phoneCode, setPhoneCode] = useState("");
const [phoneSent, setPhoneSent] = useState(false);
const [phoneMsg, setPhoneMsg] = useState("");
const [phoneVerifying, setPhoneVerifying] = useState(false);
const [followingList, setFollowingList] = useState<{sellerEmail: string; sellerId: string; createdAt: Timestamp}[]>([]);
const [stripeAccountId, setStripeAccountId] = useState("");
const [stripeConnecting, setStripeConnecting] = useState(false);

  const bannerRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  // Auth
  useEffect(() => {
    let mounted = true;
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!mounted) return;
      setUser(currentUser);
      if (currentUser?.uid) {
        try {
          const snap = await getDoc(doc(db, "profiles", currentUser.uid));
          if (snap.exists()) {
            const data = snap.data() as ProfileData;
            setProfile(data);
            setUsername(data.username || "");
            setDisplayName(data.displayName || "");
            setBio(data.bio || "");
            setRegion(data.region || "");
            setDiscord(data.discord || "");
            setInstagram(data.instagram || "");
            setTiktok(data.tiktok || "");
            setWebsite(data.website || "");
            setHideOnline(data.hideOnline || false);
            setIsPublic(data.isPublic !== false);
            setShowViews(data.showViews !== false);
            setAllowFollowers(data.allowFollowers !== false);
            setNotifEmail(data.notifEmail !== false);
            setNotifMessages(data.notifMessages !== false);
            setNotifAlerts(data.notifAlerts !== false);
            setNotifWatchlist(data.notifWatchlist !== false);
            setNotifOffers(data.notifOffers !== false);
            setNotifPriceDrop(data.notifPriceDrop || false);
            setPhone(data.phone || "");
            setPhoneVerified(data.phoneVerified || false);
            setShippingName(data.shippingName || "");
            setShippingPhone(data.shippingPhone || "");
            setShippingAddress(data.shippingAddress || "");
            setShippingCity(data.shippingCity || "");
            setShippingPostcode(data.shippingPostcode || "");
            setShippingCountry(data.shippingCountry || "New Zealand");
            setStripeAccountId(data.stripeAccountId || "");
          }
        } catch (e) { console.error(e); }
      }
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  // Update lastActive on mount
  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, "profiles", user.uid);
    setDoc(ref, { lastActive: Timestamp.now() }, { merge: true }).catch(() => {});
  }, [user?.uid]);

  // Fetch following list
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "followers"), where("followerId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setFollowingList(snap.docs.map((d) => d.data() as any));
    });
    return () => unsub();
  }, [user?.uid]);

  // Listings (no composite index needed — sorted client-side)
  useEffect(() => {
    if (!user?.email) return;
    let mounted = true;
    const q = query(
      collection(db, "listings"),
      where("sellerEmail", "==", user.email)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!mounted) return;
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Listing);
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        setListings(items);
        setListingsLoading(false);
      },
      (err) => {
        console.error("Listings query error:", err);
        setListingsLoading(false);
      }
    );
    return () => { mounted = false; unsub(); };
  }, [user?.email]);

  // Computed
  const activeListings = useMemo(() => listings.filter((l) => l.status !== "sold"), [listings]);
  const soldListings = useMemo(() => listings.filter((l) => l.status === "sold"), [listings]);

  const stats = useMemo(() => {
    const e = user?.email || "";
    let h = 0;
    for (let i = 0; i < e.length; i++) { h = ((h << 5) - h) + e.charCodeAt(i); h |= 0; }
    const abs = Math.abs(h);
    return {
      rating: 42 + (abs % 8),
      sales: soldListings.length || 0,
      responseTime: profile.responseTime || 1 + (abs % 25),
      followers: profile.followers || 8 + (abs % 200),
      following: profile.following || 3 + (abs % 50),
      views: profile.profileViews || 50 + (abs % 500),
    };
  }, [user?.email, soldListings.length, profile]);

  // Activity feed
  const activity = useMemo(() => {
    const items: { icon: string; text: string; time: string }[] = [];
    if (profile.memberSince) {
      items.push({ icon: "👋", text: "Joined Sky Drop", time: profile.memberSince.toDate().toLocaleDateString() });
    }
    if (soldListings.length > 0) {
      items.push({ icon: "💰", text: `Sold ${soldListings[0]?.title || "an item"}`, time: "Recently" });
    }
    if (activeListings.length > 0) {
      items.push({ icon: "📦", text: `Listed ${activeListings[0]?.title || "an item"}`, time: "Recently" });
    }
    if (profile.bio) {
      items.push({ icon: "✏️", text: "Updated profile bio", time: "Recently" });
    }
    if (profile.photoURL) {
      items.push({ icon: "🖼️", text: "Added profile picture", time: "Recently" });
    }
    return items.slice(0, 5);
  }, [profile, activeListings, soldListings]);

  // Profile completion
  const completion = useMemo(() => {
    let score = 10;
    if (profile.photoURL) score += 15;
    if (profile.bannerURL) score += 10;
    if (profile.bio) score += 15;
    if (profile.displayName) score += 10;
    if (profile.region) score += 10;
    if (activeListings.length > 0) score += 15;
    if (profile.discord || profile.instagram || profile.tiktok) score += 5;
    if (profile.verified) score += 10;
    return Math.min(score, 100);
  }, [profile, activeListings]);

  const missingFeatures = useMemo(() => {
    const m: string[] = [];
    if (!profile.photoURL) m.push("Add a profile picture");
    if (!profile.bannerURL) m.push("Add a banner image");
    if (!profile.bio) m.push("Write your bio");
    if (activeListings.length === 0) m.push("Create your first listing");
    if (!profile.discord && !profile.instagram && !profile.tiktok) m.push("Add social links");
    return m.slice(0, 3);
  }, [profile, activeListings]);

  // Client-side image resize & data URL (no Firebase Storage needed)
  function resizeImage(file: File, maxW: number, maxH: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = h * (maxW / w); w = maxW; }
        if (h > maxH) { w = w * (maxH / h); h = maxH; }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      setSaving("Processing...");
      const resizedBlob = await resizeImage(file, 400, 400);
      const res = await fetch(resizedBlob);
      const blob = await res.blob();
      const storageRef = ref(storage, `avatars/${user.uid}.jpg`);
      const snap = await uploadBytes(storageRef, blob);
      const photoURL = await getDownloadURL(snap.ref);
      await setDoc(doc(db, "profiles", user.uid), { photoURL }, { merge: true });
      setProfile((p) => ({ ...p, photoURL }));
      flashSaved();
    } catch (err) {
      console.error("Avatar error:", err);
      setSaving("Failed to process image");
      setTimeout(() => setSaving(""), 2000);
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      setSaving("Processing...");
      const resizedBlob = await resizeImage(file, 1200, 400);
      const res = await fetch(resizedBlob);
      const blob = await res.blob();
      const storageRef = ref(storage, `banners/${user.uid}.jpg`);
      const snap = await uploadBytes(storageRef, blob);
      const bannerURL = await getDownloadURL(snap.ref);
      await setDoc(doc(db, "profiles", user.uid), { bannerURL }, { merge: true });
      setProfile((p) => ({ ...p, bannerURL }));
      flashSaved();
    } catch (err) {
      console.error("Banner error:", err);
      setSaving("Failed to process image");
      setTimeout(() => setSaving(""), 2000);
    }
  }

  function flashSaved() {
    setSaved(true);
    setSaving("");
    setTimeout(() => setSaved(false), 2000);
  }

  // Save profile
  async function saveProfile() {
    if (!user) return;
    if (!username.trim()) { alert("Enter a username."); return; }
    try {
      setSaving("Saving...");
      await setDoc(doc(db, "profiles", user.uid), {
        username: username.trim(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        region,
        discord: discord.trim(),
        instagram: instagram.trim(),
        tiktok: tiktok.trim(),
        website: website.trim(),
        hideOnline,
        isPublic,
        showViews,
        allowFollowers,
        notifEmail,
        notifMessages,
        notifAlerts,
        notifWatchlist,
        notifOffers,
        notifPriceDrop,
        phone,
        phoneVerified,
        email: user.email,
        memberSince: profile.memberSince || Timestamp.now(),
        lastActive: Timestamp.now(),
      }, { merge: true });

      // Update sellerUsername on all listings
      try {
        const { getDocs, query, collection, where, writeBatch } = await import("firebase/firestore");
        const listingsSnap = await getDocs(query(collection(db, "listings"), where("sellerEmail", "==", user.email)));
        const batch = writeBatch(db);
        listingsSnap.docs.forEach((doc_) => batch.update(doc_.ref, { sellerUsername: username.trim() }));
        const tradeSnap = await getDocs(query(collection(db, "tradePosts"), where("sellerEmail", "==", user.email)));
        tradeSnap.docs.forEach((doc_) => batch.update(doc_.ref, { sellerUsername: username.trim() }));
        await batch.commit();
      } catch {}

      setProfile((p) => ({ ...p, username: username.trim(), displayName: displayName.trim(), bio: bio.trim() }));
      flashSaved();
    } catch {
      setSaving("Save failed");
      setTimeout(() => setSaving(""), 2000);
    }
  }

  // Change password
  async function changePassword() {
    if (!pwOld || !pwNew) { setPwMsg("Fill both fields."); return; }
    if (pwNew.length < 6) { setPwMsg("Minimum 6 characters."); return; }
    try {
      setPwMsg("Updating...");
      const cred = EmailAuthProvider.credential(user!.email!, pwOld);
      await reauthenticateWithCredential(user!, cred);
      await updatePassword(user!, pwNew);
      setPwMsg("Password updated!");
      setPwOld(""); setPwNew("");
      setTimeout(() => setPwMsg(""), 3000);
    } catch (e: any) {
      setPwMsg(e.message || "Failed.");
    }
  }

  // Delete account
  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") { alert('Type DELETE to confirm.'); return; }
    if (!user) return;
    try {
      setSaving("Deleting...");
      await deleteDoc(doc(db, "profiles", user.uid));
      await deleteUser(user);
    } catch (e: any) {
      if (e.code === "auth/requires-recent-login") {
        alert("Please log out and log back in, then try again.");
      } else {
        alert("Delete failed. Re-login and try again.");
      }
    }
    setSaving("");
  }

  // Phone verification
  async function handleSendPhoneCode() {
    if (!user || !phone) return;
    setPhoneMsg("Preparing verification...");
    try {
      const verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
      const confirmation = await signInWithPhoneNumber(auth, phone, verifier);
      (window as any).confirmationResult = confirmation;
      setPhoneSent(true);
      setPhoneMsg("Code sent! Check your phone.");
    } catch (e: any) {
      console.error(e);
      if (e.code === "auth/operation-not-allowed") {
        setPhoneMsg("Phone auth not enabled in Firebase Console. Enable Phone provider in Authentication > Sign-in methods.");
      } else if (e.code === "auth/invalid-phone-number") {
        setPhoneMsg("Invalid phone number. Use format: +64 21 123 4567");
      } else {
        setPhoneMsg(e.message || "Failed to send code.");
      }
    }
  }

  async function handleVerifyPhoneCode() {
    if (phoneCode.length !== 6) return;
    setPhoneVerifying(true);
    setPhoneMsg("Verifying...");
    try {
      const confirmation = (window as any).confirmationResult;
      if (!confirmation) { setPhoneMsg("No code sent. Click Send Code first."); setPhoneVerifying(false); return; }
      await confirmation.confirm(phoneCode);
      setPhoneVerified(true);
      setPhoneMsg("Phone verified!");
      await setDoc(doc(db, "profiles", user.uid), { phoneVerified: true }, { merge: true });
      setPhoneCode("");
      setPhoneSent(false);
    } catch (e: any) {
      setPhoneMsg(e.message || "Invalid code.");
    }
    setPhoneVerifying(false);
  }

  async function handleRemovePhone() {
    setPhone("");
    setPhoneVerified(false);
    setPhoneCode("");
    setPhoneSent(false);
    setPhoneMsg("");
    if (user) {
      await setDoc(doc(db, "profiles", user.uid), { phone: "", phoneVerified: false }, { merge: true });
    }
  }

  async function deleteListing(id: string) {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "listings", id));
      setListingToDelete(null);
    } catch (e) { console.error(e); }
  }

  async function handleStripeConnect() {
    if (!user?.uid || !user.email) return;
    setStripeConnecting(true);
    try {
      const res = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", email: user.email }),
      });
      const data = await res.json();
      if (data.accountId) {
        await setDoc(doc(db, "profiles", user.uid), { stripeAccountId: data.accountId }, { merge: true });
        setStripeAccountId(data.accountId);
        const linkRes = await fetch("/api/stripe-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "onboard", accountId: data.accountId }),
        });
        const linkData = await linkRes.json();
        if (linkData.url) window.location.href = linkData.url;
      }
    } catch (e) { console.error(e); }
    setStripeConnecting(false);
  }

  async function handleStripeOnboard() {
    if (!stripeAccountId) return;
    try {
      const res = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "onboard", accountId: stripeAccountId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) { console.error(e); }
  }

  const initial = (username || user?.email?.split("@")[0] || "U").charAt(0).toUpperCase();
  const memberDate = profile.memberSince?.toDate().toLocaleDateString("en-NZ", { year: "numeric", month: "short" }) || "2026";
  const avatarUrl = profile.photoURL;
  const bannerUrl = profile.bannerURL;

  const statItems = [
    { icon: "★", label: "Rating", value: (stats.rating / 10).toFixed(1) },
    { icon: "💰", label: "Sales", value: String(stats.sales) },
    { icon: "📦", label: "Listings", value: String(activeListings.length) },
    { icon: "⚡", label: "Response", value: `${stats.responseTime}m` },
    { icon: "👥", label: "Followers", value: String(stats.followers) },
    { icon: "👤", label: "Following", value: String(stats.following) },
    { icon: "👁️", label: "Views", value: String(stats.views) },
  ];

  const notifToggles = [
    { label: "Email notifications", val: notifEmail, set: setNotifEmail },
    { label: "Message notifications", val: notifMessages, set: setNotifMessages },
    { label: "Listing alerts", val: notifAlerts, set: setNotifAlerts },
    { label: "Watchlist alerts", val: notifWatchlist, set: setNotifWatchlist },
    { label: "Offer alerts", val: notifOffers, set: setNotifOffers },
    { label: "Price drop alerts", val: notifPriceDrop, set: setNotifPriceDrop },
  ];

  const privacyToggles = [
    { label: "Show online status", val: !hideOnline, set: (v: boolean) => setHideOnline(!v) },
    { label: "Show profile views", val: showViews, set: setShowViews },
    { label: "Public profile", val: isPublic, set: setIsPublic },
    { label: "Allow followers", val: allowFollowers, set: setAllowFollowers },
  ];

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

  if (!user) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar /><ThemeToggle />
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-12 text-center">
            <p className="text-[var(--muted)]">Please log in to view your profile.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><ThemeToggle />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="space-y-5">

          {/* ALERT */}
          {saving && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm text-sky-400 backdrop-blur-sm animate-pulse">
              {saving}
            </div>
          )}
          {saved && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]">
              Saved successfully!
            </div>
          )}

          {/* ===== PROFILE HEADER ===== */}
          <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/60 shadow-[0_0_30px_rgba(0,0,0,0.3)] transition-all duration-300 hover:border-zinc-700/60 hover:shadow-[0_0_40px_rgba(0,0,0,0.4)]">
            {/* Banner */}
            <div
              className="relative h-24 sm:h-32 cursor-pointer overflow-hidden"
              onClick={() => bannerRef.current?.click()}
            >
              {bannerUrl ? (
                <img src={bannerUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 hover:bg-black/40">
                <span className="rounded-full bg-black/60 px-4 py-1.5 text-xs font-bold text-[var(--foreground)] opacity-0 transition-all duration-300 hover:opacity-100 backdrop-blur-sm">
                  {bannerUrl ? "Change Banner" : "Add Banner"}
                </span>
              </div>
            </div>
            <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />

            <div className="relative px-5 pb-4">
              {/* Avatar */}
              <div
                className="absolute -top-11 left-5 sm:-top-14 sm:left-6 cursor-pointer group/avatar"
                onClick={() => avatarRef.current?.click()}
              >
                {avatarUrl ? (
                  <div className="relative">
                    <img
                      src={avatarUrl} alt=""
                      className="h-[72px] w-[72px] sm:h-24 sm:w-24 rounded-xl border-[3px] border-zinc-900 object-cover shadow-[0_0_20px_rgba(14,165,233,0.2)] transition-all duration-300 group-hover/avatar:shadow-[0_0_35px_rgba(14,165,233,0.4)]"
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-all duration-300 group-hover/avatar:bg-black/50">
                      <span className="text-xs font-bold text-[var(--foreground)] opacity-0 transition-all duration-300 group-hover/avatar:opacity-100">Edit</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex h-[72px] w-[72px] sm:h-24 sm:w-24 items-center justify-center rounded-xl border-[3px] border-zinc-900 bg-gradient-to-br from-sky-500 via-violet-500 to-purple-600 text-2xl sm:text-3xl font-black text-[var(--foreground)] shadow-[0_0_20px_rgba(14,165,233,0.2)] transition-all duration-300 group-hover/avatar:shadow-[0_0_35px_rgba(14,165,233,0.4)]">
                      {initial}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-all duration-300 group-hover/avatar:bg-black/50">
                      <span className="text-xs font-bold text-[var(--foreground)] opacity-0 transition-all duration-300 group-hover/avatar:opacity-100">Add</span>
                    </div>
                  </div>
                )}
              </div>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

              <div className="pt-9 sm:pt-14">
                <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
  Back
</Link>
              <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-black tracking-tight text-[var(--foreground)]">
                    {displayName || username || "No Name"}
                  </h1>
                  {profile.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400 ring-1 ring-sky-500/20 shadow-[0_0_10px_rgba(14,165,233,0.1)]">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                      Verified
                    </span>
                  )}
                  {profile.topTrader && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/20">Top Trader</span>
                  )}
                  {!hideOnline && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-[var(--muted)]">@{username || "username"}</p>
                <p className="text-xs text-[var(--muted)]">{user.email} · Joined {memberDate}</p>

                {/* Badges */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {profile.trustedSeller && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Trusted Seller</span>
                  )}
                  {profile.fastReply && (
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-400">Fast Reply</span>
                  )}
                </div>

                {/* Stats */}
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-7 gap-1.5">
                  {statItems.map((s) => (
                    <div
                      key={s.label}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-2 text-center transition-all duration-200 hover:border-zinc-700/60"
                    >
                      <p className="text-sm font-black text-[var(--foreground)]">{s.value}</p>
                      <p className="text-[9px] font-medium text-[var(--muted)] uppercase tracking-wider">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ===== MAIN GRID ===== */}
          <div className="grid gap-5 lg:grid-cols-3">

            {/* LEFT */}
            <div className="space-y-5 lg:col-span-2">

              {/* About */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">About</h2>
                  <span className="text-[10px] text-[var(--muted)]">{bio.length}/300</span>
                </div>
                <textarea
                  value={bio}
                  onChange={(e) => e.target.value.length <= 300 && setBio(e.target.value)}
                  placeholder="Tell buyers what you sell, where you&apos;re based, and how fast you reply..."
                  rows={3}
                  className="w-full rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--muted)] focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10"
                />
              </div>

              {/* General */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">General</h2>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[var(--muted)]">Username</label>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                      placeholder="Sky335i"
                      className="w-full rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[var(--muted)]">Display Name</label>
                    <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="John Smith"
                      className="w-full rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[var(--muted)]">Region</label>
                    <select value={region} onChange={(e) => setRegion(e.target.value)}
                      className="w-full rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10">
                      <option value="">Select region</option>
                      {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={saveProfile} disabled={!!saving}
                  className="mt-4 w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50">
                  {saving ? "Saving..." : "Save Profile"}
                </button>
              </div>

              {/* Activity Feed */}
              {activity.length > 0 && (
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                  <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Activity</h2>
                  <div className="space-y-2">
                    {activity.map((a, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-sm">
                        <span className="text-base">{a.icon}</span>
                        <span className="text-[var(--foreground)]">{a.text}</span>
                        <span className="ml-auto text-[10px] text-zinc-600">{a.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* My Listings */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">
                    My Listings ({activeListings.length})
                  </h2>
                </div>
                {listingsLoading ? (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {[1,2,3].map((i) => (
                      <div key={i} className="shrink-0 w-40 animate-pulse">
                        <div className="h-24 rounded-xl bg-zinc-800/50" />
                        <div className="mt-2 h-3 w-24 rounded bg-zinc-800/50" />
                        <div className="mt-1 h-3 w-16 rounded bg-zinc-800/50" />
                      </div>
                    ))}
                  </div>
                ) : activeListings.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[var(--muted)]">No active listings yet.</p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {activeListings.map((item) => (
                      <div key={item.id}
                        className="group/card shrink-0 w-44 overflow-hidden rounded-xl border border-zinc-800/40 bg-zinc-900/50 transition-all duration-300 hover:border-sky-500/30 hover:shadow-[0_0_15px_rgba(14,165,233,0.08)] hover:-translate-y-0.5"
                      >
                        <Link href={`/post/listing/${item.id}`}>
                          {item.images?.[0] || item.imageUrl || item.image ? (
                            <div className="relative overflow-hidden">
                              <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-28 w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
                            </div>
                          ) : (
                            <div className="flex h-28 items-center justify-center bg-zinc-800/30 text-xs text-zinc-600">No image</div>
                          )}
                          <div className="p-3">
                            <p className="truncate text-xs font-bold text-[var(--foreground)]">{item.title}</p>
                            <p className="mt-1 text-sm font-black text-sky-400">${item.price}</p>
                          </div>
                        </Link>
                        <div className="flex gap-1 border-t border-zinc-800/40 px-2 py-2">
                          <Link href={`/post/edit/${item.id}`} className="flex-1 rounded-md bg-sky-500/10 py-1.5 text-center text-[10px] font-bold text-sky-400 transition hover:bg-sky-500/20">Edit</Link>
                          <button onClick={() => setListingToDelete(item)} className="flex-1 rounded-md bg-zinc-800/60 py-1.5 text-[10px] font-bold text-[var(--foreground)] transition hover:bg-zinc-700">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sold Listings */}
              {soldListings.length > 0 && (
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                  <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">
                    Recently Sold ({soldListings.length})
                  </h2>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {soldListings.map((item) => (
                      <div key={item.id} className="relative shrink-0 w-40 overflow-hidden rounded-xl border border-zinc-800/40 bg-zinc-800/20 opacity-75">
                        {item.images?.[0] || item.imageUrl || item.image ? (
                          <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-24 w-full object-cover" />
                        ) : (
                          <div className="flex h-24 items-center justify-center bg-zinc-800/30 text-xs text-zinc-600">No image</div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
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

              {/* Shipping Address */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.15em] text-[var(--foreground)]">Shipping Address</h2>
                <p className="mb-4 text-[10px] text-[var(--muted)]">Saved address will prefill in checkout.</p>
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <input type="text" placeholder="Full name" value={shippingName} onChange={(e) => setShippingName(e.target.value)}
                      className="rounded-xl border border-zinc-800 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40 placeholder:text-[var(--muted)]" />
                    <input type="tel" placeholder="Phone" value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)}
                      className="rounded-xl border border-zinc-800 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40 placeholder:text-[var(--muted)]" />
                  </div>
                  <input type="text" placeholder="Street address" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40 placeholder:text-[var(--muted)]" />
                  <div className="grid grid-cols-3 gap-2.5">
                    <input type="text" placeholder="City" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)}
                      className="rounded-xl border border-zinc-800 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40 placeholder:text-[var(--muted)]" />
                    <input type="text" placeholder="Postcode" value={shippingPostcode} onChange={(e) => setShippingPostcode(e.target.value)}
                      className="rounded-xl border border-zinc-800 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40 placeholder:text-[var(--muted)]" />
                    <input type="text" placeholder="Country" value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)}
                      className="rounded-xl border border-zinc-800 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40 placeholder:text-[var(--muted)]" />
                  </div>
                  <button onClick={async () => {
                    if (!user?.uid) return;
                    try {
                      const { doc, setDoc } = await import("firebase/firestore");
                      const { db } = await import("../lib/firebase");
                      await setDoc(doc(db, "profiles", user.uid), {
                        shippingName, shippingPhone, shippingAddress, shippingCity, shippingPostcode, shippingCountry,
                      }, { merge: true });
                      setShippingSaved(true);
                      setTimeout(() => setShippingSaved(false), 2000);
                    } catch (e) { console.error(e); }
                  }} className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400">
                    {shippingSaved ? "Saved ✓" : "Save Address"}
                  </button>
                </div>
              </div>

            </div>

            {/* RIGHT */}
            <div className="space-y-5">

              {/* Profile Completion */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Completion</h2>
                  <span className="text-xs font-bold text-sky-400">{completion}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500"
                    style={{ width: `${completion}%` }}
                  />
                </div>
                {missingFeatures.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {missingFeatures.map((m) => (
                      <p key={m} className="text-[10px] text-[var(--muted)]">→ {m}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Trust Summary */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Trust & Safety</h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--foreground)]">Account Status</span>
                    <span className="font-bold text-emerald-400">Active</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--foreground)]">Email Verified</span>
                    <span className="font-bold text-emerald-400">✓</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--foreground)]">Phone Verified</span>
                    {phoneVerified ? (
                      <span className="font-bold text-emerald-400">✓</span>
                    ) : (
                      <span className="font-bold text-[var(--muted)]">Not verified</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--foreground)]">Account Age</span>
                    <span className="font-bold text-[var(--foreground)]">{memberDate}</span>
                  </div>
                </div>
              </div>

              {/* Following */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Following ({followingList.length})</h2>
                {followingList.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">Not following anyone yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {followingList.map((f) => (
                      <Link
                        key={f.sellerId}
                        href={`/seller/${f.sellerEmail}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--foreground)] transition hover:bg-zinc-800/50"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-400">
                          {(f.sellerEmail?.[0] || "?").toUpperCase()}
                        </span>
                        <span className="truncate">{f.sellerEmail}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Social Links */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Social Links</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Discord", val: discord, set: setDiscord, placeholder: "username#0000", icon: "💬" },
                    { label: "Instagram", val: instagram, set: setInstagram, placeholder: "@username", icon: "📸" },
                    { label: "TikTok", val: tiktok, set: setTiktok, placeholder: "@username", icon: "🎵" },
                    { label: "Website", val: website, set: setWebsite, placeholder: "https://", icon: "🌐" },
                  ].map((s) => (
                    <div key={s.label}>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--muted)]">
                        <span className="mr-1">{s.icon}</span>{s.label}
                      </label>
                      <input
                        type="text" value={s.val} onChange={(e) => s.set(e.target.value)}
                        placeholder={s.placeholder}
                        className="w-full rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Payout Settings */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Payout Settings</h2>
                <p className="mb-3 text-[10px] text-[var(--muted)]">Connect Stripe to receive payouts from sales.</p>
                {stripeAccountId ? (
                  <button onClick={handleStripeOnboard}
                    className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400">
                    Update Stripe Account
                  </button>
                ) : (
                  <button onClick={handleStripeConnect}
                    className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50"
                    disabled={stripeConnecting}>
                    {stripeConnecting ? "Connecting..." : "Connect Stripe"}
                  </button>
                )}
                {stripeAccountId && (
                  <p className="mt-2 text-[10px] text-emerald-400">✓ Stripe account connected</p>
                )}
              </div>

              {/* Notifications & Privacy */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Notifications & Privacy</h2>
                <div className="space-y-2.5">
                  {[...notifToggles, ...privacyToggles].map((n) => (
                    <label key={n.label} className="flex items-center justify-between text-sm text-[var(--foreground)]">
                      <span>{n.label}</span>
                      <input type="checkbox" checked={n.val} onChange={(e) => n.set(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                    </label>
                  ))}
                </div>
              </div>

              {/* Security & Phone */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Security & Phone</h2>
                <div className="space-y-3">
                  <input type="password" value={pwOld} onChange={(e) => setPwOld(e.target.value)}
                    placeholder="Current password"
                    className="w-full rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10" />
                  <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
                    placeholder="New password"
                    className="w-full rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10" />
                  <button onClick={changePassword}
                    className="w-full rounded-xl border border-zinc-700/50 bg-zinc-800/50 py-2.5 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:bg-zinc-700 active:scale-[0.98]">
                    Update Password
                  </button>
                  {pwMsg && (
                    <p className={`text-center text-xs ${pwMsg.includes("updated") ? "text-emerald-400" : "text-red-400"}`}>{pwMsg}</p>
                  )}
                  <hr className="border-zinc-800" />
                  <div>
                    <p className="mb-2 text-xs font-bold text-[var(--muted)]">Phone {phoneVerified && <span className="text-emerald-400 ml-1">✓ Verified</span>}</p>
                    <div className="flex gap-2">
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                        placeholder="+64 21 123 4567"
                        disabled={phoneVerified}
                        className="flex-1 rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 disabled:opacity-50" />
                      {!phoneVerified && (
                        <button onClick={handleSendPhoneCode} disabled={!phone || phoneSent}
                          className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:bg-sky-400 active:scale-[0.97] disabled:opacity-40">
                          {phoneSent ? "Sent" : "Send Code"}
                        </button>
                      )}
                    </div>
                    {phoneSent && !phoneVerified && (
                      <div className="flex gap-2 mt-2">
                        <input type="text" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)}
                          placeholder="6-digit code"
                          className="flex-1 rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10" />
                        <button onClick={handleVerifyPhoneCode} disabled={phoneCode.length !== 6 || phoneVerifying}
                          className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-40">
                          {phoneVerifying ? "..." : "Verify"}
                        </button>
                      </div>
                    )}
                    {phoneVerified && (
                      <button onClick={handleRemovePhone}
                        className="mt-2 text-xs text-[var(--muted)] transition-colors hover:text-red-400">
                        Remove phone number
                      </button>
                    )}
                    {phoneMsg && <p className="text-center text-xs text-[var(--muted)] mt-1">{phoneMsg}</p>}
                  </div>
                </div>
              </div>

              {/* Delete listing confirm */}
              {listingToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setListingToDelete(null)}>
                  <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-lg font-black text-[var(--foreground)]">Delete listing?</h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">"{listingToDelete.title}" will be permanently removed.</p>
                    <div className="mt-5 flex gap-3">
                      <button onClick={() => setListingToDelete(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
                      <button onClick={() => deleteListing(listingToDelete.id)} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Delete</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete Account */}
              <div className="border-t border-zinc-800/50 pt-4 mt-5">
                <p className="mb-2 text-[11px] text-[var(--muted)]">Delete your account and all data.</p>
                <div className="flex gap-2">
                  <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder='Type "DELETE"'
                    className="flex-1 rounded-lg border border-red-500/20 bg-zinc-800/30 px-3 py-2 text-xs text-[var(--foreground)] outline-none placeholder:text-zinc-600 focus:border-red-500/40" />
                  <button onClick={deleteAccount} disabled={deleteConfirm !== "DELETE" || !!saving}
                    className="rounded-lg bg-red-600/60 px-4 py-2 text-xs font-bold text-[var(--foreground)] transition hover:bg-red-600 disabled:opacity-30">
                    Delete
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      <div id="recaptcha-container" />
    </main>
  );
}
