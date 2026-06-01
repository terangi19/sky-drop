"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";
import { sanitizeHtml } from "../lib/sanitize";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  User,
} from "firebase/auth";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage, onAuthStateChanged } from "../lib/firebase";
import { sendPhoneCode, verifyPhoneCode, displayPhone } from "../lib/phone-auth";
import { checkImage } from "../lib/nsfw";
import { getLevelInfo } from "../lib/xp";
import { showToast } from "../components/Toast";
import { useProfile } from "../contexts/ProfileContext";

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
  profileBadge?: string;
  badges?: string[];
  shippingName?: string;
  shippingPhone?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingPostcode?: string;
  shippingCountry?: string;
  stripeAccountId?: string;
  xp?: number;
  referralCode?: string;
  referredBy?: string;
  proofOfAddress?: {
    status?: string;
    documentURL?: string;
    submittedAt?: Timestamp;
    reviewedAt?: Timestamp;
    reviewedBy?: string;
    rejectionReason?: string;
  };
  digitalListingsCreated?: number;
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
  const { setUsername: setContextUsername } = useProfile();
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
const [followerCount, setFollowerCount] = useState(0);
const [stripeAccountId, setStripeAccountId] = useState("");
const [stripeConnecting, setStripeConnecting] = useState(false);
const [referralCode, setReferralCode] = useState("");
const [referredBy, setReferredBy] = useState("");
const [poaStatus, setPoaStatus] = useState("unsubmitted");
const [poaDocumentURL, setPoaDocumentURL] = useState("");
const [poaRejectionReason, setPoaRejectionReason] = useState("");
const [poaFile, setPoaFile] = useState<File | null>(null);
const [poaUploading, setPoaUploading] = useState(false);
const [sellBadge, setSellBadge] = useState<string | null>(null);
const [sellBadgePrice, setSellBadgePrice] = useState("50");


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
            setReferralCode(data.referralCode || "");
            setReferredBy(data.referredBy || "");
            const poa = data.proofOfAddress || {};
            setPoaStatus(poa.status || "unsubmitted");
            setPoaDocumentURL(poa.documentURL || "");
            setPoaRejectionReason(poa.rejectionReason || "");


            if (!data.referralCode) {
              const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
              setReferralCode(newCode);
              await updateDoc(doc(db, "profiles", currentUser.uid), { referralCode: newCode }).catch((e) => console.error("Failed to save referral code:", e));
            }
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
    setDoc(ref, { lastActive: Timestamp.now() }, { merge: true }).catch((e) => console.error("Failed to update lastActive:", e));
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

  // Fetch follower count
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "followers"), where("sellerId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setFollowerCount(snap.size);
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

  const stats = useMemo(() => ({
    sales: soldListings.length || 0,
    responseTime: profile.responseTime || 0,
    followers: followerCount,
    following: followingList.length,
    views: 0,
  }), [soldListings.length, profile.responseTime, followerCount, followingList.length]);

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

  function dataURLtoBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(",");
    const mime = parts[0].match(/:(.*?);/)![1];
    const bytes = atob(parts[1]);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timed out after " + ms + "ms")), ms)),
    ]);
  }

  function resizeImage(file: File, maxW: number, maxH: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
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
      img.onerror = () => reject(new Error("Image failed to load"));
      img.src = URL.createObjectURL(file);
    });
  }

  async function uploadFileToStorage(
    file: File,
    path: string,
    maxW: number,
    maxH: number,
    setProfileField: (url: string) => void,
  ) {
    try {
      setSaving("Processing...");
      const dataUrl = await withTimeout(resizeImage(file, maxW, maxH), 15000);
      const blob = dataURLtoBlob(dataUrl);
      const storageRef = ref(storage, path);
      const snap = await withTimeout(uploadBytes(storageRef, blob), 30000);
      const url = await getDownloadURL(snap.ref);
      await setDoc(doc(db, "profiles", user!.uid), { [path.startsWith("avatars") ? "photoURL" : "bannerURL"]: url }, { merge: true });
      setProfileField(url);
      flashSaved();
    } catch (err: any) {
      console.error("Upload error:", err);
      const msg = err?.code === "storage/unauthorized" ? "Permission denied — check your Firebase Storage rules"
        : err?.code === "storage/bucket-not-found" || err?.message?.includes("bucket") ? "Storage bucket not found — go to Firebase Console → Storage → Get Started"
        : err?.message?.includes("Timed out") ? "Upload timed out — check Firebase Storage setup"
        : err?.message?.includes("Image failed") ? "Could not read image file"
        : `Upload failed: ${err?.message || err}`;
      setSaving(msg);
      setTimeout(() => setSaving(""), 4000);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const nsfwResult = await checkImage(file);
    if (!nsfwResult.safe) {
      showToast(`Avatar flagged: ${nsfwResult.reason}`, "error");
      e.target.value = "";
      return;
    }
    await uploadFileToStorage(file, `avatars/${user.uid}.jpg`, 400, 400, (url) => setProfile((p) => ({ ...p, photoURL: url })));
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const nsfwResult = await checkImage(file);
    if (!nsfwResult.safe) {
      showToast(`Banner flagged: ${nsfwResult.reason}`, "error");
      e.target.value = "";
      return;
    }
    await uploadFileToStorage(file, `banners/${user.uid}.jpg`, 1200, 400, (url) => setProfile((p) => ({ ...p, bannerURL: url })));
  }

  function flashSaved() {
    setSaved(true);
    setSaving("");
    setTimeout(() => setSaved(false), 2000);
  }

  // Save profile
  async function saveProfile() {
    if (!user) return;
    const newUsername = username.trim();
    if (!newUsername) { showToast("Enter a username.", "error"); return; }
    try {
      setSaving("Saving...");
      const sanitizedUsername = sanitizeHtml(newUsername);

      await runTransaction(db, async (transaction) => {
        const profileRef = doc(db, "profiles", user.uid);
        const profileSnap = await transaction.get(profileRef);
        const currentData = profileSnap.data() as ProfileData | undefined;

        if (currentData?.username !== sanitizedUsername) {
          const usernameRef = doc(db, "usernames", sanitizedUsername);
          const usernameSnap = await transaction.get(usernameRef);
          if (usernameSnap.exists()) {
            throw new Error("Username already taken");
          }
          if (currentData?.username) {
            transaction.delete(doc(db, "usernames", currentData.username));
          }
          transaction.set(usernameRef, { uid: user.uid });
        }

        transaction.set(profileRef, {
          username: sanitizedUsername,
          displayName: sanitizeHtml(displayName.trim()),
          bio: sanitizeHtml(bio.trim()),
          region,
          discord: sanitizeHtml(discord.trim()),
          instagram: sanitizeHtml(instagram.trim()),
          tiktok: sanitizeHtml(tiktok.trim()),
          website: sanitizeHtml(website.trim()),
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
          memberSince: currentData?.memberSince || Timestamp.now(),
          lastActive: Timestamp.now(),
        }, { merge: true });
      });

      // Update sellerUsername on all listings
      try {
        const { getDocs, query, collection, where, writeBatch } = await import("firebase/firestore");
        const listingsSnap = await getDocs(query(collection(db, "listings"), where("sellerEmail", "==", user.email)));
        const batch = writeBatch(db);
        listingsSnap.docs.forEach((doc_) => batch.update(doc_.ref, { sellerUsername: newUsername }));
        const tradeSnap = await getDocs(query(collection(db, "tradePosts"), where("sellerEmail", "==", user.email)));
        tradeSnap.docs.forEach((doc_) => batch.update(doc_.ref, { sellerUsername: newUsername }));
        await batch.commit();
      } catch { showToast("Profile saved, but some listings could not be updated.", "info"); }

      setContextUsername(newUsername);
      setProfile((p) => ({ ...p, username: newUsername, displayName: displayName.trim(), bio: bio.trim() }));
      flashSaved();
    } catch (e: any) {
      setSaving(e?.message === "Username already taken" ? "Username taken" : "Save failed");
      showToast(e?.message === "Username already taken" ? "Username already taken." : "Save failed", "error");
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
    if (deleteConfirm !== "DELETE") { showToast('Type DELETE to confirm.', "error"); return; }
    if (!user) return;
    try {
      setSaving("Deleting...");
      await deleteDoc(doc(db, "profiles", user.uid));
      await deleteUser(user);
      showToast("Account deleted.", "success");
      router.push("/");
    } catch (e: any) {
      if (e.code === "auth/requires-recent-login") {
        showToast("Please log out and log back in, then try again.", "error");
      } else {
        showToast("Delete failed. Re-login and try again.", "error");
      }
    }
    setSaving("");
  }

  // Phone verification
  async function handleSendPhoneCode() {
    if (!user || !phone) return;
    setPhoneMsg("Sending code...");
    setPhoneCode("");
    const result = await sendPhoneCode(phone);
    if (result.sent) {
      setPhoneSent(true);
      setPhoneMsg(result.viaEmail
        ? `Code sent to ${user.email}`
        : `Verification code sent to ${displayPhone(result.formattedPhone || phone)}`);
    } else {
      setPhoneMsg(result.error || "Failed to send verification code.");
    }
  }

  async function handleVerifyPhoneCode() {
    if (phoneCode.length !== 6) return;
    setPhoneVerifying(true);
    setPhoneMsg("Verifying...");
    const result = await verifyPhoneCode(phoneCode);
    if (result.ok) {
      setPhoneVerified(true);
      setPhoneMsg("Phone verified ✓");
      setPhoneCode("");
      setPhoneSent(false);
      if (user) {
        await setDoc(doc(db, "profiles", user.uid), {
          phoneNumber: phone,
          phoneVerified: true,
          phoneVerifiedAt: serverTimestamp(),
        }, { merge: true });
      }
    } else {
      setPhoneMsg(result.error || "Invalid code.");
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
      await setDoc(doc(db, "profiles", user.uid), {
        phoneNumber: "",
        phoneVerified: false,
        phoneVerifiedAt: null,
      }, { merge: true });
    }
  }

  function handlePhoneInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    const digits = v.replace(/\D/g, "");
    if (digits.length <= 12) setPhone(v);
  }

  async function deleteListing(id: string) {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "listings", id));
      setListingToDelete(null);
      showToast("Listing deleted", "success");
    } catch (e) { console.error(e); showToast("Failed to delete listing", "error"); }
  }

  async function handleStripeConnect() {
    if (!user?.uid || !user.email) return;
    setStripeConnecting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "create", email: user.email }),
      });
      const data = await res.json();
      if (data.accountId) {
        await setDoc(doc(db, "profiles", user.uid), { stripeAccountId: data.accountId }, { merge: true });
        setStripeAccountId(data.accountId);
        const token2 = await auth.currentUser?.getIdToken();
        const linkRes = await fetch("/api/stripe-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token2 ? { "Authorization": `Bearer ${token2}` } : {}) },
          body: JSON.stringify({ action: "onboard", accountId: data.accountId }),
        });
        const linkData = await linkRes.json();
        if (linkData.url) window.location.href = linkData.url;
      }
    } catch (e) { console.error(e); showToast("Failed to connect Stripe", "error"); }
    setStripeConnecting(false);
  }

  async function handleStripeOnboard() {
    if (!stripeAccountId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "onboard", accountId: stripeAccountId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) { console.error(e); showToast("Failed to open Stripe onboarding", "error"); }
  }

  const initial = (username || user?.email?.split("@")[0] || "U").charAt(0).toUpperCase();
  const memberDate = profile.memberSince?.toDate().toLocaleDateString("en-NZ", { year: "numeric", month: "short" }) || "2026";
  const avatarUrl = profile.photoURL;
  const bannerUrl = profile.bannerURL;

  const levelInfo = getLevelInfo(profile.xp || 0);
  const statItems = [
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
          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm">
            {/* Banner */}
            <div className="relative h-24 sm:h-32 cursor-pointer overflow-hidden" onClick={() => bannerRef.current?.click()}>
              {bannerUrl ? (
                <img src={bannerUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-sky-500/5 via-violet-500/5 to-zinc-900" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 hover:bg-black/40">
                <span className="rounded-full bg-black/60 backdrop-blur-sm px-4 py-1.5 text-xs font-bold text-white opacity-0 transition-all duration-300 group-hover:opacity-100">
                  {bannerUrl ? "Change Banner" : "Add Banner"}
                </span>
              </div>
            </div>
            <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />

            <div className="relative px-5 pb-5">
              {/* Avatar */}
              <div className="absolute -top-11 left-5 sm:-top-14 sm:left-6 cursor-pointer group/avatar" onClick={() => avatarRef.current?.click()}>
                {avatarUrl ? (
                  <div className="relative">
                    <img src={avatarUrl} alt=""
                      className="h-[72px] w-[72px] sm:h-24 sm:w-24 rounded-xl border-[3px] border-zinc-900 object-cover shadow-lg transition-all duration-300 group-hover/avatar:shadow-xl" />
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-all duration-300 group-hover/avatar:bg-black/50">
                      <span className="text-xs font-bold text-white opacity-0 transition-all duration-300 group-hover/avatar:opacity-100">Edit</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex h-[72px] w-[72px] sm:h-24 sm:w-24 items-center justify-center rounded-xl border-[3px] border-zinc-900 bg-zinc-950 shadow-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-10 w-10 sm:h-12 sm:w-12">
                        <circle cx="16" cy="16" r="14" fill="none" stroke="#38bdf8" strokeWidth="0.4" opacity="0.12" />
                        <circle cx="16" cy="16" r="12" fill="none" stroke="#38bdf8" strokeWidth="0.3" opacity="0.08" />
                        <path d="M2 9 C2 4, 8 1, 16 1 C24 1, 30 4, 30 9" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 9 C8 5.5, 12 3, 16 3 C20 3, 24 5.5, 24 9" fill="none" stroke="#38bdf8" strokeWidth="0.6" opacity="0.3" strokeLinecap="round" />
                        <line x1="6" y1="9.5" x2="10" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.35" strokeLinecap="round" />
                        <line x1="26" y1="9.5" x2="22" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.35" strokeLinecap="round" />
                        <line x1="16" y1="9.5" x2="16" y2="18" stroke="#38bdf8" strokeWidth="0.8" opacity="0.35" strokeLinecap="round" />
                        <rect x="10.5" y="18" width="11" height="9" rx="1.5" ry="1.5" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinejoin="round" />
                        <line x1="11" y1="21" x2="21" y2="21" stroke="#38bdf8" strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
                        <path d="M18 23 L21 23 L21 20" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-all duration-300 group-hover/avatar:bg-black/50">
                      <span className="text-xs font-bold text-white opacity-0 transition-all duration-300 group-hover/avatar:opacity-100">Add</span>
                    </div>
                  </div>
                )}
              </div>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

              <div className="pt-9 sm:pt-14">
                <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-3">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </Link>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--foreground)]">
                    {displayName || username || "No Name"}
                  </h1>
                  <span title={`Level ${levelInfo.level} — ${profile.xp || 0} XP`} className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                    Level {levelInfo.level}
                  </span>
                  {profile.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/20">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                      Verified
                    </span>
                  )}
                  {profile.topTrader && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">Top Trader</span>
                  )}
                  {profile.profileBadge === "epic" && (
                    <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-bold text-violet-400 border border-violet-500/20">💎 Epic</span>
                  )}
                  {!hideOnline && (
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-[var(--muted)]">@{username || "username"}</p>
                <p className="text-xs text-[var(--muted)]">{user?.email} · Joined {memberDate}</p>

                {/* Badges */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {profile.trustedSeller && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Trusted Seller</span>
                  )}
                  {profile.fastReply && (
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-400">Fast Reply</span>
                  )}
                  {profile.profileBadge === "epic" && (
                    <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold text-violet-400 ring-1 ring-violet-500/20">💎 Epic</span>
                  )}
                  {profile.profileBadge === "legendary" && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-400 ring-1 ring-amber-500/20 shadow-[0_0_8px_rgba(251,146,60,0.2)] animate-breathe-orange">👑 The Five</span>
                  )}
                </div>

                {/* Stats */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-7 gap-2">
                  {statItems.map((s) => (
                    <div key={s.label}
                      className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 text-center transition-all duration-200 hover:bg-white/[0.04]">
                      <p className="text-sm font-black text-[var(--foreground)]">{s.value}</p>
                      <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{s.label}</p>
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
              <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-5 transition-all duration-200 hover:bg-white/[0.04]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">About</h2>
                  <span className="text-[10px] text-zinc-600">{bio.length}/300</span>
                </div>
                <textarea value={bio} onChange={(e) => e.target.value.length <= 300 && setBio(e.target.value)}
                  placeholder="Tell buyers what you sell, where you're based, and how fast you reply..."
                  rows={3}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
              </div>

              {/* General */}
              <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-5 transition-all duration-200 hover:bg-white/[0.04]">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">General</h2>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-500">Username</label>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                      placeholder="Sky335i" maxLength={30}
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-500">Display Name</label>
                    <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="John Smith" maxLength={50}
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-500">Region</label>
                    <select value={region} onChange={(e) => setRegion(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10 appearance-none cursor-pointer">
                      <option value="">Select region</option>
                      {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={saveProfile} disabled={!!saving}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
                  {saving ? "Saving..." : "Save Profile"}
                </button>
              </div>

              {/* Referral Code */}
              {referralCode && (
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                  <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Referral Code</h2>
                  <p className="text-[10px] text-[var(--muted)]">Share your code — when someone signs up and completes verification, you both earn rewards!</p>
                  <div className="mt-3 flex gap-2">
                    <div className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm font-bold tracking-wider text-amber-400 select-all">
                      {referralCode}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(referralCode); }} className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-[var(--foreground)] hover:bg-sky-400 transition">
                      Copy
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--muted)]">
                    Share: <span className="text-sky-400 select-all">{window?.location?.origin || "https://sky-drop.vercel.app"}/login?ref={referralCode}</span>
                  </p>

                </div>
              )}

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
                  <div className="py-4 text-center">
                    <p className="text-sm text-[var(--muted)] mb-3">No active listings yet.</p>
                    <Link href="/post/ai" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:brightness-110 active:scale-[0.97]">
                      Create Your First Listing
                    </Link>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {activeListings.map((item) => (
                      <div key={item.id}
                        className="group/card shrink-0 w-44 overflow-hidden rounded-xl border border-zinc-800/40 bg-zinc-900/50 transition-all duration-300 hover:border-sky-500/30 hover:shadow-[0_0_15px_rgba(14,165,233,0.08)] hover:-translate-y-0.5"
                      >
                        <Link href={item.type === "service" ? "/services" : `/post/listing/${item.id}`}>
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
                          <Link href={`/post/ai?edit=${item.id}`} className="flex-1 rounded-md bg-sky-500/10 py-1.5 text-center text-[10px] font-bold text-sky-400 transition hover:bg-sky-500/20">Edit</Link>
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

              {/* Seller Onboarding Checklist */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Seller Checklist</h2>
                <div className="space-y-2">
                  {[
                    { label: "Complete Profile", done: !!(profile.bio && profile.photoURL), link: "#" },
                    { label: "Connect Stripe", done: !!stripeAccountId, link: "/profile" },
                    { label: "Watch Messages", done: false, link: "/messages" },
                    { label: "Respond to Offers", done: false, link: "/messages" },
                    { label: "Get Your First Sale", done: soldListings.length > 0, link: "/sales" },
                  ].map((item) => (
                    <Link key={item.label} href={item.link}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition hover:bg-zinc-800/50">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                        item.done
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "border border-zinc-700 text-zinc-500"
                      }`}>
                        {item.done ? "✓" : ""}
                      </span>
                      <span className={`${item.done ? "text-emerald-400/60 line-through" : "text-[var(--foreground)]"}`}>
                        {item.label}
                      </span>
                    </Link>
                  ))}
                </div>
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
                  {profile.profileBadge === "epic" && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-violet-400 font-bold">💎 Epic Seller</span>
                      <span className="text-violet-400/60 text-[10px]">Earned from Sky Crate</span>
                    </div>
                  )}
                  {profile.profileBadge === "legendary" && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-400 font-bold animate-pulse">👑 The Five</span>
                      <span className="text-amber-400/60 text-[10px]">Ultimate Sky Crate reward</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Verification */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Verification</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--foreground)]">📱 Phone</span>
                    {phoneVerified ? (
                      <span className="font-bold text-emerald-400">Verified ✓</span>
                    ) : (
                      <span className="font-bold text-[var(--muted)]">Not verified</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--foreground)]">📄 Proof of Address</span>
                    {poaStatus === "approved" && <span className="font-bold text-emerald-400">Approved ✓</span>}
                    {poaStatus === "pending" && <span className="font-bold text-amber-400">Pending review</span>}
                    {poaStatus === "rejected" && <span className="font-bold text-red-400">Rejected</span>}
                    {poaStatus === "unsubmitted" && <span className="font-bold text-[var(--muted)]">Not submitted</span>}
                  </div>
                  {poaStatus === "rejected" && poaRejectionReason && (
                    <p className="text-[10px] text-red-400">Reason: {poaRejectionReason}</p>
                  )}
                  {poaStatus === "unsubmitted" || poaStatus === "rejected" ? (
                    <div className="space-y-2">
                      <p className="text-[10px] text-[var(--muted)]">Upload a photo of a utility bill, bank statement, or official letter with your name and address.</p>
                      <input type="file" accept="image/*,.pdf" onChange={(e) => setPoaFile(e.target.files?.[0] || null)} className="w-full text-xs text-[var(--muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[var(--foreground)] hover:file:bg-sky-400" />
                      {poaFile && (
                        <button onClick={async () => {
                          if (!user?.uid || !poaFile) return;
                          const nsfwResult = await checkImage(poaFile);
                          if (!nsfwResult.safe) {
                            showToast("Document flagged as inappropriate", "error");
                            setPoaFile(null);
                            return;
                          }
                          setPoaUploading(true);
                          try {
                            const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
                            const { storage } = await import("../lib/firebase");
                            const ext = poaFile.name.split(".").pop();
                            const path = `proof_of_address/${user.uid}/${Date.now()}.${ext}`;
                            const storageRef = ref(storage, path);
                            await uploadBytes(storageRef, poaFile);
                            const url = await getDownloadURL(storageRef);
                            await setDoc(doc(db, "profiles", user.uid), {
                              proofOfAddress: { status: "pending", documentURL: url, submittedAt: Timestamp.now(), reviewedAt: null, reviewedBy: null, rejectionReason: null },
                            }, { merge: true });
                            setPoaStatus("pending");
                            setPoaDocumentURL(url);
                            setPoaFile(null);
                          } catch (e) { console.error(e); showToast("Failed to upload document", "error"); }
                          setPoaUploading(false);
                        }} disabled={poaUploading} className="w-full rounded-xl bg-sky-500 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-sky-400 transition disabled:opacity-50">
                          {poaUploading ? "Uploading..." : "Submit Document"}
                        </button>
                      )}
                    </div>
                  ) : poaStatus === "approved" && poaDocumentURL ? (
                    <a href={poaDocumentURL} target="_blank" rel="noopener noreferrer" className="inline-block text-[10px] text-sky-400 hover:underline">View submitted document →</a>
                  ) : null}
                  {referredBy && (
                    <p className="text-[10px] text-[var(--muted)]">Referred by code: <span className="font-bold text-amber-400">{referredBy}</span></p>
                  )}
                </div>
              </div>



              {/* Collectibles */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-zinc-700/50">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">🎒 Collectibles</h2>
                {(!profile.badges || profile.badges.length === 0) ? (
                  <p className="text-xs text-[var(--muted)]">Open Sky Crates to earn badges!</p>
                ) : (
                  <div className="space-y-2">
                    {profile.badges.map((badge) => (
                      <label key={badge} className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition hover:bg-zinc-800/50" onClick={async () => {
                        if (!user?.uid) return;
                        await setDoc(doc(db, "profiles", user.uid), { profileBadge: badge }, { merge: true });
                        setProfile((p) => ({ ...p, profileBadge: badge }));
                      }}>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{badge === "epic" ? "💎" : "👑"}</span>
                          <span className={`text-xs font-bold ${badge === "epic" ? "text-violet-400" : "text-amber-400"}`}>
                            {badge === "epic" ? "Epic Seller" : "The Five"}
                          </span>
                        </div>
                          <div className={`h-4 w-4 rounded-full border-2 ${profile.profileBadge === badge ? (badge === "epic" ? "border-violet-400 bg-violet-400" : "border-amber-400 bg-amber-400") : "border-zinc-600"} transition`}>
                            {profile.profileBadge === badge && (
                              <svg className="h-full w-full p-0.5 text-zinc-900" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                            )}
                          </div>
                      </label>
                    ))}
                    {profile.profileBadge && (
                      <button onClick={async () => {
                        if (!user?.uid) return;
                        await setDoc(doc(db, "profiles", user.uid), { profileBadge: "" }, { merge: true });
                        setProfile((p) => ({ ...p, profileBadge: "" }));
                      }} className="mt-1 w-full rounded-lg border border-zinc-700/50 py-1.5 text-[10px] font-bold text-[var(--muted)] transition hover:text-red-400 hover:border-red-500/30">
                        Hide badge
                      </button>
                    )}
                  </div>
                )}
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
                      <input type="tel" value={phone} onChange={handlePhoneInput}
                        placeholder="021 123 4567"
                        disabled={phoneSent && !phoneVerified}
                        className="flex-1 rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 disabled:opacity-50" />
                      {!phoneVerified && (
                        <button onClick={handleSendPhoneCode} disabled={!phone || phoneVerifying}
                          className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:bg-sky-400 active:scale-[0.97] disabled:opacity-40">
                          {phoneVerifying ? "..." : phoneSent ? "Resend Code" : "Send Code"}
                        </button>
                      )}
                    </div>
                    {phoneSent && !phoneVerified && (
                      <div className="flex gap-2 mt-2">
                        <input type="text" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="Enter code"
                          className="flex-1 rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10" />
                        <button onClick={handleVerifyPhoneCode} disabled={phoneCode.length !== 6 || phoneVerifying}
                          className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-40">
                          {phoneVerifying ? "..." : "Verify"}
                        </button>
                      </div>
                    )}
                    {phoneVerified && (
                      <button onClick={handleRemovePhone}
                        className="mt-2 text-xs text-zinc-500 transition-colors hover:text-red-400">
                        Remove phone number
                      </button>
                    )}
                    {phoneMsg && <p className={`text-center text-xs mt-1 ${phoneMsg.includes("✓") ? "text-emerald-400" : "text-zinc-400"}`}>{phoneMsg}</p>}
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

      {/* Profile main content continues */}

      {sellBadge && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSellBadge(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-center text-lg font-black text-[var(--foreground)]">
              {sellBadge === "epic" ? "💎 Epic" : "👑 The Five"} Badge
            </h3>
            <p className="mt-2 text-center text-sm text-[var(--muted)]">
              {sellBadge === "legendary" ? "Only 5 of these exist on Sky Drop. " : ""}
              Selling transfers your badge to the buyer. This cannot be undone.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-bold text-[var(--muted)]">Price ($)</label>
              <input type="number" min="1" step="0.01" value={sellBadgePrice} onChange={(e) => setSellBadgePrice(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40"
                autoFocus />
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setSellBadge(null)}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] transition-all">
                Cancel
              </button>
              <button onClick={async () => {
                const price = sellBadgePrice.trim();
                if (!price || isNaN(Number(price)) || Number(price) <= 0) {
                  showToast("Enter a valid price.", "error");
                  return;
                }
                const existing = await getDocs(query(collection(db, "tradePosts"), where("sellerEmail", "==", user!.email), where("badgeForSale", "==", sellBadge), where("status", "==", "live")));
                if (!existing.empty) { showToast("You already have an active listing for this badge.", "info"); setSellBadge(null); return; }
                const title = sellBadge === "epic" ? "💎 Epic Seller Badge" : "👑 The Five Badge";
                const ref = await addDoc(collection(db, "tradePosts"), {
                  type: "WTS", title, price, message: sellBadge === "epic" ? "Epic Seller badge for sale." : "👑 The Five badge for sale. Only 5 exist on Sky Drop.",
                  sellerEmail: user!.email, sellerUsername: username || user!.email,
                  badgeForSale: sellBadge, status: "live", saleType: "buy_now",
                  replies: [], images: [], views: 1, offers: 0,
                  createdAt: serverTimestamp(),
                });
                setSellBadge(null);
                showToast("Badge listed for sale! View it in Trade Feed.", "success");
                router.push("/trade-feed");
              }} className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                List for Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
