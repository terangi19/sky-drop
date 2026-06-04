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
  writeBatch,
} from "firebase/firestore";
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  updatePassword,
  User,
} from "firebase/auth";
import { getListingBlockReason } from "../lib/seller-eligibility";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage, onAuthStateChanged } from "../lib/firebase";
import { sendPhoneCode, verifyPhoneCode, maskPhone, isPhoneDevMode, formatNZPhone } from "../lib/phone-auth";
import { checkImage } from "../lib/nsfw";
import { showToast } from "../components/Toast";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { countSellerSales } from "../lib/arrange-purchase-status";
import { hasArrangePaymentDetails } from "../lib/arrange-payment-details";
import { useProfile } from "../contexts/ProfileContext";

interface ProfileData {
  username?: string;
  // displayName removed — use username only
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
  email?: string;
  phone?: string;
  phoneNumber?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  profileBadge?: string;
  badges?: string[];
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
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankReference?: string;
  restricted?: boolean;
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
  const { username: contextUsername, setUsername: setContextUsername } = useProfile();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState(false);

  const [profile, setProfile] = useState<ProfileData>({});
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [discord, setDiscord] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [website, setWebsite] = useState("");
  const [showSocialFields, setShowSocialFields] = useState(false);
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
  const [sellerPurchases, setSellerPurchases] = useState<
    Array<{ status?: string; paymentType?: string }>
  >([]);

  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [listingToDelete, setListingToDelete] = useState<any>(null);
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
const [phoneCode, setPhoneCode] = useState("");
const [phoneSent, setPhoneSent] = useState(false);
const [phoneMsg, setPhoneMsg] = useState("");
const [phoneVerifying, setPhoneVerifying] = useState(false);
const [phoneCooldown, setPhoneCooldown] = useState(0);
const [followingList, setFollowingList] = useState<{sellerEmail: string; sellerId: string; createdAt: Timestamp}[]>([]);
const [followerCount, setFollowerCount] = useState(0);
const [stripeAccountId, setStripeAccountId] = useState("");
const [stripeConnecting, setStripeConnecting] = useState(false);
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankReference, setBankReference] = useState("");
const [referralCode, setReferralCode] = useState("");
const [referredBy, setReferredBy] = useState("");
const [poaStatus, setPoaStatus] = useState("unsubmitted");
const [poaDocumentURL, setPoaDocumentURL] = useState("");
const [poaRejectionReason, setPoaRejectionReason] = useState("");
const [poaFile, setPoaFile] = useState<File | null>(null);
const [poaUploading, setPoaUploading] = useState(false);
const [sellBadge, setSellBadge] = useState<string | null>(null);
const [sellBadgePrice, setSellBadgePrice] = useState("50");
const [authRefreshing, setAuthRefreshing] = useState(false);

  const bannerRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const referralInitRef = useRef(false);

  const applyProfileData = useCallback((data: ProfileData) => {
    const uname = data.username || "";
    setProfile(data);
    setUsername(uname);
    setContextUsername(uname);
    setBio(data.bio || "");
    setRegion(data.region || "");
    setDiscord(data.discord || "");
    setInstagram(data.instagram || "");
    setTiktok(data.tiktok || "");
    setWebsite(data.website || "");
    setShowSocialFields(
      !!(data.discord?.trim() || data.instagram?.trim() || data.tiktok?.trim() || data.website?.trim())
    );
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
    setPhone(data.phone || data.phoneNumber || "");
    setPhoneVerified(!!(data.phoneVerified || data.verified));
    setStripeAccountId(data.stripeAccountId || "");
    setBankAccountName(data.bankAccountName || "");
    setBankAccountNumber(data.bankAccountNumber || "");
    setBankReference(data.bankReference || "");
    setReferralCode(data.referralCode || "");
    setReferredBy(data.referredBy || "");
    const poa = data.proofOfAddress || {};
    setPoaStatus(poa.status || "unsubmitted");
    setPoaDocumentURL(poa.documentURL || "");
    setPoaRejectionReason(poa.rejectionReason || "");
  }, [setContextUsername]);

  const listingBlockReason = user
    ? getListingBlockReason({
        authEmailVerified: !!user.emailVerified,
        phone: phone || profile.phone || profile.phoneNumber || "",
        phoneVerified: phoneVerified || !!profile.phoneVerified || !!profile.verified,
        authPhoneNumber: user.phoneNumber,
        restricted: !!profile.restricted,
        profileExists: !!(profile.username || profile.email || user.uid),
      })
    : null;
  const readyToList = listingBlockReason === null;

  async function refreshAuthVerification() {
    if (!user) return;
    setAuthRefreshing(true);
    try {
      await user.reload();
      setUser(auth.currentUser);
      if (auth.currentUser?.emailVerified) {
        showToast("Email verified — you can list items if your phone is verified too.", "success");
        await setDoc(
          doc(db, "profiles", user.uid),
          { emailVerified: true },
          { merge: true }
        );
      } else {
        showToast("Email not verified yet. Check your inbox and spam folder.", "info");
      }
    } catch {
      showToast("Could not refresh status. Try signing out and back in.", "error");
    }
    setAuthRefreshing(false);
  }

  async function resendVerificationEmail() {
    if (!user) return;
    try {
      await sendEmailVerification(user, { url: window.location.origin + "/profile" });
      showToast("Verification email sent. Click the link, then tap Refresh status.", "success");
    } catch {
      showToast("Could not send verification email. Try again in a minute.", "error");
    }
  }

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
        referralInitRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  // Live profile sync (keeps username after save + refresh)
  useEffect(() => {
    if (!user?.uid) return;

    const unsub = onSnapshot(
      doc(db, "profiles", user.uid),
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ProfileData;
          applyProfileData(data);

          if (!data.referralCode && !referralInitRef.current) {
            referralInitRef.current = true;
            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            setReferralCode(newCode);
            await setDoc(
              doc(db, "profiles", user.uid),
              { referralCode: newCode },
              { merge: true }
            ).catch((e) => console.error("Failed to save referral code:", e));
          }
        }
        setLoading(false);
      },
      (err) => {
        console.error("Profile snapshot error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user?.uid, applyProfileData]);

  // Update lastActive on mount
  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, "profiles", user.uid);
    setDoc(ref, { lastActive: Timestamp.now() }, { merge: true }).catch((e) => console.error("Failed to update lastActive:", e));
  }, [user?.uid]);

  useEffect(() => {
    if (loading) return;
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading]);

  // Repair Firestore when phone is linked in Auth but missing on profile (common after save/sync bugs)
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        await user.reload();
      } catch {
        /* continue */
      }
      const authPhone = auth.currentUser?.phoneNumber?.trim();
      if (!authPhone || cancelled) return;
      const snap = await getDoc(doc(db, "profiles", user.uid));
      const data = snap.data();
      const stored = String(data?.phone || data?.phoneNumber || "").trim();
      if (stored && (data?.phoneVerified || data?.verified)) return;
      await setDoc(
        doc(db, "profiles", user.uid),
        {
          phone: authPhone,
          phoneNumber: authPhone,
          phoneVerified: true,
          verified: true,
        },
        { merge: true }
      );
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    if (!user?.email) {
      setSellerPurchases([]);
      return;
    }
    const q = query(
      collection(db, "purchases"),
      where("sellerEmail", "==", user.email)
    );
    const unsub = onSnapshot(q, (snap) => {
      setSellerPurchases(snap.docs.map((d) => d.data() as { status?: string; paymentType?: string }));
    });
    return () => unsub();
  }, [user?.email]);

  // Computed
  const activeListings = useMemo(() => listings.filter((l) => isListingVisibleInMarketplace(l)), [listings]);
  const soldListings = useMemo(() => listings.filter((l) => !isListingVisibleInMarketplace(l)), [listings]);
  const completedSalesCount = useMemo(
    () => countSellerSales(sellerPurchases),
    [sellerPurchases]
  );

  const stats = useMemo(() => ({
    sales: completedSalesCount,
    responseTime: profile.responseTime || 0,
    followers: followerCount,
    following: followingList.length,
    views: 0,
  }), [completedSalesCount, profile.responseTime, followerCount, followingList.length]);

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

  function usernameForSave(): string {
    return username.trim() || String(profile.username || contextUsername || "").trim();
  }

  // Save profile (full form or bank details only from Payment settings)
  async function saveProfile(opts?: { bankOnly?: boolean }) {
    if (!user) return;
    const newUsername = usernameForSave();
    if (!newUsername) {
      showToast(
        opts?.bankOnly
          ? "Set a username in Profile information first."
          : "Enter a username.",
        "error"
      );
      return;
    }
    try {
      setSaving(opts?.bankOnly ? "Saving bank details..." : "Saving...");

      const formattedPhone = phone.trim() ? formatNZPhone(phone) : "";
      const existingPhone = String(profile.phone || profile.phoneNumber || "").trim();
      const isPhoneMarkedVerified = phoneVerified || !!profile.phoneVerified || !!profile.verified;
      const phoneToSave =
        formattedPhone || (isPhoneMarkedVerified ? existingPhone : "");

      const profilePayload: Record<string, unknown> = {
        username: newUsername,
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
        bankAccountName: bankAccountName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankReference: bankReference.trim(),
        email: user.email || "",
        lastActive: Timestamp.now(),
        memberSince: profile.memberSince || Timestamp.now(),
      };
      if (phoneToSave) {
        profilePayload.phone = phoneToSave;
        profilePayload.phoneNumber = phoneToSave;
      }

      const usernameKey = newUsername.toLowerCase();
      const existingUname = await getDoc(doc(db, "usernames", usernameKey));
      if (existingUname.exists() && existingUname.data()?.uid !== user.uid) {
        throw new Error("Username already taken");
      }

      const token = await auth.currentUser?.getIdToken(true);
      if (!token) { showToast("Please sign in again", "error"); return; }
      const res = await fetch("/api/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(profilePayload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error || "Save failed";
        if (res.status === 409) {
          throw new Error("Username already taken");
        }
        throw new Error(msg);
      }

      const clientMerge: Record<string, unknown> = { ...profilePayload };
      if (!phoneToSave && isPhoneMarkedVerified) {
        delete clientMerge.phone;
        delete clientMerge.phoneNumber;
      }
      await setDoc(doc(db, "profiles", user.uid), clientMerge, { merge: true });
      try {
        await setDoc(doc(db, "usernames", usernameKey), { uid: user.uid }, { merge: true });
      } catch {
        /* usernames collection optional */
      }

      // Update sellerUsername on all listings
      try {
        const listingsSnap = await getDocs(query(collection(db, "listings"), where("sellerEmail", "==", user.email)));
        const batch = writeBatch(db);
        listingsSnap.docs.forEach((doc_) => batch.update(doc_.ref, { sellerUsername: newUsername }));
        const tradeSnap = await getDocs(query(collection(db, "tradePosts"), where("sellerEmail", "==", user.email)));
        tradeSnap.docs.forEach((doc_) => batch.update(doc_.ref, { sellerUsername: newUsername }));
        await batch.commit();
      } catch {
        showToast("Profile saved, but some listings could not be updated.", "info");
      }

      setUsername(newUsername);
      setContextUsername(newUsername);
      setProfile((p) => ({
        ...p,
        username: newUsername,
        bio: bio.trim(),
        bankAccountName: bankAccountName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankReference: bankReference.trim(),
      }));
      flashSaved();
      if (opts?.bankOnly) showToast("Bank details saved.", "success");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Save failed";
      setSaving(message === "Username already taken" ? "Username taken" : "Save failed");
      showToast(message === "Username already taken" ? "Username already taken." : message, "error");
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
      setPhoneMsg(
        result.devMode || isPhoneDevMode()
          ? "Development mode: no SMS is sent. Enter code 000000."
          : `SMS sent to ${maskPhone(result.formattedPhone || phone)}`
      );
      setPhoneCooldown(30);
    } else {
      setPhoneMsg(result.error || "Failed to send verification code.");
    }
  }

  useEffect(() => {
    if (phoneCooldown <= 0) return;
    const t = setInterval(() => setPhoneCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [phoneCooldown]);

  async function handleVerifyPhoneCode() {
    if (phoneCode.length !== 6) return;
    setPhoneVerifying(true);
    setPhoneMsg("Verifying...");
    const result = await verifyPhoneCode(phoneCode);
    if (result.ok) {
      setPhoneVerified(true);
      setPhoneMsg("Verified Phone ✅");
      setPhoneCode("");
      setPhoneSent(false);
      if (user) {
        const formattedPhone = formatNZPhone(phone);
        setPhone(formattedPhone);
        await setDoc(doc(db, "profiles", user.uid), {
          phone: formattedPhone,
          phoneNumber: formattedPhone,
          phoneVerified: true,
          phoneVerifiedAt: serverTimestamp(),
          verified: true,
        }, { merge: true });
        try {
          await user.reload();
          setUser(auth.currentUser);
        } catch {
          /* profile doc is source of truth */
        }
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
        phone: "",
        phoneNumber: "",
        phoneVerified: false,
        phoneVerifiedAt: null,
        verified: false,
      }, { merge: true });
    }
  }

  function handlePhoneInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    const digits = v.replace(/\D/g, "");
    if (digits.length > 12) return;
    if (v !== phone && phoneVerified) {
      setPhoneVerified(false);
      setPhoneSent(false);
      setPhoneCode("");
      setPhoneMsg("");
      if (user) {
        setDoc(doc(db, "profiles", user.uid), { phoneVerified: false }, { merge: true });
      }
    }
    setPhone(v);
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
      if (!token) { showToast("Please sign in again", "error"); setStripeConnecting(false); return; }

      const res = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "create", email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to create Stripe account", "error"); setStripeConnecting(false); return; }
      if (!data.accountId) { showToast("No account ID returned from Stripe", "error"); setStripeConnecting(false); return; }

      await setDoc(doc(db, "profiles", user.uid), { stripeAccountId: data.accountId }, { merge: true });
      setStripeAccountId(data.accountId);

      const token2 = await auth.currentUser?.getIdToken();
      if (!token2) { showToast("Please sign in again", "error"); setStripeConnecting(false); return; }

      const linkRes = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
        body: JSON.stringify({ action: "onboard", accountId: data.accountId }),
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) { showToast(linkData.error || "Failed to open Stripe onboarding", "error"); setStripeConnecting(false); return; }
      if (!linkData.url) { showToast("No onboarding URL returned", "error"); setStripeConnecting(false); return; }

      window.location.href = linkData.url;
    } catch (e) { console.error(e); showToast("Failed to connect Stripe", "error"); }
    setStripeConnecting(false);
  }

  async function handleStripeOnboard() {
    if (!stripeAccountId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { showToast("Please sign in again", "error"); return; }

      const res = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "onboard", accountId: stripeAccountId }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to open Stripe onboarding", "error"); return; }
      if (!data.url) { showToast("No onboarding URL returned", "error"); return; }

      window.location.href = data.url;
    } catch (e) { console.error(e); showToast("Failed to open Stripe onboarding", "error"); }
  }

  const initial = (contextUsername || username || "U").charAt(0).toUpperCase();
  const memberDate = profile.memberSince?.toDate().toLocaleDateString("en-NZ", { year: "numeric", month: "short" }) || "2026";
  const avatarUrl = profile.photoURL;
  const bannerUrl = profile.bannerURL;

  const statItems = [
    { label: "Sales", value: String(stats.sales) },
    { label: "Listings", value: String(activeListings.length) },
    { label: "Followers", value: String(stats.followers) },
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

  const hasSocialLinks = [discord, instagram, tiktok, website].some((v) => v.trim().length > 0);

  const settingsSection =
    "rounded-2xl border border-white/[0.04] bg-white/[0.02] p-6 sm:p-7 backdrop-blur-sm";
  const fieldInput =
    "w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-all placeholder:text-zinc-600 focus:border-sky-500/30 focus:bg-white/[0.05] focus:shadow-[0_0_0_1px_rgba(56,189,248,0.15)]";

  if (loading) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar /><ThemeToggle />
        <div className="relative z-10 mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
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
        <div className="relative z-10 mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
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

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="space-y-4">

          {/* ALERT */}
          {saving && (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] px-5 py-3.5 text-sm text-sky-400 backdrop-blur-sm shadow-[0_0_20px_rgba(56,189,248,0.05)]">
              {saving}
            </div>
          )}
          {saved && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-3.5 text-sm text-emerald-400 backdrop-blur-sm shadow-[0_0_20px_rgba(16,185,129,0.05)]">
              Saved successfully!
            </div>
          )}

          {/* ===== PROFILE HEADER ===== */}
          <div className="group relative overflow-hidden rounded-3xl border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            {/* Banner */}
            <div className="relative h-28 sm:h-36 cursor-pointer overflow-hidden" onClick={() => bannerRef.current?.click()}>
              {bannerUrl ? (
                <img src={bannerUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-sky-500/8 via-violet-500/8 to-zinc-900" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 hover:bg-black/50">
                <span className="rounded-full bg-black/50 backdrop-blur-md px-5 py-2 text-xs font-semibold text-white/80 opacity-0 transition-all duration-300 group-hover:opacity-100 border border-white/[0.06]">
                  {bannerUrl ? "Change Banner" : "Add Banner"}
                </span>
              </div>
            </div>
            <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />

            <div className="relative px-6 pb-6">
              {/* Avatar */}
              <div className="absolute -top-12 left-6 sm:-top-16 sm:left-7 cursor-pointer group/avatar" onClick={() => avatarRef.current?.click()}>
                {avatarUrl ? (
                  <div className="relative">
                    <img src={avatarUrl} alt=""
                      className="h-[80px] w-[80px] sm:h-[88px] sm:w-[88px] rounded-2xl border-[3px] border-zinc-900 object-cover shadow-xl transition-all duration-300 group-hover/avatar:shadow-2xl" />
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 transition-all duration-300 group-hover/avatar:bg-black/50">
                      <span className="text-xs font-bold text-white opacity-0 transition-all duration-300 group-hover/avatar:opacity-100">Edit</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex h-[80px] w-[80px] sm:h-[88px] sm:w-[88px] items-center justify-center rounded-2xl border-[3px] border-zinc-900 bg-zinc-950 shadow-xl">
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
                        <path d="M12.5 22.5 L15 22.5" stroke="#38bdf8" strokeWidth="0.8" opacity="0.3" strokeLinecap="round" />
                        <path d="M12.5 24.5 L17 24.5" stroke="#38bdf8" strokeWidth="0.8" opacity="0.2" strokeLinecap="round" />
                        <path d="M18 23 L21 23 L21 20" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 transition-all duration-300 group-hover/avatar:bg-black/50">
                      <span className="text-xs font-bold text-white opacity-0 transition-all duration-300 group-hover/avatar:opacity-100">Add</span>
                    </div>
                  </div>
                )}
              </div>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

              <div className="pt-11 sm:pt-[72px]">
                <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-white/[0.06] mb-4">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </Link>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--foreground)]">
                        {contextUsername || username || "User"}
                  </h1>
                  {phoneVerified && (
                    <span
                      title="Phone number verified — required to sell"
                      className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-bold text-sky-400 border border-sky-500/20"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                      Verified
                    </span>
                  )}
                  {profile.topTrader && (
                    <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-400 border border-amber-500/20">Top Trader</span>
                  )}
                  {profile.profileBadge === "epic" && (
                    <span className="rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-bold text-violet-400 border border-violet-500/20">💎 Epic</span>
                  )}
                  {!hideOnline && (
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-400 border border-emerald-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">@{contextUsername || username || "username"}</p>
                <p className="text-xs text-zinc-600">Joined {memberDate}</p>

                {/* Badges */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {profile.trustedSeller && (
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">Trusted Seller</span>
                  )}
                  {profile.fastReply && (
                    <span className="rounded-full bg-sky-500/10 px-3 py-1 text-[10px] font-bold text-sky-400 border border-sky-500/20">Fast Reply</span>
                  )}
                  {profile.profileBadge === "epic" && (
                    <span className="rounded-full bg-violet-500/10 px-3 py-1 text-[10px] font-bold text-violet-400 border border-violet-500/20">💎 Epic</span>
                  )}
                  {profile.profileBadge === "legendary" && (
                    <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-bold text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(251,146,60,0.15)]">👑 The Five</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats — Sales | Listings | Followers */}
          <div className="grid grid-cols-3 gap-3">
            {statItems.map((s) => (
              <div key={s.label}
                className="rounded-2xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-center transition-all duration-200 hover:bg-white/[0.04] hover:border-white/[0.08]">
                <p className="text-lg font-black text-[var(--foreground)]">{s.value}</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Profile Information */}
          <div className={settingsSection}>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20">
                <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)]">Profile information</h2>
                <p className="mt-0.5 text-sm text-zinc-500">How buyers see you on Sky Drop.</p>
              </div>
            </div>

            <div className="mb-5 flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3 border border-white/[0.04]">
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500" style={{ width: `${completion}%` }} />
              </div>
              <span className="shrink-0 text-xs font-semibold text-zinc-400">{completion}% complete</span>
            </div>

            {!readyToList && (
              <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-sm text-amber-400/90">
                {listingBlockReason || "Verify your email and phone to create listings."}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-400">Bio</label>
                  <span className="text-xs text-zinc-600">{bio.length}/300</span>
                </div>
                <textarea value={bio} onChange={(e) => e.target.value.length <= 300 && setBio(e.target.value)}
                  placeholder="What you sell, where you're based, how fast you reply..."
                  rows={3}
                  className={fieldInput} />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-400">Username</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">@</span>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                      placeholder="sky" maxLength={30}
                      className={`${fieldInput} pl-8`} />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-400">Region</label>
                  <select value={region} onChange={(e) => setRegion(e.target.value)}
                    className={`${fieldInput} cursor-pointer appearance-none`}>
                    <option value="">Select region</option>
                    {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {(hasSocialLinks || showSocialFields) ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    { label: "Discord", val: discord, set: setDiscord, placeholder: "username" },
                    { label: "Instagram", val: instagram, set: setInstagram, placeholder: "@username" },
                    { label: "TikTok", val: tiktok, set: setTiktok, placeholder: "@username" },
                    { label: "Website", val: website, set: setWebsite, placeholder: "https://" },
                  ].map((s) => (
                    <div key={s.label}>
                      <label className="mb-2 block text-sm font-medium text-zinc-400">{s.label}</label>
                      <input type="text" value={s.val} onChange={(e) => s.set(e.target.value)} placeholder={s.placeholder} className={fieldInput} />
                    </div>
                  ))}
                </div>
              ) : (
                <button type="button" onClick={() => setShowSocialFields(true)}
                  className="text-sm font-medium text-sky-400 transition-colors hover:text-sky-300">
                  + Add social links
                </button>
              )}

              <button onClick={() => saveProfile()} disabled={!!saving}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
                {saving ? "Saving..." : "Save changes"}
              </button>

              <div className="border-t border-white/[0.06] pt-5">
                <p className="mb-4 text-sm font-medium text-zinc-400">Password</p>
                <div className="space-y-3">
                  <input type="password" value={pwOld} onChange={(e) => setPwOld(e.target.value)} placeholder="Current password" className={fieldInput} />
                  <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="New password" className={fieldInput} />
                  <button onClick={changePassword}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-sm font-medium transition-colors hover:bg-white/[0.06] active:scale-[0.98]">
                    Update password
                  </button>
                  {pwMsg && (
                    <p className={`text-xs ${pwMsg.includes("updated") ? "text-emerald-400" : "text-red-400"}`}>{pwMsg}</p>
                  )}
                </div>
              </div>

              {followingList.length > 0 && (
                <div className="border-t border-white/[0.06] pt-5">
                  <p className="mb-3 text-sm font-medium text-zinc-400">Following ({followingList.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {followingList.map((f) => (
                      <Link key={f.sellerId} href={`/seller/${f.sellerEmail}`}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs transition-all hover:bg-white/[0.06] hover:border-white/[0.12]">
                        {f.sellerEmail?.split("@")[0] || "User"}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Listings */}
          <div className={settingsSection}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)]">Your listings</h2>
                <p className="mt-0.5 text-sm text-zinc-500">{activeListings.length} active listing{activeListings.length === 1 ? "" : "s"}</p>
              </div>
              {activeListings.length > 0 && (
                <Link href="/post/ai" className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-400 transition-all active:scale-[0.97]">
                  + New
                </Link>
              )}
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
                  <div className="py-8 text-center">
                    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10">
                      <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">No active listings yet.</p>
                    <Link href="/post/ai" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:brightness-110 active:scale-[0.97]">
                      Create Your First Listing
                    </Link>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {activeListings.map((item) => (
                      <div key={item.id}
                        className="group/card shrink-0 w-44 overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02] transition-all duration-300 hover:border-sky-500/20 hover:shadow-[0_0_20px_rgba(14,165,233,0.06)] hover:-translate-y-0.5"
                      >
                        <Link href={item.type === "service" ? "/services" : `/post/listing/${item.id}`}>
                          {item.images?.[0] || item.imageUrl || item.image ? (
                            <div className="relative overflow-hidden">
                              <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-28 w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
                            </div>
                          ) : (
                            <div className="flex h-28 items-center justify-center bg-white/[0.03] text-xs text-zinc-600">No image</div>
                          )}
                          <div className="p-3">
                            <p className="truncate text-xs font-bold text-[var(--foreground)]">{item.title}</p>
                            <p className="mt-1 text-sm font-black text-sky-400">${item.price}</p>
                          </div>
                        </Link>
                        <div className="flex gap-1.5 border-t border-white/[0.04] px-2.5 py-2">
                          <Link href={`/post/ai?edit=${item.id}`} className="flex-1 rounded-lg bg-sky-500/10 py-1.5 text-center text-[10px] font-bold text-sky-400 transition hover:bg-sky-500/20 active:scale-[0.97]">Edit</Link>
                          <button onClick={() => setListingToDelete(item)} className="flex-1 rounded-lg bg-white/[0.04] py-1.5 text-[10px] font-bold text-[var(--foreground)] transition hover:bg-white/[0.06] active:scale-[0.97]">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

            {soldListings.length > 0 && (
              <div className="mt-6 border-t border-white/[0.04] pt-5">
                <p className="mb-3 text-sm font-medium text-zinc-500">Sold ({soldListings.length})</p>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                  {soldListings.map((item) => (
                    <div key={item.id} className="relative w-36 shrink-0 overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.02] opacity-70">
                      {item.images?.[0] || item.imageUrl || item.image ? (
                        <img src={item.images?.[0] || item.imageUrl || item.image || ""} alt="" className="h-24 w-full object-cover" />
                      ) : (
                        <div className="flex h-24 items-center justify-center bg-white/[0.03] text-xs text-zinc-600">No image</div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="rounded-lg bg-zinc-900/90 px-3 py-1 text-[10px] font-semibold text-zinc-300 border border-white/[0.06]">Sold</span>
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-medium text-[var(--foreground)]">{item.title}</p>
                        <p className="text-xs text-zinc-500">${item.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activity.length > 0 && (
            <div className={settingsSection}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--foreground)]">Recent activity</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">Your latest milestones</p>
                </div>
              </div>
              <ul className="divide-y divide-white/[0.04] text-sm rounded-xl border border-white/[0.04] bg-white/[0.02]">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3 first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.02]">
                    <span className="text-zinc-500">{a.icon}</span>
                    <span className="flex-1 text-[var(--foreground)]">{a.text}</span>
                    <span className="text-xs text-zinc-600">{a.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Identity Verification */}
          <div className={settingsSection}>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)]">Identity verification</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Complete these steps to build trust and unlock selling.</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Email */}
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10">
                      <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">Email</p>
                      <p className="text-xs text-zinc-500">{user?.email}</p>
                    </div>
                  </div>
                  <p className="text-sm">
                    {user?.emailVerified ? (
                      <span className="text-emerald-400 font-medium">Verified</span>
                    ) : (
                      <span className="text-amber-400 font-medium">Not verified</span>
                    )}
                  </p>
                </div>
                {!user?.emailVerified && (
                  <div className="mt-3 flex flex-wrap gap-2 pl-11">
                    <button type="button" onClick={resendVerificationEmail}
                      className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-sky-500/25 transition-colors">
                      Resend verification email
                    </button>
                    <button type="button" onClick={refreshAuthVerification} disabled={authRefreshing}
                      className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-400 hover:text-[var(--foreground)] disabled:opacity-50 transition-colors">
                      {authRefreshing ? "Checking…" : "Refresh status"}
                    </button>
                  </div>
                )}
              </div>

              {/* Phone */}
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3.5">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10">
                      <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">Phone</p>
                      <p className="text-xs text-zinc-500">Required to sell items</p>
                    </div>
                  </div>
                  <p className="text-sm">
                    {phoneVerified ? (
                      <span className="text-emerald-400 font-medium">Verified</span>
                    ) : (
                      <span className="text-zinc-500 font-medium">Not verified</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row pl-11">
                  <input type="tel" value={phone} onChange={handlePhoneInput}
                    placeholder="021 123 4567"
                    disabled={phoneSent && !phoneVerified}
                    className={`${fieldInput} sm:flex-1 disabled:opacity-50`} />
                  {!phoneVerified && (
                    <button onClick={handleSendPhoneCode} disabled={!phone || phoneVerifying || phoneCooldown > 0}
                      className="shrink-0 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-40 transition-all active:scale-[0.98]">
                      {phoneVerifying ? "..." : phoneSent ? phoneCooldown > 0 ? `Resend (${phoneCooldown}s)` : "Resend code" : "Send code"}
                    </button>
                  )}
                </div>
                {phoneSent && !phoneVerified && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row pl-11">
                    <input type="text" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code" className={`${fieldInput} sm:flex-1`} />
                    <button onClick={handleVerifyPhoneCode} disabled={phoneCode.length !== 6 || phoneVerifying}
                      className="shrink-0 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 transition-all active:scale-[0.98]">
                      {phoneVerifying ? "..." : "Verify"}
                    </button>
                  </div>
                )}
                {phoneVerified && (
                  <button type="button" onClick={handleRemovePhone} className="mt-2 pl-11 text-xs text-zinc-500 hover:text-red-400 transition-colors">
                    Remove phone number
                  </button>
                )}
                {phoneMsg && (
                  <p className={`mt-2 pl-11 text-xs ${phoneMsg.includes("✓") || phoneMsg.includes("Verified") ? "text-emerald-400" : "text-zinc-400"}`}>
                    {phoneMsg}
                  </p>
                )}
              </div>

              {/* Proof of address */}
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3.5">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10">
                      <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">Proof of address</p>
                      <p className="text-xs text-zinc-500">Utility bill or bank statement</p>
                    </div>
                  </div>
                  <p className="text-sm">
                    {poaStatus === "approved" && <span className="text-emerald-400 font-medium">Approved</span>}
                    {poaStatus === "pending" && <span className="text-amber-400 font-medium">Submitted</span>}
                    {poaStatus === "rejected" && <span className="text-red-400 font-medium">Rejected</span>}
                    {poaStatus === "unsubmitted" && <span className="text-zinc-500 font-medium">Not submitted</span>}
                  </p>
                </div>
                {poaStatus === "rejected" && poaRejectionReason && (
                  <p className="mb-3 text-xs text-red-400">Reason: {poaRejectionReason}</p>
                )}
                {(poaStatus === "unsubmitted" || poaStatus === "rejected") && (
                  <div className="space-y-3 pl-11">
                    <p className="text-xs text-zinc-500">Utility bill, bank statement, or official letter with your name and address.</p>
                    <input type="file" accept="image/*,.pdf" onChange={(e) => setPoaFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-zinc-500 file:mr-3 file:rounded-xl file:border-0 file:bg-sky-500 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-400 file:transition-colors" />
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
                      }} disabled={poaUploading}
                        className="w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50 transition-all active:scale-[0.98]">
                        {poaUploading ? "Uploading..." : "Submit document"}
                      </button>
                    )}
                  </div>
                )}
                {poaStatus === "approved" && poaDocumentURL && (
                  <a href={poaDocumentURL} target="_blank" rel="noopener noreferrer" className="inline-block pl-11 text-xs text-sky-400 hover:underline">
                    View submitted document
                  </a>
                )}
              </div>
            </div>

            {referredBy && (
              <div className="mt-5 rounded-xl border border-amber-500/10 bg-amber-500/[0.02] px-4 py-3">
                <p className="text-xs text-zinc-500">
                  Referral code: <span className="text-amber-400 font-semibold">{referredBy}</span>
                </p>
              </div>
            )}
          </div>

          {/* Payment Settings */}
          <div id="payment-settings" className={settingsSection}>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20">
                <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)]">Payment settings</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Stripe for card checkout · bank transfer for Arrange Purchase.</p>
              </div>
            </div>

            <div className="mb-6 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
              <p className="text-sm font-bold text-emerald-400">Arrange Purchase — bank transfer</p>
              <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                If you sell with <strong className="text-zinc-400">Arrange Purchase</strong>, add your NZ bank account so buyers can pay you.
                After they tap Purchase, these details appear in Messages with copy buttons.
              </p>
              <ol className="mt-3 space-y-2 text-xs text-zinc-400 list-decimal pl-4">
                <li>Fill in <strong className="text-zinc-300">account name</strong> and <strong className="text-zinc-300">account number</strong> below.</li>
                <li>Click <strong className="text-zinc-300">Save bank details</strong> below (or Save changes at the top of the page).</li>
                <li>When posting, choose <strong className="text-zinc-300">Arrange Purchase</strong> as the payment type.</li>
                <li>When a buyer requests purchase, open <Link href="/messages" className="text-sky-400 underline hover:text-sky-300">Messages</Link> to coordinate.</li>
              </ol>
              <Link href="/seller-guidelines#arrange-payment" className="mt-3 inline-block text-xs font-semibold text-sky-400 hover:text-sky-300">
                Full seller guide →
              </Link>
              {hasArrangePaymentDetails({
                bankAccountName,
                bankAccountNumber,
                bankReference,
              }) ? (
                <p className="mt-3 text-xs text-emerald-400/90">✓ Bank details saved — buyers will see them in chat.</p>
              ) : (
                <p className="mt-3 text-xs text-amber-400/90">Add account name and account number, then save.</p>
              )}
            </div>

            <div className="mb-6 space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-sm font-medium text-zinc-300">Bank details for Arrange Purchase (optional)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-400">Account name</label>
                  <input type="text" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)}
                    placeholder="Name on bank account"
                    className={fieldInput} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-400">Account number</label>
                  <input type="text" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="00-0000-0000000-00"
                    className={fieldInput} />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-400">Payment reference (optional)</label>
                <input type="text" value={bankReference} onChange={(e) => setBankReference(e.target.value)}
                  placeholder="e.g. Your username or listing title"
                  className={fieldInput} />
              </div>
              <button
                type="button"
                onClick={() => saveProfile({ bankOnly: true })}
                disabled={!!saving}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {saving === "Saving bank details..." ? "Saving..." : "Save bank details"}
              </button>
            </div>

            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Stripe Checkout (card payments)</p>
            {stripeAccountId ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] px-4 py-3.5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-400">Stripe connected</p>
                    <p className="text-xs text-zinc-500">Payouts go to your Stripe account</p>
                  </div>
                </div>
                <button onClick={handleStripeOnboard}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-sm font-medium transition-all hover:bg-white/[0.06] active:scale-[0.98]">
                  Manage Stripe account
                </button>
              </div>
            ) : (
              <button onClick={handleStripeConnect} disabled={stripeConnecting}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
                {stripeConnecting ? "Connecting..." : "Connect Stripe"}
              </button>
            )}
          </div>

          {/* Notification & Privacy Settings */}
          <div className={settingsSection}>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)]">Notifications & privacy</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Control your alerts and account visibility.</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-500 tracking-wider uppercase mb-2">Notifications</p>
              <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.04] bg-white/[0.02]">
                {notifToggles.map((n) => (
                  <label key={n.label} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 text-sm first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.02]">
                    <span>{n.label}</span>
                    <input type="checkbox" checked={n.val} onChange={(e) => n.set(e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1 mt-5">
              <p className="text-xs font-semibold text-zinc-500 tracking-wider uppercase mb-2">Privacy</p>
              <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.04] bg-white/[0.02]">
                {privacyToggles.map((n) => (
                  <label key={n.label} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 text-sm first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.02]">
                    <span>{n.label}</span>
                    <input type="checkbox" checked={n.val} onChange={(e) => n.set(e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className={`${settingsSection} border-red-500/10`}>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)]">Delete account</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Permanently remove your account and all data.</p>
              </div>
            </div>
            <div className="rounded-xl border border-red-500/10 bg-red-500/[0.02] px-4 py-3.5">
              <p className="text-xs text-red-400/70 mb-3">This action cannot be undone. All your listings, profile data, and account information will be permanently removed.</p>
              <div className="flex gap-2">
                <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className={`${fieldInput} flex-1 border-red-500/20 text-sm`} />
                <button onClick={deleteAccount} disabled={deleteConfirm !== "DELETE" || !!saving}
                  className="shrink-0 rounded-xl bg-red-600/90 px-5 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-30 transition-all active:scale-[0.98]">
                  Delete
                </button>
              </div>
            </div>
          </div>

          {listingToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setListingToDelete(null)}>
              <div className="mx-4 w-full max-w-sm rounded-3xl border border-white/[0.06] bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10">
                  <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                </div>
                <h3 className="text-center text-lg font-black text-[var(--foreground)]">Delete listing?</h3>
                <p className="mt-2 text-center text-sm text-zinc-400">&quot;{listingToDelete.title}&quot; will be permanently removed.</p>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => setListingToDelete(null)} className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-white/[0.06] transition-all active:scale-[0.97]">Cancel</button>
                  <button onClick={() => deleteListing(listingToDelete.id)} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400 transition-all active:scale-[0.97]">Delete</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      <div id="recaptcha-container" />

      {/* Profile main content continues */}

      {sellBadge && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSellBadge(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-white/[0.06] bg-zinc-900 p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
              <span className="text-2xl">{sellBadge === "epic" ? "💎" : "👑"}</span>
            </div>
            <h3 className="text-center text-xl font-black text-[var(--foreground)]">
              {sellBadge === "epic" ? "Epic" : "The Five"} Badge
            </h3>
            <p className="mt-2 text-center text-sm text-zinc-400">
              {sellBadge === "legendary" ? "Only 5 of these exist on Sky Drop. " : ""}
              Selling transfers your badge to the buyer. This cannot be undone.
            </p>
            <div className="mt-5">
              <label className="mb-2 block text-xs font-semibold text-zinc-500">Price ($)</label>
              <input type="number" min="1" step="0.01" value={sellBadgePrice} onChange={(e) => setSellBadgePrice(e.target.value)}
                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-all focus:border-sky-500/30 focus:bg-white/[0.05]"
                autoFocus />
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setSellBadge(null)}
                className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-white/[0.06] active:scale-[0.97] transition-all">
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
              }} className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all hover:shadow-xl active:scale-[0.97]">
                List for Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
