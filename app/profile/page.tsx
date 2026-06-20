"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { sanitizeHtml } from "../lib/sanitize";
import {
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
import { isFullyVerifiedSeller, verifiedFlagAfterUpdate } from "../lib/seller-verified";
import { isAdminEmail } from "../lib/admin-check";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage, onAuthStateChanged } from "../lib/firebase";
import { sendPhoneCode, verifyPhoneCode, maskPhone, isPhoneDevMode, formatNZPhone } from "../lib/phone-auth";
import { claimVerifiedPhoneOnServer } from "../lib/phone-verification-client";
import { checkImage } from "../lib/nsfw";
import { kycSubmitErrorMessage, notifyKycSubmitted, submitKycPhoto } from "../lib/kyc-submit.client";
import { showToast } from "../components/Toast";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { countSellerSales } from "../lib/arrange-purchase-status";
import { hasArrangePaymentDetails } from "../lib/arrange-payment-details";
import { useProfile } from "../contexts/ProfileContext";
import { sellerProfilePath } from "../lib/seller-profile-nav";
import BrowseMarketplaceHero from "../components/BrowseMarketplaceHero";
import { PAGE_SHELL_WIDE } from "../lib/page-layout";
import AwhinaProfileAssistant from "../components/AwhinaProfileAssistant";
import {
  consumePendingProfileFill,
  mergeProfileFill,
  SKY_AI_PROFILE_FILL_EVENT,
  type SkyAiProfileFill,
} from "../lib/sky-ai-profile-fill";
import { HOME_MARKETPLACE_THEME as t } from "../lib/browse-category-config";

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
  notifOffersTrades?: boolean;
  notifMessageRequests?: boolean;
  notifListingActivity?: boolean;
  notifListingReplies?: boolean;
  notifReactions?: boolean;
  notifMentions?: boolean;
  notifDisputes?: boolean;
  notifReports?: boolean;
  notifAccountReview?: boolean;
  notifPurchases?: boolean;
  notifEscrow?: boolean;
  notifRefunds?: boolean;
  notifSecurity?: boolean;
  notifPlatform?: boolean;
  notifIntensity?: string;
  notifQuietHours?: boolean;
  notifQuietHoursStart?: string;
  notifQuietHoursEnd?: string;
  notifDigest?: boolean;
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
  kycStatus?: string;
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
  const [notifOffersTrades, setNotifOffersTrades] = useState(true);
  const [notifMessageRequests, setNotifMessageRequests] = useState(true);
  const [notifListingActivity, setNotifListingActivity] = useState(true);
  const [notifListingReplies, setNotifListingReplies] = useState(true);
  const [notifReactions, setNotifReactions] = useState(true);
  const [notifMentions, setNotifMentions] = useState(false);
  const [notifDisputes, setNotifDisputes] = useState(true);
  const [notifReports, setNotifReports] = useState(true);
  const [notifAccountReview, setNotifAccountReview] = useState(true);
  const [notifPurchases, setNotifPurchases] = useState(true);
  const [notifEscrow, setNotifEscrow] = useState(true);
  const [notifRefunds, setNotifRefunds] = useState(true);
  const [notifSecurity, setNotifSecurity] = useState(true);
  const [notifPlatform, setNotifPlatform] = useState(true);
  const [notifIntensity, setNotifIntensity] = useState("balanced");
  const [notifQuietHours, setNotifQuietHours] = useState(false);
  const [notifQuietHoursStart, setNotifQuietHoursStart] = useState("22:00");
  const [notifQuietHoursEnd, setNotifQuietHoursEnd] = useState("08:00");
  const [notifDigest, setNotifDigest] = useState(false);

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
const [sendingPhone, setSendingPhone] = useState(false);
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
const [poaFile2, setPoaFile2] = useState<File | null>(null);
const [poaUploading, setPoaUploading] = useState(false);
const [kycIdType, setKycIdType] = useState<"driver_licence" | "passport">("driver_licence");
const [sellBadge, setSellBadge] = useState<string | null>(null);
const [sellBadgePrice, setSellBadgePrice] = useState("50");
const [authRefreshing, setAuthRefreshing] = useState(false);
const [activeTab, setActiveTab] = useState("profile");

const tabs = [
  { id: "profile", label: "Profile" },
  { id: "listings", label: "Listings" },
  { id: "reviews", label: "Reviews" },
  { id: "verification", label: "Verification" },
  { id: "payments", label: "Payments" },
  { id: "notifications", label: "Notifications" },
  { id: "settings", label: "Settings" },
  { id: "danger", label: "Delete" },
] as const;

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
    setNotifOffersTrades(data.notifOffersTrades !== false);
    setNotifMessageRequests(data.notifMessageRequests !== false);
    setNotifListingActivity(data.notifListingActivity !== false);
    setNotifListingReplies(data.notifListingReplies !== false);
    setNotifReactions(data.notifReactions !== false);
    setNotifMentions(data.notifMentions || false);
    setNotifDisputes(data.notifDisputes !== false);
    setNotifReports(data.notifReports !== false);
    setNotifAccountReview(data.notifAccountReview !== false);
    setNotifPurchases(data.notifPurchases !== false);
    setNotifEscrow(data.notifEscrow !== false);
    setNotifRefunds(data.notifRefunds !== false);
    setNotifSecurity(data.notifSecurity !== false);
    setNotifPlatform(data.notifPlatform !== false);
    setNotifIntensity(data.notifIntensity || "balanced");
    setNotifQuietHours(data.notifQuietHours || false);
    setNotifQuietHoursStart(data.notifQuietHoursStart || "22:00");
    setNotifQuietHoursEnd(data.notifQuietHoursEnd || "08:00");
    setNotifDigest(data.notifDigest || false);
    setPhone(data.phone || data.phoneNumber || "");
    setPhoneVerified(!!data.phoneVerified);
    setStripeAccountId(data.stripeAccountId || "");
    setBankAccountName(data.bankAccountName || "");
    setBankAccountNumber(data.bankAccountNumber || "");
    setBankReference(data.bankReference || "");
    setReferralCode(data.referralCode || "");
    setReferredBy(data.referredBy || "");
    // KYC status is stored as flat fields on profiles (image URLs are in kycSubmissions collection only)
    const kycStatus = (data as any).kycStatus || data.proofOfAddress?.status || "unsubmitted";
    setPoaStatus(kycStatus);
    setPoaDocumentURL(""); // image URLs never stored on profiles
    setPoaRejectionReason((data as any).kycRejectReason || data.proofOfAddress?.rejectionReason || "");
  }, [setContextUsername]);

  const listingBlockReason = user
    ? getListingBlockReason({
        authEmailVerified: !!user.emailVerified,
        restricted: !!profile.restricted,
        profileExists: !!(profile.username || profile.email || user.uid),
        kycApproved: (profile.kycStatus || poaStatus) === "approved",
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
        showToast("Email verified — complete ID verification to start selling.", "success");
        await setDoc(
          doc(db, "profiles", user.uid),
          {
            emailVerified: true,
            verified: verifiedFlagAfterUpdate(
              {
                kycStatus: profile.kycStatus,
                phoneVerified: phoneVerified || profile.phoneVerified,
                emailVerified: profile.emailVerified,
              },
              { emailVerified: true }
            ),
          },
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

  // Read bank details from the secure subcollection (not the main profile doc)
  useEffect(() => {
    if (!user?.uid) return;
    const bankRef = doc(db, "profiles", user.uid, "bankDetails", "private");
    const unsub = onSnapshot(bankRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBankAccountName(data.bankAccountName || "");
        setBankAccountNumber(data.bankAccountNumber || "");
        setBankReference(data.bankReference || "");
      }
    });
    return () => unsub();
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
      if (stored && data?.phoneVerified) return;
      const phonePatch = {
        phone: authPhone,
        phoneNumber: authPhone,
        phoneVerified: true,
      };
      await setDoc(
        doc(db, "profiles", user.uid),
        {
          ...phonePatch,
          verified: verifiedFlagAfterUpdate(data, phonePatch),
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
    if (isFullyVerifiedSeller(profile)) score += 10;
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
    const isAdmin = user?.email ? isAdminEmail(user.email) : false;
    if (newUsername.includes(" ") && !isAdmin) {
      showToast("Usernames cannot contain spaces.", "error");
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
        notifOffersTrades,
        notifMessageRequests,
        notifListingActivity,
        notifListingReplies,
        notifReactions,
        notifMentions,
        notifDisputes,
        notifReports,
        notifAccountReview,
        notifPurchases,
        notifEscrow,
        notifRefunds,
        notifSecurity,
        notifPlatform,
        notifIntensity,
        notifQuietHours,
        notifQuietHoursStart,
        notifQuietHoursEnd,
        notifDigest,
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
      // Never write bank details to the main profile doc — they're stored server-side
      // in profiles/{uid}/bankDetails/private which has owner-only Firestore rules.
      delete clientMerge.bankAccountName;
      delete clientMerge.bankAccountNumber;
      delete clientMerge.bankReference;
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
    if (!user || !phone || sendingPhone || phoneCooldown > 0) {
      console.warn("[profile] handleSendPhoneCode — blocked", { user: !!user, phone: !!phone, sendingPhone, phoneCooldown });
      return;
    }
    if (process.env.NODE_ENV !== "production") console.log("[profile] handleSendPhoneCode — user click", { phone });
    setSendingPhone(true);
    setPhoneMsg("Sending code...");
    setPhoneCode("");
    try {
      const result = await sendPhoneCode(phone);
      if (process.env.NODE_ENV !== "production") console.log("[profile] sendPhoneCode result", result);
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
    } finally {
      setSendingPhone(false);
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
        const claim = await claimVerifiedPhoneOnServer(formattedPhone);
        if (!claim.success) {
          setPhoneVerified(false);
          setPhoneMsg(claim.error || "Could not link phone number.");
          showToast(claim.error || "Could not link phone number.", "error");
          setPhoneVerifying(false);
          return;
        }
        const linkedPhone = claim.phone || formattedPhone;
        setPhone(linkedPhone);
        const phonePatch = {
          phone: linkedPhone,
          phoneNumber: linkedPhone,
          phoneVerified: true,
          phoneVerifiedAt: serverTimestamp(),
        };
        await setDoc(doc(db, "profiles", user.uid), {
          ...phonePatch,
          verified: verifiedFlagAfterUpdate(
            {
              kycStatus: profile.kycStatus || poaStatus,
              phoneVerified: profile.phoneVerified,
              emailVerified: profile.emailVerified || user.emailVerified,
            },
            { phoneVerified: true }
          ),
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

  // Notification toggle components
  const ToggleRow = ({ label, val, set }: { label: string; val: boolean; set: (v: boolean) => void }) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0 hover:bg-white/[0.02]">
      <span className="text-zinc-300">{label}</span>
      <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
    </label>
  );

  const initial = (contextUsername || username || "U").charAt(0).toUpperCase();
  const memberDate = profile.memberSince?.toDate().toLocaleDateString("en-NZ", { year: "numeric", month: "short" }) || "2026";
  const avatarUrl = profile.photoURL;
  const bannerUrl = profile.bannerURL;

  const statItems = [
    { label: "Sales", value: String(stats.sales), icon: "💰", accent: "from-emerald-500 to-emerald-400" },
    { label: "Listings", value: String(activeListings.length), icon: "📦", accent: "from-violet-500 to-violet-400" },
    { label: "Followers", value: String(stats.followers), icon: "👥", accent: "from-sky-500 to-sky-400" },
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

  const profileDraft = useMemo<SkyAiProfileFill>(
    () => ({
      username: username.trim() || undefined,
      bio: bio.trim() || undefined,
      region: region || undefined,
      discord: discord.trim() || undefined,
      instagram: instagram.trim() || undefined,
      tiktok: tiktok.trim() || undefined,
      website: website.trim() || undefined,
    }),
    [username, bio, region, discord, instagram, tiktok, website]
  );

  const applyProfileFill = useCallback((fill: SkyAiProfileFill) => {
    const merged = mergeProfileFill(profileDraft, fill);
    if (merged.username) setUsername(merged.username);
    if (merged.bio) setBio(merged.bio);
    if (merged.region) setRegion(merged.region);
    if (merged.discord || merged.instagram || merged.tiktok || merged.website) {
      setShowSocialFields(true);
    }
    if (merged.discord) setDiscord(merged.discord);
    if (merged.instagram) setInstagram(merged.instagram);
    if (merged.tiktok) setTiktok(merged.tiktok);
    if (merged.website) setWebsite(merged.website);
  }, [profileDraft]);

  useEffect(() => {
    const pending = consumePendingProfileFill();
    if (pending) applyProfileFill(pending);
    const onFill = (e: Event) => {
      const detail = (e as CustomEvent<SkyAiProfileFill>).detail;
      if (detail) applyProfileFill(detail);
    };
    window.addEventListener(SKY_AI_PROFILE_FILL_EVENT, onFill);
    return () => window.removeEventListener(SKY_AI_PROFILE_FILL_EVENT, onFill);
  }, [applyProfileFill]);

  const settingsSection =
    "rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 sm:p-6";
  const fieldInput =
    "w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-white outline-none transition-all duration-200 placeholder:text-zinc-500 focus:border-sky-500/40 focus:bg-black/30 focus:ring-2 focus:ring-sky-500/20";
  const primaryBtn = `rounded-xl bg-gradient-to-r ${t.listBtn} py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50`;

  const isFullyVerified = useMemo(
    () =>
      isFullyVerifiedSeller({
        kycStatus: profile.kycStatus || poaStatus,
        phoneVerified: phoneVerified || profile.phoneVerified,
        emailVerified: profile.emailVerified || user?.emailVerified,
      }),
    [profile.kycStatus, profile.phoneVerified, profile.emailVerified, phoneVerified, poaStatus, user?.emailVerified]
  );

  const profileBadges = [
    isFullyVerified && { key: "verified", label: "Verified", className: "border-sky-500/25 bg-sky-500/10 text-sky-300" },
    profile.topTrader && { key: "top", label: "Top Trader", className: "border-sky-500/25 bg-sky-500/10 text-sky-300" },
    profile.trustedSeller && { key: "trusted", label: "Trusted", className: "border-sky-500/25 bg-sky-500/10 text-sky-300" },
    profile.fastReply && { key: "fast", label: "Fast reply", className: "border-sky-500/25 bg-sky-500/10 text-sky-300" },
    profile.profileBadge === "epic" && { key: "epic", label: "Epic", className: "border-sky-500/25 bg-sky-500/10 text-sky-300" },
    profile.profileBadge === "legendary" && { key: "legendary", label: "The Five", className: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  ].filter(Boolean) as { key: string; label: string; className: string }[];


  if (loading) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white">
        <Background /><Navbar />
        <section className={`${PAGE_SHELL_WIDE} pb-10 pt-2 sm:pt-3`}>
          <div className={`h-56 rounded-3xl border border-white/[0.04] bg-white/[0.02] animate-pulse ${t.heroShadow}`} />
          <div className="mt-6 h-96 rounded-2xl border border-white/[0.04] bg-white/[0.02] animate-pulse" />
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white">
        <Background /><Navbar />
        <section className={`${PAGE_SHELL_WIDE} pb-10 pt-2 sm:pt-3`}>
          <BrowseMarketplaceHero badge="Account" title="Profile">
            <p className="mt-3 text-sm text-zinc-400">Sign in to manage your seller profile and settings.</p>
            <Link href="/login" className={`mt-4 inline-flex items-center gap-2 ${primaryBtn} px-5 py-2.5`}>
              Sign in
            </Link>
          </BrowseMarketplaceHero>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white transition-colors duration-300">
      <Background /><Navbar />

      <section className={`${PAGE_SHELL_WIDE} pb-10 pt-2 sm:pt-3`}>
        <div className="space-y-5">

          {saving && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-300">
              {saving}
            </div>
          )}
          {saved && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-300">
              Saved successfully!
            </div>
          )}



          {/* Profile hero */}
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] shadow-2xl shadow-black/20">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
            <div
              className="group relative z-10 h-32 cursor-pointer overflow-hidden sm:h-40"
              onClick={() => bannerRef.current?.click()}
            >
              {bannerUrl ? (
                <img src={bannerUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-purple-500/10" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-transparent to-transparent" />
              <span className="absolute right-3 top-3 rounded-full border border-white/[0.08] bg-black/50 px-3 py-1.5 text-[10px] font-medium text-white/80 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                {bannerUrl ? "Change banner" : "Add banner"}
              </span>
            </div>
            <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />

            <div className="relative z-10 px-5 pb-6 sm:px-8 sm:pb-8">
              <div className="-mt-14 flex flex-col items-start gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:gap-6">
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="relative shrink-0 cursor-pointer group/avatar"
                >
                  {avatarUrl ? (
                    <div className="relative">
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-24 w-24 rounded-2xl border-[4px] border-[var(--background)] object-cover shadow-2xl sm:h-28 sm:w-28 transition-transform duration-300 group-hover/avatar:scale-105"
                      />
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 transition-all duration-300 group-hover/avatar:bg-black/50">
                        <span className="text-sm font-bold text-white opacity-0 transition-opacity duration-300 group-hover/avatar:opacity-100">Edit</span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-[4px] border-[var(--background)] bg-gradient-to-br from-zinc-800 to-zinc-900 text-3xl font-bold text-sky-400 shadow-2xl sm:h-28 sm:w-28">
                        {initial}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 transition-all duration-300 hover:bg-black/50">
                        <span className="text-sm font-bold text-white opacity-0 transition-opacity duration-300 group-hover/avatar:opacity-100">Add</span>
                      </div>
                    </div>
                  )}
                </button>
                <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

                <div className="min-w-0 flex-1 pb-1">
                  <h2 className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
                    {contextUsername || username || "User"}
                  </h2>
                  <p className="mt-1 truncate text-sm text-zinc-400">
                    {completion}% complete · {region || "No region set"} · Joined {memberDate}
                  </p>
                  {(profileBadges.length > 0 || !hideOnline) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!hideOnline && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Online
                        </span>
                      )}
                      {profileBadges.map((badge) => (
                        <span
                          key={badge.key}
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:pb-1">
                  {(contextUsername || username) && (
                    <Link
                      href={sellerProfilePath(contextUsername || username)}
                      className={`inline-flex items-center gap-1.5 ${primaryBtn} px-4 py-2 text-xs`}
                    >
                      Public profile
                    </Link>
                  )}
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-sky-500/25 hover:bg-white/[0.06] hover:text-white"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/messages"
                    className="inline-flex items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-sky-500/25 hover:bg-white/[0.06] hover:text-white"
                  >
                    Messages
                  </Link>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
                {statItems.map((s) => (
                  <div key={s.label} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.01] px-4 py-4 text-center transition-all duration-300 hover:border-white/[0.14] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5">
                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.accent}`} />
                    <div className="flex flex-col items-center">
                      <span className="text-2xl opacity-90">{s.icon}</span>
                      <p className="mt-1 text-lg font-black text-white sm:text-xl">{s.value}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          {/* Tabs */}
          <nav
            className="flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.015] p-1.5 scrollbar-none lg:sticky lg:top-24 lg:flex-col lg:overflow-visible"
            role="tablist"
            aria-label="Profile sections"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`shrink-0 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all duration-200 sm:text-sm lg:w-full ${
                  activeTab === tab.id
                    ? tab.id === "danger"
                      ? "bg-red-500/15 text-red-300 border border-red-500/20"
                      : "bg-sky-500/15 text-sky-300 border border-sky-500/20"
                    : tab.id === "danger"
                      ? "text-red-400/60 hover:bg-red-500/10 hover:text-red-300"
                      : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 space-y-5">

          {/* ===== TAB: PROFILE ===== */}
          {activeTab === "profile" && (
            <div className="space-y-5">
              <AwhinaProfileAssistant
                draft={profileDraft}
                onApplyFill={applyProfileFill}
                className="w-full"
              />
            <div className={settingsSection}>
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">Edit profile</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">How buyers see you on Sky Drop</p>
                </div>
                <span className="shrink-0 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-300">{completion}%</span>
              </div>
              <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500" style={{ width: `${completion}%` }} />
              </div>

              {!readyToList && (
                <div className="mb-5 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] px-4 py-3 text-sm text-sky-400/90">
                  {listingBlockReason || "Complete ID verification to create listings."}
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
                  className={`w-full ${primaryBtn}`}>
                  {saving ? "Saving..." : "Save changes"}
                </button>

                <details className="group border-t border-white/[0.06] pt-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                    Change password
                  </summary>
                  <div className="mt-3 space-y-3">
                    <input type="password" value={pwOld} onChange={(e) => setPwOld(e.target.value)} placeholder="Current password" className={fieldInput} />
                    <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="New password" className={fieldInput} />
                    <button onClick={changePassword}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 text-sm font-medium transition-colors hover:bg-white/[0.06] active:scale-[0.98]">
                      Update password
                    </button>
                    {pwMsg && (
                      <p className={`text-xs ${pwMsg.includes("updated") ? "text-sky-400" : "text-red-400"}`}>{pwMsg}</p>
                    )}
                  </div>
                </details>

                {followingList.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-6">
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
            </div>
          )}

          {/* ===== TAB: LISTINGS ===== */}
          {activeTab === "reviews" && (
            <div className={settingsSection}>
              <h2 className="mb-1 text-base font-bold text-white">Reviews</h2>
              <p className="mb-5 text-sm text-zinc-500">Reviews from buyers and sellers about you.</p>
              <p className="text-sm text-zinc-600">View your reviews on your <Link href="/reviews" className="text-sky-400 hover:underline">reviews page</Link>.</p>
            </div>
          )}

          {activeTab === "settings" && (
            <div className={settingsSection}>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Settings</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">Notification preferences and controls.</p>
                </div>
                <button onClick={() => saveProfile()} disabled={!!saving}
                  className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-400 active:scale-[0.97]">
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>

              {/* Notification Groups */}
              <div className="space-y-4">

                {/* 1. Messages */}
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Messages</h3>
                  <div className="divide-y divide-white/[0.04]">
                    <ToggleRow label="New messages" val={notifMessages} set={setNotifMessages} />
                    <ToggleRow label="Offers &amp; trades" val={notifOffersTrades} set={setNotifOffersTrades} />
                    <ToggleRow label="Message requests" val={notifMessageRequests} set={setNotifMessageRequests} />
                  </div>
                </div>

                {/* 2. Marketplace */}
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Marketplace</h3>
                  <div className="divide-y divide-white/[0.04]">
                    <ToggleRow label="Listing activity (views, offers, sales)" val={notifListingActivity} set={setNotifListingActivity} />
                    <ToggleRow label="Replies to my listings" val={notifListingReplies} set={setNotifListingReplies} />
                  </div>
                </div>

                {/* 3. Social */}
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Social / Trade Feed</h3>
                  <div className="divide-y divide-white/[0.04]">
                    <ToggleRow label="Reactions, follows, comments" val={notifReactions} set={setNotifReactions} />
                    <ToggleRow label="Mentions" val={notifMentions} set={setNotifMentions} />
                  </div>
                </div>

                {/* 4. System */}
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">System</h3>
                  <div className="divide-y divide-white/[0.04]">
                    <ToggleRow label="Security alerts" val={notifSecurity} set={setNotifSecurity} />
                    <ToggleRow label="Platform updates" val={notifPlatform} set={setNotifPlatform} />
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Notification intensity</h3>
                  <div className="flex gap-2">
                    {["minimal", "balanced", "active"].map((level) => (
                      <button key={level} onClick={() => setNotifIntensity(level)}
                        className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
                          notifIntensity === level
                            ? "bg-sky-500 text-white"
                            : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]"
                        }`}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
                  <ToggleRow label="Quiet hours (mute non-critical)" val={notifQuietHours} set={setNotifQuietHours} />
                  {notifQuietHours && (
                    <div className="mt-3 flex gap-3">
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-zinc-500">From</label>
                        <input type="time" value={notifQuietHoursStart} onChange={(e) => setNotifQuietHoursStart(e.target.value)}
                          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-zinc-300" />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-zinc-500">To</label>
                        <input type="time" value={notifQuietHoursEnd} onChange={(e) => setNotifQuietHoursEnd(e.target.value)}
                          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-zinc-300" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
                  <ToggleRow label="Daily digest (summary email)" val={notifDigest} set={setNotifDigest} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "listings" && (
            <div className={settingsSection}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-white">Your listings</h2>
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
                <div className="py-10 text-center">
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
                          <p className="truncate text-xs font-bold text-white">{item.title}</p>
                          <p className="mt-1 text-sm font-black text-white">${item.price}</p>
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
                <div className="mt-6 border-t border-white/[0.04] pt-6">
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

              {activity.length > 0 && (
                <div className="mt-6 border-t border-white/[0.04] pt-6">
                  <h3 className="mb-3 text-sm font-medium text-zinc-500">Recent activity</h3>
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
            </div>
          )}

          {/* ===== TAB: VERIFICATION ===== */}
          {activeTab === "verification" && (
            <div className={settingsSection}>
              <h2 className="mb-4 text-base font-bold text-white">Verification</h2>

              <div className="mb-5 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3.5">
                <p className="text-sm font-semibold text-sky-400">Verification Status</p>
                <p className="mt-1.5 text-sm text-zinc-300 leading-relaxed">
                  Phone verification is recommended for account security. Email verification is required to use the platform.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">Email</p>
                      <p className="text-xs text-zinc-500">{user?.email}</p>
                    </div>
                    <p className="text-sm">
                      {user?.emailVerified ? (
                        <span className="text-sky-400 font-medium">Verified</span>
                      ) : (
                        <span className="text-sky-400 font-medium">Not verified</span>
                      )}
                    </p>
                  </div>
                  {!user?.emailVerified && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={resendVerificationEmail}
                        className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-sky-500/25 transition-colors">
                        Resend verification email
                      </button>
                      <button type="button" onClick={refreshAuthVerification} disabled={authRefreshing}
                        className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-400 hover:text-[var(--foreground)] disabled:opacity-50 transition-colors">
                        {authRefreshing ? "Checking..." : "Refresh status"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3.5">
                  <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                    <p className="text-xs font-medium text-red-400">Phone verification is required</p>
                    <p className="mt-1 text-xs text-zinc-400">One phone number per account for security and account recovery.</p>
                  </div>
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="text-sm font-medium text-white">Phone</p>
                      <p className="text-xs text-zinc-500">Required — verify your phone number</p>
                    </div>
                    <p className="text-sm">
                      {phoneVerified ? (
                        <span className="text-sky-400 font-medium">Verified</span>
                      ) : (
                        <span className="text-zinc-500 font-medium">Not verified</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input type="tel" value={phone} onChange={handlePhoneInput}
                      placeholder="021 123 4567"
                      disabled={phoneSent && !phoneVerified}
                      className={`${fieldInput} sm:flex-1 disabled:opacity-50`} />
                    {!phoneVerified && (
                      <button onClick={handleSendPhoneCode} disabled={!phone || sendingPhone || phoneVerifying || phoneCooldown > 0}
                        className="shrink-0 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-40 transition-all active:scale-[0.98]">
                        {sendingPhone
                          ? "Sending..."
                          : phoneCooldown > 0
                            ? `Wait ${phoneCooldown}s`
                            : phoneSent
                              ? "Resend code"
                              : "Send code"}
                      </button>
                    )}
                  </div>
                  {phoneSent && !phoneVerified && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input type="text" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6-digit code" className={`${fieldInput} sm:flex-1`} />
                      <button onClick={handleVerifyPhoneCode} disabled={phoneCode.length !== 6 || phoneVerifying}
                        className="shrink-0 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40 transition-all active:scale-[0.98]">
                        {phoneVerifying ? "..." : "Verify"}
                      </button>
                    </div>
                  )}
                  {phoneVerified && (
                    <p className="mt-2 text-xs text-sky-400">
                      ✓ Phone verified. You cannot change your phone number.
                    </p>
                  )}
                  {phoneMsg && (
                    <p
                      className={`mt-2 text-xs ${
                        phoneMsg.includes("✓") || phoneMsg.includes("Verified") || phoneMsg.includes("SMS sent")
                          ? "text-sky-400"
                          : phoneMsg.includes("Security check") || phoneMsg.includes("verification failed")
                            ? "text-amber-400/90"
                            : phoneMsg.includes("Too many SMS")
                              ? "text-amber-400/90"
                              : "text-zinc-400"
                      }`}
                    >
                      {phoneMsg}
                    </p>
                  )}
                </div>
              </div>

              {referredBy && (
                <div className="mt-5 rounded-xl border border-sky-500/10 bg-sky-500/[0.02] px-4 py-3">
                  <p className="text-xs text-zinc-500">
                    Referral code: <span className="text-sky-400 font-semibold">{referredBy}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ===== TAB: PAYMENTS ===== */}
          {activeTab === "payments" && (
            <div id="payment-settings" className={settingsSection}>
              <h2 className="mb-1 text-base font-bold text-white">Payments</h2>
              <p className="mb-5 text-sm text-zinc-500">Set up how you want to receive payments when you sell items. Bank transfer for Arrange Purchase (buyer contacts you directly), or Stripe for instant card checkout.</p>

              <div className="mb-5 space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">Arrange Purchase bank details</p>
                  {hasArrangePaymentDetails({ bankAccountName, bankAccountNumber, bankReference }) ? (
                    <span className="text-xs text-sky-400">Saved</span>
                  ) : (
                    <span className="text-xs text-sky-400">Not set</span>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-400">Account name</label>
                    <input type="text" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)}
                      placeholder="Name on bank account" className={fieldInput} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-400">Account number</label>
                    <input type="text" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="00-0000-0000000-00" className={fieldInput} />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-400">Payment reference (optional)</label>
                  <input type="text" value={bankReference} onChange={(e) => setBankReference(e.target.value)}
                    placeholder="e.g. Your username or listing title" className={fieldInput} />
                </div>
                <button type="button" onClick={() => saveProfile({ bankOnly: true })} disabled={!!saving}
                  className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50">
                  {saving === "Saving bank details..." ? "Saving..." : "Save bank details"}
                </button>
                <Link href="/seller-guidelines#arrange-payment" className="block text-center text-xs text-sky-400 hover:text-sky-300">
                  How Arrange Purchase works
                </Link>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">Stripe checkout</p>
                  {stripeAccountId && <span className="text-xs text-sky-400">Connected</span>}
                </div>
                {stripeAccountId ? (
                  <button onClick={handleStripeOnboard}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 text-sm font-medium transition-colors hover:bg-white/[0.06] active:scale-[0.98]">
                    Manage Stripe account
                  </button>
                ) : (
                  <button onClick={handleStripeConnect} disabled={stripeConnecting}
                    className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50">
                    {stripeConnecting ? "Connecting..." : "Connect Stripe"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ===== TAB: NOTIFICATIONS ===== */}
          {activeTab === "notifications" && (
            <div className={settingsSection}>
              <h2 className="mb-5 text-base font-bold text-white">Alerts &amp; privacy</h2>
              <div className="space-y-1">
                <p className="mb-2 text-xs font-medium text-zinc-500">Notifications</p>
                <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.04] bg-white/[0.02]">
                  {notifToggles.map((n) => (
                    <label key={n.label} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-sm first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.02]">
                      <span>{n.label}</span>
                      <input type="checkbox" checked={n.val} onChange={(e) => n.set(e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-5 space-y-1">
                <p className="mb-2 text-xs font-medium text-zinc-500">Privacy</p>
                <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.04] bg-white/[0.02]">
                  {privacyToggles.map((n) => (
                    <label key={n.label} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-sm first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.02]">
                      <span>{n.label}</span>
                      <input type="checkbox" checked={n.val} onChange={(e) => n.set(e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30" />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== TAB: DANGER ZONE ===== */}
          {activeTab === "danger" && (
            <div className={`${settingsSection} border-red-500/10`}>
              <h2 className="mb-1 text-base font-bold text-red-400">Delete account</h2>
              <p className="mb-5 text-sm text-zinc-500">This permanently removes your listings and profile data.</p>
              <div className="rounded-xl border border-red-500/10 bg-red-500/[0.02] px-4 py-3.5">
                <p className="mb-3 text-xs text-red-400/70">Type DELETE below to confirm.</p>
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
          )}

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
      </section>
      <div id="recaptcha-container" />

      {sellBadge && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSellBadge(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-white/[0.06] bg-zinc-900 p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10">
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
                try {
                  const { createTradePostRequest } = await import("../lib/create-trade-post.client");
                  await createTradePostRequest({
                    type: "WTS",
                    title,
                    price,
                    message: sellBadge === "epic" ? "Epic Seller badge for sale." : "👑 The Five badge for sale. Only 5 exist on Sky Drop.",
                    sellerUsername: username || user!.email || "",
                    badgeForSale: sellBadge as "epic" | "legendary",
                    status: "live",
                  });
                  setSellBadge(null);
                  showToast("Badge listed for sale! View it in Trade Feed.", "success");
                  router.push("/trade-feed");
                } catch (e) {
                  showToast(e instanceof Error ? e.message : "Failed to list badge.", "error");
                }
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
