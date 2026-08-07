"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { PAGE_SHELL_CHAT } from "../lib/page-layout";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  setDoc,
} from "firebase/firestore";
import {
  User,
} from "firebase/auth";
import { auth, db, storage, onAuthStateChanged } from "../lib/firebase";
import { detectScam } from "../lib/scamdetection";
import { calculateTrustScore } from "../lib/trustscore";
import { checkImage } from "../lib/nsfw";
import { showToast } from "../components/Toast";
import { createNotification } from "../lib/notifications";
import OfferPaymentModal from "../components/OfferPaymentModal";
import ArrangePaymentCopyBar from "../components/ArrangePaymentCopyBar";
import StayOnSkyDropNotice from "../components/StayOnSkyDropNotice";
import RefundStatusCard from "../components/RefundStatusCard";
import {
  dedupeConversationOrderMessages,
  pickConversationPurchase,
  resolveConversationOrderStatus,
  shouldHideSupersededPaidOrderCard,
} from "../lib/conversation-order-status";
import { isRefundedStatus } from "../lib/refund-display";
import BraveWarning from "../components/BraveWarning";
import LoadingSpinner from "../components/LoadingSpinner";
import { STAY_ON_SKY_DROP_HEADLINE, V1_ARRANGE_SAFETY_ONE_LINER } from "../lib/conversation-safety";
import { extractEmailsFromText,
  isEmailLike,
  publicHandleFromProfile,
  sanitizePublicText,
  sellerProfileSlug,
} from "../lib/public-display";
import { fetchPublicProfileBySlug } from "../lib/fetch-public-profile-client";
import { sellerMessagesUrl } from "../lib/public-display";
import { canSellerConfirmArrangeSale, countSellerSales } from "../lib/arrange-purchase-status";
import { purchaseStatusLabel } from "../lib/purchase-status";
import { getFreshIdToken } from "../lib/api-auth";
import { trackFunnelEvent } from "../lib/funnel-events";
import NegotiationAssistant from "../components/NegotiationAssistant";
import { isStripeCheckoutVisibleClient } from "../lib/stripe-checkout-flags";
import {
  blockedEmailsFromDocs,
  conversationKey,
  isUnreadMessageForUser,
  messageInActiveConversation,
  messageInInboxList,
} from "../lib/messages-unread";
import {
  hiddenMapFromDocs,
  shouldShowConversationInInbox,
  type HiddenConversationRecord,
} from "../lib/conversation-hide";
// Feature 8: Expanded risky keywords
const RISKY_KEYWORDS = [
  "pay outside", "bank transfer only", "crypto", "gift card",
  "whatsapp", "telegram", "friends and family", "urgent payment",
];
function containsRiskyKeywords(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of RISKY_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

const BUYER_QUICK_REPLIES = [
  "Is this still available?",
  "When can I pick up?",
  "Can we meet in a public place?",
  "Can you ship to my area?",
  "Would you accept a lower offer?",
];
const SELLER_QUICK_REPLIES = [
  "Yes, still available.",
  "Pickup works — when suits you?",
  "Happy to meet somewhere public for pickup.",
  "I can ship — what's your suburb?",
  "Happy to negotiate on price.",
];
const PUBLIC_MEETING_CHIPS = [
  "Let's meet in a public place.",
  "Happy to do a public pickup.",
];
function formatTime(timestamp: any) {
  if (!timestamp?.seconds) return "";
  const date = new Date(timestamp.seconds * 1000);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
function formatFullTime(timestamp: any) {
  if (!timestamp?.seconds) return "";
  return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
export default function MessagesPageWrapper() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <BraveWarning />
      <Background />
      <Navbar />
      <Suspense fallback={<div className="flex h-full items-center justify-center p-12"><LoadingSpinner text="Loading messages" /></div>}>
        <MessagesPage />
      </Suspense>
    </main>
  );
}
function getSearchParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return new URLSearchParams(window.location.search).get(key); } catch { return null; }
}
function MessagesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [chatUser, setChatUser] = useState("");
  const [chatListingId, setChatListingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [scamWarning, setScamWarning] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [conversationFilter, setConversationFilter] = useState<"all" | "sellers" | "buyers">("all");
  // Typing
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});
  const [conversationUnread, setConversationUnread] = useState<Record<string, number>>({});
  const [conversationReadTimes, setConversationReadTimes] = useState<Record<string, number>>({});
  const [hiddenConversations, setHiddenConversations] = useState<
    Map<string, HiddenConversationRecord>
  >(new Map());
  const [listingCard, setListingCard] = useState<any>(null);
  const seenBatchRef = useRef<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Keyboard-avoiding: scroll message input into view when keyboard opens on mobile
  useEffect(() => {
    if (typeof window === "undefined" || !("visualViewport" in window)) return;
    const onResize = () => {
      if (window.innerWidth < 768) {
        document.querySelector('[class*="px-5"][class*="py-2.5"]')?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    };
    window.visualViewport!.addEventListener("resize", onResize);
    return () => window.visualViewport!.removeEventListener("resize", onResize);
  }, []);
  // Feature 3: Seller verification
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [sellerTrust, setSellerTrust] = useState<{ score: number; level: string } | null>(null);
  // Feature 4: Profile quick preview
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const profilePreviewRef = useRef<HTMLDivElement>(null);
  // Feature 7: Image sending
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileAttachment, setFileAttachment] = useState<{ name: string; size: number; data: string } | null>(null);
  const fileAttachInputRef = useRef<HTMLInputElement>(null);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [blockConfirmTarget, setBlockConfirmTarget] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const [showSafetyWarning, setShowSafetyWarning] = useState(false);
  const [riskyKeyword, setRiskyKeyword] = useState<string | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);
  const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTime = useRef(0);
  // â€”â€” Effects â€”â€”
  // Auth listener
  useEffect(() => {
    let mounted = true;
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (!mounted) return;
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => { mounted = false; unsub(); };
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("blockedUsers") || "[]");
      setBlockedUsers(saved);
    } catch {}
  }, []);
  // Sync blocked users from Firestore when authenticated
  useEffect(() => {
    if (!user?.uid) return;
    const blockedQ = collection(db, "users", user.uid, "blocked");
    const unsub = onSnapshot(
      blockedQ,
      (snap) => {
        const emails = blockedEmailsFromDocs(snap.docs);
        setBlockedUsers(emails);
        localStorage.setItem("blockedUsers", JSON.stringify(emails));
      },
      (e) => console.error("Failed to fetch blocked users:", e)
    );
    return () => unsub();
  }, [user?.uid]);
  useEffect(() => {
    if (!user?.uid) {
      setHiddenConversations(new Map());
      return;
    }
    const hiddenQ = collection(db, "profiles", user.uid, "inboxHidden");
    const unsub = onSnapshot(
      hiddenQ,
      (snap) => {
        setHiddenConversations(hiddenMapFromDocs(snap.docs));
      },
      (e) => console.error("Failed to fetch hidden conversations:", e)
    );
    return () => unsub();
  }, [user?.uid]);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  useEffect(() => {
    const conversationId = getSearchParam("conversation");
    if (conversationId && user?.email) {
      getDoc(doc(db, "conversations", conversationId)).then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const other = data.participants?.find((p: string) => p !== user.email);
        if (other) {
          setChatUser(other);
          setChatListingId(data.listingId || null);
          if (isMobile) setMobileView("chat");
        }
      }).catch(() => {});
      return;
    }
    const param = getSearchParam("user");
    if (param) {
      if (isEmailLike(param)) {
        setChatUser(param);
      } else {
        fetchPublicProfileBySlug(param).then((profile) => {
          const profileEmail = profile?.email || param;
          setChatUser(profileEmail);
        }).catch(() => setChatUser(param));
      }
      const listingParam = getSearchParam("listing");
      setChatListingId(listingParam || null);
      const title = getSearchParam("title");
      const image = getSearchParam("image");
      const price = getSearchParam("price");
      if (listingParam && (title || image || price)) {
        setListingCard((prev: any) =>
          prev?.id === listingParam
            ? prev
            : {
                id: listingParam,
                title: title || "",
                image: image || "",
                price: price || "",
              }
        );
      }
      if (isMobile) setMobileView("chat");
    }
  }, [isMobile, user?.email]);

  // Read pre-fill message from localStorage (used by job Apply Now)
  useEffect(() => {
    try {
      const prefill = localStorage.getItem("skyJobPrefill");
      if (prefill && !message) {
        setMessage(prefill);
        localStorage.removeItem("skyJobPrefill");
        const timer = setTimeout(() => messageInputRef.current?.focus(), 100);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, [chatUser, message]);

  useEffect(() => {
    if (chatUser) fetchUsername(chatUser);
  }, [chatUser]);

  // Clear rate limiter when conversation changes
  useEffect(() => {
    if (chatUser) {
      try {
        const msgTracker = JSON.parse(localStorage.getItem("msgTracker") || "{}");
        delete msgTracker[chatUser];
        localStorage.setItem("msgTracker", JSON.stringify(msgTracker));
      } catch (e) { console.error("Failed to clear rate limiter:", e); }
    }
  }, [chatUser]);

  // Fetch seller profile + trust score
  useEffect(() => {
    if (!chatUser) { setSellerProfile(null); setSellerTrust(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchPublicProfileBySlug(chatUser);
        if (profile && !cancelled) {
          const profileEmail = profile.email || chatUser;
          const purchaseSnap = await getDocs(
            query(collection(db, "purchases"), where("sellerEmail", "==", profileEmail), limit(100))
          );
          const salesTotal = countSellerSales(
            purchaseSnap.docs.map((d) => d.data() as { status?: string; paymentType?: string })
          );
          setSellerProfile({
            id: profile.uid,
            ...profile,
            sales: salesTotal || profile.salesCount || 0,
          });
          const trust = calculateTrustScore(profile as any);
          setSellerTrust({ score: trust.score, level: trust.score >= 80 ? "Trusted" : trust.score >= 50 ? "Established" : "New" });
        } else if (!cancelled) {
          setSellerProfile(null);
        }
      } catch (e) { console.error("Failed to fetch seller profile:", e); }
    })();
    return () => { cancelled = true; };
  }, [chatUser]);

  // Force refresh username for current chat user to avoid stale cache
  useEffect(() => {
    if (!chatUser) return;
    fetchUsername(chatUser, true);
  }, [chatUser]);
  // Close profile preview on outside click
  useEffect(() => {
    if (!showProfilePreview) return;
    const handler = (e: MouseEvent) => {
      if (profilePreviewRef.current && !profilePreviewRef.current.contains(e.target as Node)) {
        setShowProfilePreview(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProfilePreview]);
  // Fetch listing data (one-time read - doesn't need real-time updates)
  useEffect(() => {
    if (!chatListingId) {
      setListingCard(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "listings", chatListingId)).then((snap) => {
      if (cancelled) return;
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        setListingCard({
          id: snap.id,
          ...data,
          image:
            (Array.isArray(data.images) && data.images[0]) ||
            data.imageUrl ||
            data.image ||
            "",
        });
      }
    }).catch((err) => {
      if (cancelled) return;
      console.error("Failed to fetch listing data:", err);
      const msgWithListing = messages.find((m: any) => m.listingId === chatListingId && m.listingImage);
      if (msgWithListing) {
        setListingCard({
          id: chatListingId,
          title: msgWithListing.listingTitle,
          image: msgWithListing.listingImage,
          price: msgWithListing.listingPrice,
        });
      }
    });
    return () => { cancelled = true; };
  }, [chatListingId, messages]);
  // Typing listener
  useEffect(() => {
    if (!chatUser || !user?.email) { setOtherTyping(false); return; }
    const typingRef = doc(db, "typing", `${user.email}_${chatUser}_${chatListingId || "general"}`);
    const unsub = onSnapshot(typingRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.typing && data.user !== user.email) {
          setOtherTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
        } else {
          setOtherTyping(false);
        }
      }
    });
    return () => { unsub(); if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [chatUser, user, chatListingId]);
  // Mark as read
  useEffect(() => {
    if (!chatUser || !user?.email) return;
    
    // Clear seen batch when conversation changes to allow re-marking
    seenBatchRef.current.clear();
    
    let cancelled = false;
    const relevant = messages.filter((m: any) =>
      messageInActiveConversation(m, user.email!, chatUser, chatListingId)
    );
    const unreadMsgs = relevant.filter((m: any) => m.sender !== user.email && !m.read);
    
    for (const msg of unreadMsgs) {
      seenBatchRef.current.add(msg.id);
    }

    if (unreadMsgs.length > 0) {
      const messageIds = unreadMsgs.map((m: any) => m.id);
      const tokenP = user.getIdToken();
      tokenP.then((token) => {
        if (cancelled) return;
        fetch("/api/mark-messages-read", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messageIds }),
        }).then(async (res) => {
          if (res.ok) {
            await res.json();
            // Immediately update local messages state for instant UI feedback
            setMessages(prev => prev.map(m => 
              messageIds.includes(m.id) ? { ...m, read: true } : m
            ));
          } else {
            console.error("[messages] Failed to mark messages read");
          }
        }).catch((e) => console.error("Failed to batch mark messages read:", e));
      }).catch((e) => console.error("Failed to get token for mark-read:", e));

      // Also mark corresponding notification documents as read
      getDocs(
        query(
          collection(db, "notifications"),
          where("targetEmail", "==", user.email),
          orderBy("createdAt", "desc"),
          limit(30)
        )
      ).then((snap) => {
        if (cancelled) return;
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.read === true) return;
          const fromEmail = data.fromEmail as string | undefined;
          const type = data.type as string | undefined;
          // Mark message-type notifications read if from the same user, regardless of listingId
          if (type === "message" && fromEmail === chatUser) {
            updateDoc(doc(db, "notifications", d.id), { read: true }).catch((e) =>
              console.error("Failed to mark notification read:", e)
            );
            return;
          }
          // For other notification types, require listingId match
          if ((data.listingId || "") !== (chatListingId || "")) return;
          if (fromEmail && fromEmail !== chatUser) return;
          updateDoc(doc(db, "notifications", d.id), { read: true }).catch((e) =>
            console.error("Failed to mark notification read:", e)
          );
        });
      }).catch((e) => console.error("Failed to fetch notifications to mark read:", e));
    }

    return () => { cancelled = true; };
  }, [chatUser, user, messages, chatListingId]);
  // Fetch usernames - always fetch fresh data for current chat user to avoid stale cache
  async function fetchUsername(identifier: string, forceRefresh = false) {
    if (!identifier || identifier === "system") return;
    if (!forceRefresh && usernames[identifier]) return;
    try {
      const profile = await fetchPublicProfileBySlug(identifier, { forceRefresh });
      let handle = "User";
      if (profile) {
        handle = publicHandleFromProfile(profile, "User");
        const profileEmail = profile.email;
        if (profileEmail && profileEmail !== identifier) {
          setUsernames((prev) => ({ ...prev, [profileEmail]: handle }));
        }
      }
      setUsernames((prev) => ({ ...prev, [identifier]: handle }));
    } catch (e) {
      console.error("Failed to fetch username:", e);
    }
  }
  // Main messages listener
  useEffect(() => {
    if (!user?.email) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    const msgQuery = query(
      collection(db, "messages"),
      where("participants", "array-contains", user.email),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(msgQuery, (snap) => {
      if (!mounted) return;
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((msg: any) => messageInInboxList(msg, user.email!, blockedUsers));
      items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setMessages(items);
      setLoading(false);
      if (snap.metadata?.hasPendingWrites) return;
      // Force refresh all participant usernames on initial load to ensure fresh data
      const isInitialLoad = !snap.metadata.hasPendingWrites && items.length > 0 && Object.keys(usernames).length === 0;
      items.forEach((msg: any) => {
        fetchUsername(msg.sender, isInitialLoad);
        fetchUsername(msg.receiver, isInitialLoad);
        msg.participants?.forEach((p: string) => fetchUsername(p, isInitialLoad));
        extractEmailsFromText(msg.text || "").forEach((e) => fetchUsername(e, isInitialLoad));
      });
    }, (err) => { 
      console.error("Messages snapshot error:", err);
      if (mounted) {
        setLoading(false);
      }
    });

    return () => { mounted = false; unsub(); };
  }, [user?.email, blockedUsers]);
  // Unread map
  useEffect(() => {
    const map: Record<string, number> = {};
    const raw: Record<string, boolean> = {};
    messages.forEach((msg: any) => {
      if (!isUnreadMessageForUser(msg, user?.email)) return;
      const other = msg.participants?.find((p: string) => p !== user?.email);
      if (!other) return;
      const key = conversationKey(other, msg.listingId);
      map[key] = (map[key] || 0) + 1;
      raw[msg.id] = true;
    });
    setConversationUnread(map);
    setUnreadMap(raw);
  }, [messages, user?.email, blockedUsers]);

  // Compute filteredMessages for chat view
  const conversationMessagesNewestFirst = useMemo(
    () =>
      messages.filter((msg: any) =>
        messageInActiveConversation(msg, user?.email || "", chatUser, chatListingId)
      ),
    [messages, chatUser, chatListingId, user?.email]
  );

  const filteredMessages = useMemo(
    () => {
      const deduplicated = dedupeConversationOrderMessages(conversationMessagesNewestFirst);
      return deduplicated.reverse();
    },
    [conversationMessagesNewestFirst]
  );
    // Auto-scroll
    useEffect(() => {
      if (chatEndRef.current && filteredMessages.length > 0) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, [filteredMessages.length, otherTyping]);
    // â€”â€” Functions â€”â€”
    async function emitTyping(typing: boolean) {
      if (!chatUser || !user?.email) return;
      try {
        await setDoc(doc(db, "typing", `${user.email}_${chatUser}_${chatListingId || "general"}`), { typing, user: user.email, at: serverTimestamp() });
      } catch (e) { console.error("Failed to emit typing:", e); }
    }
  const MAX_CHAT_IMAGE_SIZE_MB = 10;
  const MAX_CHAT_IMAGE_SIZE_BYTES = MAX_CHAT_IMAGE_SIZE_MB * 1024 * 1024;
  const ALLOWED_CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const MAX_CHAT_FILE_SIZE_MB = 25;
  const MAX_CHAT_FILE_SIZE_BYTES = MAX_CHAT_FILE_SIZE_MB * 1024 * 1024;
  const ALLOWED_CHAT_FILE_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "image/jpeg", "image/png", "image/webp", "image/gif"];

  // Feature 7: Image sending
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_CHAT_IMAGE_TYPES.includes(file.type)) {
      showToast("Only JPG, PNG, WebP, and GIF images are allowed.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_CHAT_IMAGE_SIZE_BYTES) {
      showToast(`Image too large. Max ${MAX_CHAT_IMAGE_SIZE_MB}MB.`, "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => { setImagePreview(ev.target?.result as string); };
    reader.readAsDataURL(file);
  }
  function dataURLtoBlob(dataUrl: string): Blob | null {
    try {
      const parts = dataUrl.split(",");
      if (parts.length < 2) return null;
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch?.[1] || "application/octet-stream";
      const bytes = atob(parts[1]);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch { return null; }
  }

  const lastSendAtRef = useRef(0);
  function checkMessageRateLimit(): boolean {
    const now = Date.now();
    if (now - lastSendAtRef.current < 1500) {
      showToast("Please wait a moment before sending again", "info");
      return false;
    }
    lastSendAtRef.current = now;
    return true;
  }

  async function sendImageMessage() {
    if (!imagePreview || !user?.email || !chatUser || sendingAttachment) return;
    if (!checkMessageRateLimit()) return;
    const activeListingTitle = chatListingId ? messages.find((m: any) => m.listingId === chatListingId && m.listingTitle)?.listingTitle : null;
    setSendingAttachment(true);
    try {
      const blob = dataURLtoBlob(imagePreview);
      if (!blob) { showToast("Failed to process image", "error"); setSendingAttachment(false); return; }
      const file = new File([blob], "chat.jpg", { type: "image/jpeg" });
      const nsfwResult = await checkImage(file);
      if (!nsfwResult.safe) {
        showToast(`Image flagged: ${nsfwResult.reason}`, "error");
        setImagePreview(null);
        setSendingAttachment(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const storageRef = ref(storage, `chat_images/${user.uid}/${Date.now()}.jpg`);
      const snap = await uploadBytes(storageRef, blob);
      const imageUrl = await getDownloadURL(snap.ref);
      const token = await user.getIdToken();
      await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "image", imageUrl, text: "", receiver: chatUser,
          listingId: chatListingId || undefined, listingTitle: activeListingTitle || undefined,
        }),
      });
      createNotification({
        targetEmail: chatUser,
        fromEmail: user.email,
        type: "message",
        title: "New image from " + notificationSenderLabel(),
        message: "Sent an image",
        listingId: chatListingId || undefined,
        listingTitle: activeListingTitle || undefined,
      });
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) { console.error(e); showToast("Failed to send image", "error"); }
    setSendingAttachment(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_CHAT_FILE_TYPES.includes(file.type)) {
      showToast("Unsupported file type. Use PDF, Word, TXT, or images.", "error");
      if (fileAttachInputRef.current) fileAttachInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_CHAT_FILE_SIZE_BYTES) {
      showToast(`File too large. Max ${MAX_CHAT_FILE_SIZE_MB}MB.`, "error");
      if (fileAttachInputRef.current) fileAttachInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileAttachment({ name: file.name, size: file.size, data: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  }

  async function sendFileMessage() {
    if (!fileAttachment || !user?.email || !chatUser || sendingAttachment) return;
    if (!checkMessageRateLimit()) return;
    const activeListingTitle = chatListingId ? messages.find((m: any) => m.listingId === chatListingId && m.listingTitle)?.listingTitle : null;
    setSendingAttachment(true);
    try {
      const blob = dataURLtoBlob(fileAttachment.data);
      if (!blob) { showToast("Failed to process file", "error"); setSendingAttachment(false); return; }
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const storageRef = ref(storage, `chat_files/${user.uid}/${Date.now()}_${fileAttachment.name}`);
      const snap = await uploadBytes(storageRef, blob);
      const fileUrl = await getDownloadURL(snap.ref);
      const token = await user.getIdToken();
      await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "file", fileUrl, fileName: fileAttachment.name, fileSize: fileAttachment.size,
          text: "", receiver: chatUser,
          listingId: chatListingId || undefined, listingTitle: activeListingTitle || undefined,
        }),
      });
      createNotification({
        targetEmail: chatUser,
        fromEmail: user.email,
        type: "message",
        title: "New file from " + notificationSenderLabel(),
        message: "Sent a file",
        listingId: chatListingId || undefined,
        listingTitle: activeListingTitle || undefined,
      });
      setFileAttachment(null);
      if (fileAttachInputRef.current) fileAttachInputRef.current.value = "";
    } catch (e) { console.error(e); showToast("Failed to send file", "error"); }
    setSendingAttachment(false);
  }
  const MAX_MESSAGE_LENGTH = 2000;
  const isOwnListing = listingCard?.sellerEmail === user?.email;
  const stripeCheckoutVisible = isStripeCheckoutVisibleClient();
  const quickReplies = [
    ...(isOwnListing ? SELLER_QUICK_REPLIES : BUYER_QUICK_REPLIES),
    ...PUBLIC_MEETING_CHIPS.filter(
      (chip) => !(isOwnListing ? SELLER_QUICK_REPLIES : BUYER_QUICK_REPLIES).includes(chip)
    ),
  ];

  // Send text message
  async function sendMessage(skipSafety = false, textOverride?: string) {
    if (sendingMessage) return;
    const textToSend = (textOverride ?? message).trim();
    if (!textToSend) return;
    if (!user?.email) { showToast("Please log in first", "info"); return; }
    if (!chatUser.trim()) { showToast("Select a conversation", "info"); return; }
    if (blockedUsers.includes(chatUser)) { showToast("This user is blocked", "error"); return; }
    if (textToSend.length > MAX_MESSAGE_LENGTH) {
      showToast(`Message is too long. Max ${MAX_MESSAGE_LENGTH} characters.`, "error");
      return;
    }

    if (!checkMessageRateLimit()) return;

    if (!skipSafety) {
      const result = detectScam(textToSend);
      if (result.isScam && !pendingMessage) { setPendingMessage(textToSend); setScamWarning(true); return; }
      const kw = containsRiskyKeywords(textToSend);
      if (kw) { setRiskyKeyword(kw); setShowSafetyWarning(true); return; }
    }

    setSendingMessage(true);
    const ownListing = listingCard?.sellerEmail === user.email;
    const activeListingTitle = listingCard?.title || null;
    const activeListingImage = listingCard?.images?.[0] || listingCard?.image || listingCard?.imageUrl || null;
    const activeListingPrice = listingCard?.price || null;
    const convKey = chatListingId ? conversationKey(chatUser, chatListingId) : undefined;
    const tempId = "temp_" + Date.now();
    try {
      // Optimistic update - show message instantly
      const optimisticMsg = {
        id: tempId,
        text: textToSend,
        sender: user.email,
        receiver: chatUser,
        participants: [user.email, chatUser],
        ...(chatListingId ? { listingId: chatListingId, listingTitle: activeListingTitle, listingImage: activeListingImage, listingPrice: activeListingPrice } : {}),
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
      };
      setMessages((prev) => [optimisticMsg, ...prev]);
      setMessage("");
      // Auto-scroll after optimistic update
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

      const sendToken = await user.getIdToken();
      await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sendToken}` },
        body: JSON.stringify({
          text: textToSend, receiver: chatUser,
          listingId: chatListingId || undefined, listingTitle: activeListingTitle || undefined,
          listingImage: activeListingImage || undefined, listingPrice: activeListingPrice || undefined,
          createConversation: !!chatListingId,
          convKey,
          buyerEmail: ownListing ? chatUser : user.email,
          sellerEmail: ownListing ? user.email : chatUser,
        }),
      });
      trackFunnelEvent({
        event: "message_sent",
        userId: user.uid,
        listingId: chatListingId || undefined,
      });
      createNotification({
        targetEmail: chatUser,
        fromEmail: user.email,
        type: "message",
        title: "New message from " + notificationSenderLabel(),
        message: textToSend.length > 100 ? textToSend.slice(0, 100) + "..." : textToSend,
        listingId: chatListingId || undefined,
        listingTitle: activeListingTitle || undefined,
        listingImage: activeListingImage || undefined,
      });
      await emitTyping(false);
    } catch (e) {
      console.error(e);
      showToast("Failed to send", "error");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSendingMessage(false);
    }
  }

  async function sendQuickReply(reply: string) {
    if (sendingMessage || !reply.trim()) return;
    await sendMessage(false, reply);
  }
  async function sendPendingMessage() {
    if (!pendingMessage || !user?.email || !chatUser) return;
    if (!checkMessageRateLimit()) return;
    setScamWarning(false);
    setMessage("");
    try {
      const sendToken = await user.getIdToken();
      await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sendToken}` },
        body: JSON.stringify({ text: pendingMessage, receiver: chatUser }),
      });
      createNotification({
        targetEmail: chatUser,
        fromEmail: user.email,
        type: "message",
        title: "New message from " + notificationSenderLabel(),
        message: pendingMessage.length > 100 ? pendingMessage.slice(0, 100) + "..." : pendingMessage,
      });
    } catch (e) { console.error(e); }
    setPendingMessage("");
  }
  async function blockUser(email: string) {
    if (!user?.uid || blockedUsers.includes(email)) {
      setShowMenu(false);
      return;
    }
    const updated = [...blockedUsers, email];
    setBlockedUsers(updated);
    localStorage.setItem("blockedUsers", JSON.stringify(updated));
    window.dispatchEvent(new Event("blocked-users-changed"));
    setShowMenu(false);
    try {
      let uid = email;
      const profileSnap = await getDocs(query(collection(db, "profiles"), where("email", "==", email)));
      if (!profileSnap.empty) uid = profileSnap.docs[0].id;
      await setDoc(doc(db, "users", user.uid, "blocked", uid), {
        blockedUid: uid,
        blockedEmail: email,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to persist block:", e);
    }
  }
  async function markAllAsRead() {
    if (!user?.email) return;
    try {
      const unreadMessageIds = messages
        .filter((m: any) => isUnreadMessageForUser(m, user.email))
        .map((m: any) => m.id);
      if (unreadMessageIds.length === 0) {
        showToast("No unread messages", "info");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/mark-messages-read", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageIds: unreadMessageIds }),
      });
      if (!res.ok) throw new Error("Failed to mark messages as read");
      showToast(`Marked ${unreadMessageIds.length} messages as read`, "success");
    } catch (e) {
      console.error("Failed to mark all as read:", e);
      showToast("Failed to mark messages as read", "error");
    }
  }
  async function reportUser(email: string) {
    if (!user?.email) return;
    const cooldownKey = `report_cooldown_user_${email}`;
    const last = localStorage.getItem(cooldownKey);
    if (last && Date.now() - Number(last) < 86400000) { showToast("Already reported", "info"); setShowMenu(false); return; }
    try {
      const { submitReportRequest } = await import("../lib/submit-report.client");
      await submitReportRequest({
        type: "user",
        reportedUserEmail: email,
        reason: "Harassment/abuse",
        details: "Reported from messages",
      });
      localStorage.setItem(cooldownKey, String(Date.now()));
      showToast("User reported", "success");
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Failed to report user", "error");
    }
    setShowMenu(false);
  }
  async function clearConversation() {
    if (!chatUser || !user?.email) return;
    const userEmail: string = user.email;
    try {
      const token = await getFreshIdToken();
      if (!token) return;
      const activeMessage = messages.find((m: any) =>
        messageInActiveConversation(m, userEmail, chatUser, chatListingId)
      );
      await fetch("/api/hide-conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          otherEmail: chatUser,
          listingId: chatListingId,
          conversationId: activeMessage?.conversationId || null,
        }),
      });
      const relevant = messages.filter((m: any) =>
        messageInActiveConversation(m, userEmail, chatUser, chatListingId)
      );
      const messageIds = relevant.map((m: any) => m.id);
      if (messageIds.length > 0) {
        fetch("/api/mark-messages-read", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messageIds }),
        }).catch((e) => console.error("Failed to mark hidden messages read:", e));
      }
    } catch (e) {
      console.error("Failed to hide conversation:", e);
    }
    setShowMenu(false);
    setChatUser("");
    setChatListingId(null);
  }
  async function executeClearAllMessages() {
    if (!user?.email) return;
    setClearAllConfirm(false);
    const targets = new Map<
      string,
      { otherEmail: string; listingId: string | null; conversationId: string | null }
    >();
    for (const msg of messages) {
      if (!messageInInboxList(msg, user.email, blockedUsers)) continue;
      const other = msg.participants?.find((p: string) => p !== user.email);
      if (!other) continue;
      const key = conversationKey(other, msg.listingId);
      if (!targets.has(key)) {
        targets.set(key, {
          otherEmail: other,
          listingId: msg.listingId || null,
          conversationId: msg.conversationId || null,
        });
      }
    }
    const token = await user.getIdToken();
    const res = await fetch("/api/hide-conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversations: Array.from(targets.values()) }),
    });
    const data = await res.json().catch(() => ({}));
    setChatUser("");
    setChatListingId(null);
    if (res.ok) {
      showToast(`Cleared ${data.hidden || targets.size} conversation(s) from your inbox`, "info");
    } else {
      showToast(data.error || "Could not clear conversations", "error");
    }
  }
  // Feature 3: Offer system with status
  async function sendOffer(type: string, amount?: string) {
    if (!user?.email || !chatUser || sendingOffer) return;
    setSendingOffer(true);
    try {
      const tempId = "temp_" + Date.now();
      const offerAmountNum = amount ? Number(amount) : null;
      const offerStatus = type === "make" ? "pending" : type === "accept" ? "accepted" : type === "decline" ? "declined" : "countered";
      const offerText = type === "make" ? `Offer: $${amount || "?"}` : type === "accept" ? "Offer accepted" : type === "decline" ? "Offer declined" : "Counter offer";
      
      // Optimistic update - show offer instantly
      const optimisticMsg = {
        id: tempId,
        type: "offer",
        text: offerText,
        sender: user.email,
        receiver: chatUser,
        participants: [user.email, chatUser],
        offerType: type,
        offerAmount: offerAmountNum,
        offerStatus: offerStatus,
        ...(chatListingId ? { listingId: chatListingId, listingTitle: listingCard?.title || null } : {}),
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
      };
      setMessages((prev) => [optimisticMsg, ...prev]);
      // Auto-scroll after optimistic update
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

      const sendToken = await user.getIdToken();
      const msgRes = await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sendToken}` },
        body: JSON.stringify({
          type: "offer", receiver: chatUser,
          offerType: type,
          offerAmount: offerAmountNum,
          offerStatus: offerStatus,
          text: offerText,
          listingId: chatListingId,
          listingTitle: listingCard?.title || null,
        }),
      });
      const msgData = await msgRes.json().catch(() => ({}));
      // When offer is accepted, create purchase via API (server-side atomic transaction)
      if (type === "accept" && chatListingId && amount && user.email) {
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/accept-offer", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({
              listingId: chatListingId,
              buyerEmail: chatUser,
              amount: Number(amount),
              offerMessageId: msgData.messageId,
              listingTitle: listingCard?.title || "",
              listingPrice: listingCard?.price || "",
              listingImage: listingCard?.images?.[0] || listingCard?.image || listingCard?.imageUrl || "",
            }),
          });
          if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || "Failed to accept offer"); }
        } catch (e2) {
          console.error("Failed to accept offer via API:", e2);
          showToast("Failed to accept offer. Please try again.", "error");
        }
      }
      const notifType = type === "accept" ? "offer_accepted" : type === "decline" ? "offer_declined" : type === "make" ? "offer" : "counter_offer";
      createNotification({
        targetEmail: chatUser,
        fromEmail: user.email,
        type: notifType,
        title: type === "accept" ? "Offer accepted!" : type === "make" ? "New offer received" : type === "decline" ? "Offer declined" : "Counter offer",
        message: type === "accept"
          ? `Your offer of $${amount} on "${listingCard?.title || "a listing"}" has been accepted!`
          : type === "decline"
          ? `Your offer of $${amount} on "${listingCard?.title || "a listing"}" was declined.`
          : `$${amount || ""} — ${listingCard?.title || "a listing"}`,
        listingId: chatListingId || undefined,
        listingTitle: listingCard?.title || undefined,
        listingImage: listingCard?.images?.[0] || listingCard?.image || listingCard?.imageUrl || undefined,
        total: amount ? Number(amount) : undefined,
      });
    } catch (e) { console.error(e); showToast("Failed to send offer", "error"); }
    setSendingOffer(false);
  }
  const [offerAmount, setOfferAmount] = useState("");
  const [showOfferInput, setShowOfferInput] = useState(false);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{amount: string; listingId: string; listingTitle: string; listingImage: string; listingPrice: string; sellerEmail: string; buyerEmail: string} | null>(null);
  // â€”â€” Computed values â€”â€”
  const conversationMap = new Map<string, any>();
  messages.forEach((msg: any) => {
    if (!messageInInboxList(msg, user?.email || "", blockedUsers)) return;
    const otherUser = msg.participants?.find((p: string) => p !== user?.email);
    if (!otherUser) return;
    const key = conversationKey(otherUser, msg.listingId);
    const msgTime = msg.createdAt?.toMillis?.() || msg.createdAt?.seconds * 1000 || 0;
    const existing = conversationMap.get(key);
    const existingTime =
      existing?.msg?.createdAt?.toMillis?.() ||
      existing?.msg?.createdAt?.seconds * 1000 ||
      0;
    if (!existing || msgTime >= existingTime) {
      conversationMap.set(key, {
        participant: otherUser,
        listingId: msg.listingId || null,
        listingTitle: msg.listingTitle || null,
        msg,
      });
    }
  });
  let conversations = Array.from(conversationMap.entries()).filter(([key, c]) =>
    shouldShowConversationInInbox(key, hiddenConversations, c.msg, user?.email || "")
  );
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    conversations = conversations.filter(([_, c]) => {
      const name = getDisplayName(c.participant).toLowerCase();
      const title = (c.listingTitle || "").toLowerCase();
      const text = (c.msg.text || "").toLowerCase();
      return name.includes(q) || title.includes(q) || text.includes(q);
    });
  }
  if (showUnreadOnly) {
    conversations = conversations.filter(([key]) => (conversationUnread[key] || 0) > 0);
  }
  if (conversationFilter === "sellers") {
    conversations = conversations.filter(([_, c]) => c.listingId !== null);
  }
  if (conversationFilter === "buyers") {
    conversations = conversations.filter(([_, c]) => c.listingId === null);
  }
  function getDisplayName(email: string) {
    if (!email || email === "system") return "System";
    return usernames[email] || "User";
  }
  function formatMessageText(text: string) {
    return sanitizePublicText(text || "", usernames);
  }
  function notificationSenderLabel() {
    if (!user?.email) return "Someone";
    const handle = usernames[user.email];
    if (handle && handle !== "User") return handle.startsWith("@") ? handle.slice(1) : handle;
    return "Someone";
  }
  const isAuction = listingCard?.saleType === "auction" || listingCard?.saleType === "auction_buy_now" || !!listingCard?.auctionEndsAt;
  const auctionEnded = (() => {
    if (listingCard?.status === "sold") return true;
    if (!isAuction || !listingCard?.auctionEndsAt) return false;
    const endsAt = listingCard.auctionEndsAt;
    const time = endsAt?.toMillis?.() || endsAt?.seconds * 1000 || new Date(endsAt).getTime();
    return time < Date.now();
  })();
  const isAuctionWinner = auctionEnded && listingCard?.highestBidder === user?.email;
  const isAuctionSeller = auctionEnded && listingCard?.sellerEmail === user?.email;
  const [hasPurchaseInChat, setHasPurchaseInChat] = useState(false);
  const [purchaseData, setPurchaseData] = useState<any>(null);
  const [confirmingArrangeSale, setConfirmingArrangeSale] = useState(false);
  const router = useRouter();

  async function confirmArrangeSaleInChat() {
    if (!purchaseData?.id) return;
    setConfirmingArrangeSale(true);
    try {
      const token = await getFreshIdToken();
      if (!token) {
        showToast("Please sign in again.", "error");
        return;
      }
      const res = await fetch("/api/confirm-arrange-sale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ purchaseId: purchaseData.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not confirm sale", "error");
        return;
      }
      showToast("Marked as sold.", "success");
    } catch {
      showToast("Could not confirm sale", "error");
    } finally {
      setConfirmingArrangeSale(false);
    }
  }
  useEffect(() => {
    if (!chatUser || !user?.email || !chatListingId) {
      setHasPurchaseInChat(false);
      setPurchaseData(null);
      return;
    }

    const q = query(
      collection(db, "purchases"),
      where("listingId", "==", chatListingId)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const matched = pickConversationPurchase(snap.docs, user.email!, chatUser);
        if (matched) {
          setHasPurchaseInChat(true);
          setPurchaseData({ id: matched.id, ...matched.data });
        } else {
          setHasPurchaseInChat(false);
          setPurchaseData(null);
        }
      },
      () => {
        setHasPurchaseInChat(false);
        setPurchaseData(null);
      }
    );

    return () => unsub();
  }, [chatUser, chatListingId, user?.email]);
  // â€”â€” Render â€”â€”
  return (
    <>
      {/* Block User Confirmation Modal */}
      {blockConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setBlockConfirmTarget(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-red-400">Block User</h3>
            <p className="mt-2 text-sm text-[var(--foreground)]">Block {getDisplayName(blockConfirmTarget)}? They won&apos;t be able to message you, and their messages will be hidden.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setBlockConfirmTarget(null)} className="flex-1 rounded-xl border border-white/[0.08] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)]">Cancel</button>
              <button onClick={() => { blockUser(blockConfirmTarget); setBlockConfirmTarget(null); }} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Block</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Messages Confirmation Modal */}
      {clearAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setClearAllConfirm(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-red-400">Clear All Conversations</h3>
            <p className="mt-2 text-sm text-[var(--foreground)]">Remove all conversations from your inbox? Other participants keep their messages. New replies will bring threads back.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setClearAllConfirm(false)} className="flex-1 rounded-xl border border-white/[0.08] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)]">Cancel</button>
              <button onClick={executeClearAllMessages} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Clear All</button>
            </div>
          </div>
        </div>
      )}

      {/* Scam Warning Modal */}
      {scamWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setScamWarning(false); setPendingMessage(""); }}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-white/[0.08] bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[var(--foreground)]">Safety Warning</h3>
              <button onClick={() => { setScamWarning(false); setPendingMessage(""); }} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]">
              Your message contains words associated with suspicious activity. {STAY_ON_SKY_DROP_HEADLINE} so we can review disputes and reports — we cannot see SMS, email, or other apps.
            </p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setScamWarning(false); setPendingMessage(""); }} className="flex-1 rounded-xl border border-white/[0.08] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)]">Edit Message</button>
              <button onClick={sendPendingMessage} className="flex flex-1 items-center justify-center rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">Send Anyway</button>
            </div>
          </div>
        </div>
      )}
      {/* Risky keyword warning */}
      {showSafetyWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowSafetyWarning(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-sky-500/20 bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-sky-400">Payment Safety</h3>
              <button onClick={() => setShowSafetyWarning(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]">
              Your message mentions &ldquo;{riskyKeyword}&rdquo; — often used to move deals off Sky Drop. {STAY_ON_SKY_DROP_HEADLINE} so there is a record of what you agreed. {V1_ARRANGE_SAFETY_ONE_LINER} Off-platform chats cannot be reviewed.
            </p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setShowSafetyWarning(false)} className="flex-1 rounded-xl border border-white/[0.08] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)]">Edit Message</button>
              <button onClick={() => { setShowSafetyWarning(false); sendMessage(true); }} className="flex flex-1 items-center justify-center rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">Send Anyway</button>
            </div>
          </div>
        </div>
      )}
      <section className={`${PAGE_SHELL_CHAT} py-4 sm:py-8`}>
        <div
          className={`flex w-full overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl backdrop-blur-xl sm:rounded-[40px] ${
            !isMobile || mobileView === "list"
              ? "h-[calc(100dvh-8.5rem-var(--mobile-nav-offset,0px))] sm:h-[calc(100dvh-18rem)]"
              : "h-[calc(100dvh-5.5rem-var(--mobile-nav-offset,0px))] sm:h-[calc(100dvh-10rem)]"
          }`}
        >
          {/* SIDEBAR */}
          <div className={`flex w-[340px] flex-col border-r border-[var(--card-border)] ${isMobile && mobileView === "chat" ? "hidden" : "flex"} ${isMobile ? "w-full" : ""}`}>
            <div className="border-b border-[var(--card-border)] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-xl font-black text-sky-400 sm:text-2xl">Inbox</h1>
                {messages.length > 0 && (
                  <button
                    onClick={() => setClearAllConfirm(true)}
                    className="text-[10px] text-red-400 underline decoration-red-400/30 underline-offset-2 transition hover:text-red-300 hover:decoration-red-400/60"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search conversations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] py-2.5 pl-9 pr-4 text-[13px] text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-500" />
                </div>
                <select
                  value={conversationFilter}
                  onChange={(e) => setConversationFilter(e.target.value as "all" | "sellers" | "buyers")}
                  className="h-[42px] shrink-0 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] px-3 text-[12px] text-[var(--foreground)] outline-none transition focus:border-sky-500"
                >
                  <option value="all">All</option>
                  <option value="sellers">Sellers</option>
                  <option value="buyers">Buyers</option>
                </select>
                <button onClick={() => setShowUnreadOnly((prev) => !prev)}
                  className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border transition ${
                    showUnreadOnly
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : "border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] hover:border-red-400 hover:text-red-400"
                  }`} title="Show unread only">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </button>
                <button onClick={markAllAsRead}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] transition hover:border-sky-400 hover:text-sky-400"
                  title="Mark all as read">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {loading ? (
                <div className="flex justify-center p-6"><LoadingSpinner text="Loading conversations" /></div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04]">
                    <svg className="h-5 w-5 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <p className="mt-4 text-[13px] font-medium text-[var(--foreground)]">No conversations yet</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">Messages about listings will appear here.</p>
                  <Link href="/" className="btn btn-primary btn-sm mt-4">
                    Browse Marketplace
                  </Link>
                </div>
              ) : (
                conversations.map(([key, convo]: any) => {
                  const unreadCount = conversationUnread[key] || 0;
                  const hasOffer = messages.some((m: any) => { const other = m.participants?.find((p: string) => p !== user?.email); return other === convo.participant && m.type === "offer"; });
                  return (
                    <button key={key}
                      onClick={() => { 
                        setChatUser(convo.participant); 
                        setChatListingId(convo.listingId); 
                        if (isMobile) setMobileView("chat"); 
                      }}
                      className={`flex w-full items-start gap-3 border-b border-[var(--card-border)] px-4 py-3.5 text-left transition-all duration-200 hover:bg-sky-500/5 ${chatUser === convo.participant && chatListingId === convo.listingId ? "bg-sky-500/10" : ""}`}>
                      {/* Thumbnail */}
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-600/10 ring-2 ring-white/[0.04]">
                        {convo.msg.listingImage ? (
                          <img src={convo.msg.listingImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm font-black text-sky-400">
                            SD
                          </div>
                        )}
                      </div>
                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-[13px] ${unreadCount > 0 ? "font-bold text-[var(--foreground)]" : "font-medium text-[var(--foreground)]"}`}>
                            {getDisplayName(convo.participant)}
                          </span>
                          <span className="shrink-0 text-[10px] text-[var(--muted)]">{formatTime(convo.msg.createdAt)}</span>
                          {hasOffer && <span className="ml-1 shrink-0 text-[10px] text-amber-400">Offer</span>}
                        </div>
                        <p className={`mt-1 truncate text-[12px] leading-relaxed ${unreadCount > 0 ? "font-medium text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                          {convo.msg.text
                            ? formatMessageText(convo.msg.text)
                            : convo.msg.type === "image"
                              ? "Photo"
                              : convo.msg.type === "file"
                                ? `${convo.msg.fileName || "File"}`
                                : convo.msg.type === "offer"
                                  ? `Offer: $${convo.msg.offerAmount || ""}`
                                  : convo.msg.type === "purchase"
                                    ? "Purchase request"
                                    : ""}
                        </p>
                        {convo.listingTitle && (
                          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[9px] font-medium text-sky-400 truncate max-w-full">{convo.listingTitle}</span>
                        )}
                      </div>
                      {/* Unread badge */}
                      {unreadCount > 0 && (
                        <span className="flex h-5 min-w-[18px] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[9px] font-bold text-white shrink-0 mt-0.5 shadow-[0_0_8px_rgba(56,189,248,0.3)]">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}

                    </button>
                  );
                })
              )}
            </div>
          </div>
          {/* CHAT AREA */}
          <div className={`flex flex-1 flex-col ${isMobile && mobileView === "list" ? "hidden" : "flex"}`}>
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-[var(--card-border)] bg-white/[0.01] px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                {isMobile && (
                  <button
                    onClick={() => setMobileView("list")}
                    aria-label="Back to conversations"
                    className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--muted)] hover:bg-white/[0.05] hover:text-[var(--foreground)] active:scale-[0.96]"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                {chatUser ? (
                  <>
                    {/* Clickable avatar for profile preview */}
                    <div className="relative">
                      <button onClick={() => setShowProfilePreview(!showProfilePreview)}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-500/10 text-[14px] font-bold text-sky-400 transition hover:from-sky-500/30 hover:to-sky-500/20 ring-2 ring-white/[0.04]">
                        {getDisplayName(chatUser)[0].toUpperCase()}
                      </button>
                      {/* Profile preview popover */}
                      {showProfilePreview && (
                        <div ref={profilePreviewRef} className="absolute left-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--card)] shadow-2xl shadow-black/40 backdrop-blur-xl"
                          onClick={(e) => e.stopPropagation()}>
                          <div className="relative h-16 bg-gradient-to-r from-sky-500/20 via-sky-500/10 to-sky-500/20">
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-sky-500/10 text-[16px] font-bold text-sky-400 ring-4 ring-[var(--card)]">
                              {getDisplayName(chatUser)[0].toUpperCase()}
                            </div>
                          </div>
                          <div className="p-4 pt-8 text-center">
                            <p className="text-[14px] font-bold text-[var(--foreground)]">{getDisplayName(chatUser)}</p>
                            {sellerProfile && (
                              <>
                                <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-[10px] text-[var(--muted)]">
                                  {sellerProfile.verified && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-400">Verified</span>}
                                  {sellerProfile.trustedSeller && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-400">Trusted</span>}
                                  {sellerProfile.profileBadge === "epic" && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-400 font-bold">💎 Epic</span>}
                                  {sellerProfile.profileBadge === "legendary" && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-400 font-bold animate-pulse">👑 The Five</span>}
                                </div>
                                <p className="mt-2 text-[11px] text-[var(--muted)]">{sellerProfile.sales || 0} sales</p>
                                {sellerProfile.memberSince && (
                                  <p className="text-[10px] text-[var(--muted)]">Member since {new Date(sellerProfile.memberSince.seconds * 1000).getFullYear()}</p>
                                )}
                              </>
                            )}
                            <Link
                              href={`/seller/${encodeURIComponent(
                                sellerProfileSlug({
                                  username: sellerProfile?.username,
                                  sellerEmail: chatUser,
                                  email: chatUser,
                                })
                              )}`}
                              onClick={() => setShowProfilePreview(false)}
                              className="mt-3 inline-block w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-2 text-[11px] font-bold text-white transition hover:brightness-110">
                              View Profile
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] font-bold text-[var(--foreground)]">{getDisplayName(chatUser)}</h2>
                      <div className="flex items-center gap-2 flex-wrap">
                        {sellerProfile?.verified && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-sky-400">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                            Verified
                          </span>
                        )}
                        {sellerTrust && (
                          <span className="text-[10px] text-[var(--muted)]">{sellerTrust.score}% Trust</span>
                        )}
                        {listingCard?.replyTime && (
                          <span className="text-[10px] text-[var(--muted)]">Replies in {listingCard.replyTime}m</span>
                        )}
                        {otherTyping && (
                          <span className="flex items-center gap-1 text-[10px] text-sky-400">
                            Typing
                            <span className="flex gap-0.5">
                              <span className="h-1 w-1 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: "0ms" }} />
                              <span className="h-1 w-1 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: "150ms" }} />
                              <span className="h-1 w-1 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: "300ms" }} />
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <h2 className="text-[15px] font-bold text-[var(--foreground)]">Select Conversation</h2>
                )}
              </div>
              {/* Options menu */}
              {chatUser && (
                <div className="relative">
                  <button onClick={() => setShowMenu(!showMenu)} className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-white/[0.06] hover:text-[var(--foreground)] transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
                    </svg>
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--card)] shadow-2xl shadow-black/40 backdrop-blur-xl p-1.5">
                      <button onClick={() => reportUser(chatUser)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] text-[var(--foreground)] hover:bg-white/[0.06] transition-colors">
                        <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
                        Report user
                      </button>
                      <button onClick={() => setBlockConfirmTarget(chatUser)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] text-[var(--foreground)] hover:bg-white/[0.06] transition-colors">
                        <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        Block user
                      </button>
                      <button onClick={clearConversation} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] text-[var(--foreground)] hover:bg-white/[0.06] transition-colors">
                        <svg className="h-3.5 w-3.5 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Clear conversation
                      </button>
                      {hasPurchaseInChat && purchaseData?.buyerEmail === user?.email && !purchaseData?.disputeStatus && (
                        <button onClick={() => router.push("/purchases")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] text-[var(--foreground)] hover:bg-white/[0.06] transition-colors">
                          <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                          Open Dispute
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Empty state */}
            {!chatUser ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
                <div className="w-full max-w-md text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10">
                    <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[var(--foreground)]">Select a conversation</h3>
                  <p className="mt-1 text-[12px] text-[var(--muted)]">Pick a thread from the left to start messaging.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Messages area */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
                   {/* Listing context card — purchased */}
                  {hasPurchaseInChat && !isRefundedStatus(purchaseData?.status) && (
                    <StayOnSkyDropNotice paymentType={purchaseData?.paymentType} />
                  )}
                  {listingCard && hasPurchaseInChat && (
                    <div className={`mb-2 overflow-hidden rounded-xl border ${
                      isRefundedStatus(purchaseData?.status)
                        ? "border-violet-500/25 bg-[var(--soft-card)]"
                        : "border-[var(--card-border)]/50 bg-[var(--soft-card)]"
                    }`}>
                      <div className="flex items-center gap-3 p-3">
                        {listingCard.image ? (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--soft-card)]">
                            <img src={listingCard.image} alt="" className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-sky-500/20 to-sky-600/10 flex items-center justify-center">
                            <span className="text-sm font-black text-sky-400">SD</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          {!isRefundedStatus(purchaseData?.status) && (
                            <p className="text-[12px] font-black text-sky-400">${purchaseData?.total || listingCard.price}</p>
                          )}
                          {(purchaseData?.tracking || purchaseData?.trackingNumber) &&
                            !isRefundedStatus(purchaseData?.status) &&
                            ["shipped", "delivered", "ready_for_pickup"].includes(purchaseData?.status) && (
                            <p className="mt-1 text-[10px] text-sky-400/90">
                              Tracking: {purchaseData.tracking || purchaseData.trackingNumber}
                            </p>
                          )}
                          {!isRefundedStatus(purchaseData?.status) && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] ${
                                purchaseData?.status === "delivered" || purchaseData?.status === "completed" ? "text-sky-400" :
                                purchaseData?.status === "shipped" ? "text-sky-400" :
                                purchaseData?.status === "seller_confirming" ? "text-sky-400" :
                                purchaseData?.status === "cancelled" ? "text-red-400" :
                                "text-sky-400"
                              }`}>
                                {purchaseData?.status === "arrange_requested"
                                  ? purchaseData?.sellerEmail === user?.email
                                    ? "Awaiting your confirmation"
                                    : "Purchase request sent"
                                  : purchaseData?.status === "pending"
                                    ? "Awaiting seller confirmation"
                                    : purchaseStatusLabel(purchaseData?.status)}
                              </span>
                              {purchaseData?.disputeStatus && (
                                <span className="text-[10px] font-bold text-red-400">
                                  {purchaseData.disputeStatus === "refunded" ? "✅ Refunded" : "⚠️ Disputed"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {purchaseData?.sellerEmail === user?.email &&
                            !isRefundedStatus(purchaseData?.status) &&
                            canSellerConfirmArrangeSale(
                              purchaseData?.status || "",
                              purchaseData?.paymentType
                            ) && (
                            <button
                              type="button"
                              onClick={confirmArrangeSaleInChat}
                              disabled={confirmingArrangeSale}
                              className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-sky-400 disabled:opacity-60"
                            >
                              {confirmingArrangeSale ? "Updating…" : "Mark sold"}
                            </button>
                          )}
                          <Link href={purchaseData?.sellerEmail === user?.email ? "/sales" : "/purchases"}
                            className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white text-center transition hover:bg-sky-400">
                            View Order
                          </Link>
                          {purchaseData?.buyerEmail === user?.email && !purchaseData?.disputeStatus && !isRefundedStatus(purchaseData?.status) && (
                            <button onClick={() => router.push("/purchases")}
                              className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold text-red-400 transition hover:bg-red-500/20">
                              ⚠️ Dispute
                            </button>
                          )}
                        </div>
                      </div>
                      {isRefundedStatus(purchaseData?.status) && (
                        <div className="border-t border-violet-500/15 px-3 pb-3 pt-2">
                          <RefundStatusCard
                            role={purchaseData?.sellerEmail === user?.email ? "seller" : "buyer"}
                            refundAmount={purchaseData?.refundAmount}
                            refundedAt={purchaseData?.refundedAt}
                            total={purchaseData?.total}
                            variant="compact"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {/* Listing context card — auction ended */}
                  {listingCard && !hasPurchaseInChat && auctionEnded && (
                    <div className={`mb-3 overflow-hidden rounded-2xl border ${
                      isAuctionWinner ? "border-sky-500/30 bg-sky-500/5" : "border-sky-500/10 bg-[var(--soft-card)]"
                    }`}>
                      {/* Winner banner */}
                      {isAuctionWinner && (
                        <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-sky-600/20 via-sky-500/30 to-sky-600/20 px-4 py-3">
                          <span className="text-lg">🎉</span>
                          <span className="text-sm font-black tracking-wide text-sky-300">CONGRATULATIONS! YOU WON</span>
                          <span className="text-lg">🎉</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 p-3">
                        {listingCard.image ? (
                          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--soft-card)] shadow-md">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : (
                          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-600/10 shadow-md flex items-center justify-center">
                            <span className="text-lg font-black text-sky-400">SD</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          <p className="text-[15px] font-black text-sky-400">${listingCard.currentBid || listingCard.price}</p>
                          <span className={`text-[11px] font-medium ${
                            isAuctionWinner ? "text-sky-400" : "text-sky-400"
                          }`}>
                            {isAuctionWinner ? "This listing is yours! Arrange pickup or payment below." : isAuctionSeller ? (listingCard.highestBidder ? `${listingCard.highestBidder} won` : "No bids received") : "Auction ended"}
                          </span>
                        </div>
                        <Link href={listingCard?.type === "service" ? "/services" : `/post/listing/${listingCard.id}`}
                          className={`shrink-0 rounded-xl px-4 py-2.5 text-[11px] font-bold shadow-lg transition hover:opacity-80 ${
                            isAuctionWinner
                              ? "bg-gradient-to-r from-sky-500 to-sky-400 text-black"
                              : isAuctionSeller
                                ? listingCard.highestBidder ? "bg-sky-500 text-black" : "bg-[var(--soft-card)] text-[var(--foreground)]"
                                : "bg-[var(--soft-card)] text-[var(--foreground)]"
                          }`}>
                          {isAuctionWinner ? (listingCard.saleType === "auction_buy_now" ? (stripeCheckoutVisible ? "Proceed to Payment" : "Message to arrange") : "Arrange Pickup")
                            : isAuctionSeller ? (listingCard.highestBidder ? "Awaiting Payment" : "View Listing")
                            : "View Listing"}
                        </Link>
                      </div>
                    </div>
                  )}
                  {/* Listing context card — buy now */}
                  {listingCard && !hasPurchaseInChat && !auctionEnded && listingCard?.saleType === "buy_now" && (
                    <div className="mb-2 overflow-hidden rounded-xl border border-[var(--card-border)]/50 bg-[var(--soft-card)]/80">
                      <div className="flex items-center gap-3 p-3">
                        {listingCard.image ? (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--soft-card)]">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-sky-500/20 to-sky-600/10 flex items-center justify-center">
                            <span className="text-sm font-black text-sky-400">SD</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          {listingCard.price && <p className="text-[12px] font-black text-sky-400">${listingCard.price}</p>}
                        </div>
                        <Link href={listingCard?.type === "service" ? "/services" : `/post/listing/${listingCard.id}`}
                          className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-sky-400">
                          View Listing
                        </Link>
                      </div>
                    </div>
                  )}
                  {/* Listing context card — active auction */}
                  {listingCard && !hasPurchaseInChat && !auctionEnded && isAuction && listingCard?.saleType !== "buy_now" && (
                    <div className="mb-3 overflow-hidden rounded-2xl border border-sky-500/10 bg-[var(--soft-card)]">
                      <div className="flex items-center gap-3 p-3">
                        {listingCard.image ? (
                          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--soft-card)] shadow-md">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : (
                          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-600/10 shadow-md flex items-center justify-center">
                            <span className="text-lg font-black text-sky-400">SD</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          <p className="text-[15px] font-black text-sky-400">${listingCard.currentBid || listingCard.price}</p>
                          <span className="text-[11px] font-medium text-sky-400/80">Active auction</span>
                        </div>
                        <Link href={listingCard?.type === "service" ? "/services" : `/post/listing/${listingCard.id}`}
                          className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-sky-400">
                          View Listing
                        </Link>
                      </div>
                    </div>
                  )}
                  {/* Listing context card — other listing type */}
                  {listingCard && !hasPurchaseInChat && !auctionEnded && listingCard?.saleType && listingCard?.saleType !== "buy_now" && !isAuction && (
                    <div className="mb-2 overflow-hidden rounded-xl border border-[var(--card-border)]/50 bg-[var(--soft-card)]/80">
                      <div className="flex items-center gap-3 p-3">
                        {listingCard.image ? (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--soft-card)]">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-sky-500/20 to-sky-600/10 flex items-center justify-center">
                            <span className="text-sm font-black text-sky-400">SD</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          {listingCard.price && <p className="text-[12px] font-black text-sky-400">${listingCard.price}</p>}
                        </div>
                        <Link href={listingCard?.type === "service" ? "/services" : `/post/listing/${listingCard.id}`}
                          className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-sky-400">
                          View Listing
                        </Link>
                      </div>
                    </div>
                  )}
                  {/* Listing context card — fallback */}
                  {listingCard && !hasPurchaseInChat && !auctionEnded && !listingCard?.saleType && !isAuction && (
                    <div className="mb-2 overflow-hidden rounded-xl border border-[var(--card-border)]/50 bg-[var(--soft-card)]/80">
                      <div className="flex items-center gap-3 p-3">
                        {listingCard.image ? (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--soft-card)]">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-sky-500/20 to-sky-600/10 flex items-center justify-center">
                            <span className="text-sm font-black text-sky-400">SD</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          {listingCard.price && <p className="text-[12px] font-black text-[var(--muted)]">${listingCard.price}</p>}
                        </div>
                        <Link href={`/post/listing/${listingCard.id}`}
                          className="shrink-0 rounded-lg bg-[var(--soft-card)] px-3 py-1.5 text-[10px] font-bold text-[var(--foreground)] transition hover:bg-[var(--card-hover)]">
                          View Listing
                        </Link>
                      </div>
                    </div>
                  )}
                  {/* Messages */}
                  {filteredMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <div className="mb-3 text-4xl">ðŸ’¬</div>
                      <h3 className="text-lg font-bold text-[var(--foreground)]">No messages yet</h3>
                      <p className="mt-1 text-[12px] text-[var(--muted)]">Send a message to start the conversation.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredMessages.map((msg: any) => {
                        const isOwn = user?.email === msg.sender;
                        // Offer card
                        if (msg.type === "offer") {
                          const statusColors: Record<string, string> = {
                            pending: "text-sky-400 bg-sky-500/10",
                            accepted: "text-sky-400 bg-sky-500/10",
                            declined: "text-red-400 bg-red-500/10",
                            countered: "text-sky-400 bg-sky-500/10",
                          };
                          const statusColor = statusColors[msg.offerStatus || "pending"] || statusColors.pending;
                          return (
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className={`w-[280px] overflow-hidden rounded-2xl shadow-lg ${statusColor}`}>
                                <div className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[15px]">ðŸ’°</span>
                                      <span className="text-[12px] font-bold text-[var(--foreground)]">Offer</span>
                                    </div>
                                    {/* Status badge */}
                                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                      msg.offerStatus === "accepted" ? "bg-sky-500/20 text-sky-400" :
                                      msg.offerStatus === "declined" ? "bg-red-500/20 text-red-400" :
                                      msg.offerStatus === "countered" ? "bg-sky-500/20 text-sky-400" :
                                      "bg-sky-500/20 text-sky-400"
                                    }`}>
                                      {msg.offerStatus || "pending"}
                                    </span>
                                  </div>
                                  {msg.offerAmount && (
                                    <p className="mt-2 text-xl font-black text-sky-400">${msg.offerAmount}</p>
                                  )}
                                  {msg.listingTitle && (
                                    <p className="mt-1 text-[10px] text-[var(--muted)] truncate">{msg.listingTitle}</p>
                                  )}
                                  <p className="mt-0.5 text-[9px] text-[var(--muted)]">{formatTime(msg.createdAt)}</p>
                                  {/* Action buttons â€” only on received pending offers */}
                                  {!isOwn && msg.offerStatus === "pending" && (
                                    <div className="mt-3 flex gap-1.5">
                                      <button disabled={sendingOffer} onClick={() => sendOffer("accept", msg.offerAmount)} className="flex-1 rounded-lg bg-sky-500 py-2.5 text-[10px] font-bold text-white transition hover:bg-sky-400 disabled:opacity-50">Accept</button>
                                      <button disabled={sendingOffer} onClick={() => sendOffer("decline")} className="flex-1 rounded-lg bg-zinc-700 py-2.5 text-[10px] font-bold text-[var(--foreground)] transition hover:bg-zinc-600 disabled:opacity-50">Decline</button>
                                      <button disabled={sendingOffer} onClick={() => sendOffer("counter", msg.offerAmount)} className="flex-1 rounded-lg bg-sky-500 py-2.5 text-[10px] font-bold text-white transition hover:bg-sky-400 disabled:opacity-50">Counter</button>
                                    </div>
                                  )}
                                  {/* Pay Now for accepted offers — Stripe UI only when checkout visible */}
                                  {stripeCheckoutVisible && !isOwn && msg.offerStatus === "accepted" && !hasPurchaseInChat && (
                                    <div className="mt-3">
                                      <button onClick={() => setPendingPayment({
                                        amount: msg.offerAmount,
                                        listingId: chatListingId || "",
                                        listingTitle: listingCard?.title || "",
                                        listingImage: (listingCard?.images?.[0] || listingCard?.image || listingCard?.imageUrl || ""),
                                        listingPrice: listingCard?.price || "",
                                        sellerEmail: chatUser,
                                        buyerEmail: user?.email || "",
                                      })}
                                        className="w-full rounded-lg bg-sky-500 py-2.5 text-[10px] font-bold text-white transition hover:bg-sky-400">
                                        Pay Now — ${msg.offerAmount}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        // Order/confirmation card
                        if (msg.type === "order") {
                          if (
                            shouldHideSupersededPaidOrderCard(
                              msg,
                              purchaseData,
                              conversationMessagesNewestFirst,
                              chatListingId
                            )
                          ) {
                            return null;
                          }

                          const effectiveOrderStatus = resolveConversationOrderStatus(
                            msg,
                            purchaseData,
                            chatListingId
                          );
                          const isRefundedOrder = effectiveOrderStatus === "refunded";
                          const isSellerViewer = purchaseData?.sellerEmail === user?.email;

                          if (isRefundedOrder) {
                            return (
                              <div key={msg.id} className="flex justify-center">
                                <div className="w-full max-w-md space-y-2">
                                  <RefundStatusCard
                                    role={isSellerViewer ? "seller" : "buyer"}
                                    refundAmount={purchaseData?.refundAmount}
                                    refundedAt={purchaseData?.refundedAt || msg.createdAt}
                                    total={purchaseData?.total ?? Number(msg.listingPrice)}
                                    variant="compact"
                                  />
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() =>
                                        router.push(isSellerViewer ? "/sales" : "/purchases")
                                      }
                                      className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-[10px] font-bold text-violet-300 transition hover:bg-violet-500/15"
                                    >
                                      View Order
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const isWantedListing = listingCard?.type === "wanted" || msg.listingType === "wanted";
                          const getStatusConfig = (status?: string) => {
                            const configs: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
                              paid: { icon: "✅", label: "Payment Confirmed", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              awaiting_seller: { icon: "⏳", label: "Awaiting Seller", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              pickup_arranged: { icon: "📍", label: "Pickup Arranged", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              shipped: { icon: "🚚", label: "Shipped", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              delivered: { icon: "✅", label: "Delivered", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              completed: { icon: "✨", label: "Completed", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              disputed: { icon: "⚠️", label: "Disputed", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
                            };
                            return configs[status || "paid"] || configs.paid;
                          };
                          const statusConfig = isWantedListing ? { icon: "📋", label: "Wanted", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" } : getStatusConfig(effectiveOrderStatus);
                          const isDisputed = !isWantedListing && effectiveOrderStatus === "disputed";
                          const isPaid = !isWantedListing && effectiveOrderStatus === "paid";

                          return (
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className="w-full max-w-md">
                                <div className={`overflow-hidden rounded-2xl bg-[var(--card)] shadow-lg hover:shadow-xl transition-shadow duration-200`}>
                                  {/* Header with status */}
                                  <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg">{statusConfig.icon}</span>
                                      <span className={`text-sm font-bold ${statusConfig.color}`}>{statusConfig.label}</span>
                                    </div>
                                    <div className="text-[10px] text-[var(--muted)]">
                                      {(msg.purchaseId || msg.id).slice(-8).toUpperCase()}
                                    </div>
                                  </div>

                                  {/* Order summary */}
                                  <div className="p-4">
                                    <div className="flex gap-3">
                                      {/* Thumbnail */}
                                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--soft-card)]">
                                        {msg.listingImage ? (
                                          <img src={msg.listingImage} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
                                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                          </div>
                                        )}
                                      </div>
                                      {/* Listing info */}
                                      <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-sm font-bold text-[var(--foreground)]">{msg.listingTitle || "Listing"}</h3>
                                        <div className="mt-1 flex items-baseline gap-2">
                                          <span className="text-sm font-semibold text-[var(--foreground)]">${msg.listingPrice || "—"}</span>
                                          <span className="text-xs text-[var(--muted)]">·</span>
                                          <span className="text-xs text-[var(--muted)]">{formatTime(msg.createdAt)}</span>
                                        </div>
                                        {isPaid && (
                                          <p className="mt-2 text-xs text-sky-400">
                                            Next: Message the seller to arrange pickup or shipping.
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-2 p-4 border-t border-white/[0.04]">
                                    <button
                                      onClick={() =>
                                        router.push(
                                          sellerMessagesUrl(
                                            {
                                              sellerUsername: sellerProfile?.username,
                                              sellerId: sellerProfile?.id,
                                            },
                                            chatListingId
                                          )
                                        )
                                      }
                                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2.5 text-[11px] font-bold text-white transition hover:bg-sky-400"
                                    >
                                      <span>💬</span>
                                      <span>Message Seller</span>
                                    </button>
                                    <button
                                      onClick={() =>
                                        router.push(isSellerViewer ? "/sales" : "/purchases")
                                      }
                                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] transition hover:border-sky-500/20 hover:bg-[var(--card-hover)]"
                                    >
                                      <span>📋</span>
                                      <span>View Order</span>
                                    </button>
                                    <button
                                      onClick={() => router.push(`/post/listing/${chatListingId}`)}
                                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] transition hover:border-sky-500/20 hover:bg-[var(--card-hover)]"
                                    >
                                      <span>🔗</span>
                                      <span>View Listing</span>
                                    </button>
                                    {isDisputed && (
                                      <button
                                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[11px] font-bold text-red-400 transition hover:bg-red-500/20"
                                      >
                                        <span>⚠️</span>
                                        <span>Dispute</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        // Image message
                        if (msg.type === "image") {
                          return (
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                              <div className="max-w-[75%]">
                                <div className={`overflow-hidden rounded-2xl shadow-lg transition-all duration-200 hover:shadow-xl ${isOwn ? "rounded-br-md bg-gradient-to-br from-sky-500 to-sky-600" : "rounded-bl-md bg-[var(--card)]"}`}>
                                  {(msg.imageUrl || msg.imageData) && (
                                    <img src={msg.imageUrl || msg.imageData} alt="Shared image" className="max-h-80 w-full object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                  )}
                                  {msg.text && <div className={`px-4 py-3 text-[14px] ${isOwn ? "text-white" : "text-[var(--foreground)]"}`}><p>{msg.text}</p></div>}
                                  <div className={`flex items-center justify-end gap-1 px-4 pb-3 ${isOwn ? "" : ""}`}>
                                    <span className={`text-[9px] ${isOwn ? "text-white/60" : "text-[var(--muted)]"}`}>{formatFullTime(msg.createdAt) || formatTime(msg.createdAt)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        // File attachment message
                        if (msg.type === "file") {
                          const isPdf = msg.fileName?.toLowerCase().endsWith(".pdf");
                          return (
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className="max-w-[75%]">
                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer"
                                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg transition hover:opacity-80 ${
                                    isOwn ? "rounded-br-md bg-gradient-to-br from-sky-500 to-sky-600 text-white" : "rounded-bl-md bg-[var(--card)] text-[var(--foreground)]"
                                  }`}>
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--soft-card)] text-lg">
                                    {isPdf ? "📄" : "📎"}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-medium text-[var(--foreground)]">{msg.fileName}</p>
                                    <p className="text-[10px] text-[var(--muted)]">
                                      {msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : ""}
                                      {isPdf && " · PDF"}
                                    </p>
                                  </div>
                                  <svg className="h-4 w-4 shrink-0 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </a>
                                <div className="mt-1 flex justify-end px-1">
                                  <span className={`text-[9px] ${isOwn ? "text-white/60" : "text-[var(--muted)]"}`}>{formatFullTime(msg.createdAt) || formatTime(msg.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        // Order event (system message)
                        if (msg.type === "order_event") {
                          return (
                            <div key={msg.id} className="flex justify-center">
                              <div className="w-full max-w-sm rounded-xl bg-sky-500/5 px-4 py-3 my-2">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-sm">📦</span>
                                  <span className="text-[11px] font-bold text-sky-400">Order Event</span>
                                </div>
                                <p className="text-xs text-[var(--foreground)] leading-relaxed">{formatMessageText(msg.text)}</p>
                                {msg.shippingAddress && (
                                  <div className="mt-2 rounded-lg bg-[var(--soft-card)] px-3 py-2 text-[10px] text-[var(--muted)]">
                                    <p>Shipping to:</p>
                                    <p className="text-[var(--foreground)]">
                                      {msg.buyerName && !isEmailLike(msg.buyerName)
                                        ? msg.buyerName.startsWith("@")
                                          ? msg.buyerName
                                          : `@${msg.buyerName}`
                                        : "Buyer"}
                                    </p>
                                    <p className="text-[var(--foreground)]">{msg.shippingAddress}</p>
                                    {msg.buyerPhone && <p className="text-[var(--foreground)]">📞 {msg.buyerPhone}</p>}
                                  </div>
                                )}
                                {msg.deliveryMethod === "pickup" && (
                                  <p className="mt-1 text-[10px] text-[var(--muted)]">📍 Pickup — arrange with seller</p>
                                )}
                                <p className="mt-1 text-[8px] text-[var(--muted)] text-right">{formatTime(msg.createdAt)}</p>
                              </div>
                            </div>
                          );
                        }
                        // Arrange / system starter
                        if (msg.type === "system" && msg.sender === "system") {
                          return (
                            <div key={msg.id} className="flex justify-center">
                              <div className="max-w-[90%] rounded-xl bg-sky-500/5 px-4 py-3 text-left">
                                <p className="whitespace-pre-line text-[13px] leading-relaxed text-[var(--foreground)]">
                                  {formatMessageText(msg.text)}
                                </p>
                                <ArrangePaymentCopyBar text={msg.text || ""} />
                                <p className="mt-1.5 text-center text-[9px] text-[var(--muted)]">
                                  {formatTime(msg.createdAt)}
                                </p>
                              </div>
                            </div>
                          );
                        }
                        // Text message
                        return (
                          <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                            <div className="max-w-[75%]">
                              <div className={`rounded-2xl px-4 py-3 text-[14px] shadow-lg transition-all duration-200 hover:shadow-xl ${isOwn ? "rounded-br-md bg-gradient-to-br from-sky-500 to-sky-600 text-white" : "rounded-bl-md bg-[var(--card)] text-[var(--foreground)]"}`}>
                                {!isOwn && (() => { const check = detectScam(msg.text || ""); return check.isScam ? (
                                  <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[9px] font-bold text-red-400 border border-red-500/20" title={`Flagged: ${check.keywords.join(", ")}`}>&#9888;&#65039; Caution</span>
                                ) : null; })()}
                                {!isOwn && containsRiskyKeywords(msg.text || "") && (
                                  <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-[9px] font-bold text-sky-400 border border-sky-500/20">&#9888;&#65039; Off-platform mention</span>
                                )}
                                <p className="break-words whitespace-pre-line text-[14px] leading-relaxed">{formatMessageText(msg.text)}</p>
                                {/* Status + timestamp */}
                                <div className="mt-2 flex items-center justify-end gap-1">
                                  <span className={`text-[9px] ${isOwn ? "text-white/60" : "text-[var(--muted)]"}`}>{formatTime(msg.createdAt)}</span>
                                  {isOwn && (
                                    <span className="text-[10px]">
                                      {msg.read ? (
                                        <svg className="h-3.5 w-3.5 text-sky-400" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 7.5l-12 12L5 13l1.5-1.5 5 5 10.5-10.5L23.5 7.5zM17.5 7.5l-6 6-1.5-1.5 6-6 1.5 1.5z" /></svg>
                                      ) : (
                                        <svg className="h-3.5 w-3.5 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>
                {/* Safety warning above input */}
                <div className="border-t border-[var(--card-border)] px-5 pt-2.5 pb-0">
                  <StayOnSkyDropNotice paymentType={purchaseData?.paymentType} compact />
                </div>
                {/* Input area */}
                <div className="px-5 py-2.5">
                  {/* Image preview */}
                  {imagePreview && (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-2">
                      <img src={imagePreview} alt="Preview" className="h-12 w-12 rounded-lg object-cover" />
                      <span className="flex-1 text-[11px] text-[var(--muted)] truncate">Image ready to send</span>
                      <button onClick={() => { setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>
                      <button onClick={sendImageMessage} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-sky-400">Send</button>
                    </div>
                  )}
                  {/* File attachment preview */}
                  {fileAttachment && (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-2">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--soft-card)] text-lg">📎</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[11px] font-medium text-[var(--foreground)]">{fileAttachment.name}</p>
                        <p className="text-[9px] text-[var(--muted)]">{(fileAttachment.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={() => { setFileAttachment(null); if (fileAttachInputRef.current) fileAttachInputRef.current.value = ""; }} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>
                      <button onClick={sendFileMessage} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-sky-400">Send</button>
                    </div>
                  )}
                  {!message.trim() && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {quickReplies.map((reply) => (
                        <button
                          key={reply}
                          type="button"
                          disabled={sendingMessage}
                          onClick={() => sendQuickReply(reply)}
                          className="rounded-full border border-[var(--card-border)] bg-[var(--soft-card)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted)] transition hover:border-sky-500/30 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2.5">
                    {/* Image attach button */}
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] transition hover:border-sky-400 hover:text-sky-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>
                    {/* File attach button */}
                    <button onClick={() => fileAttachInputRef.current?.click()}
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] transition hover:border-sky-400 hover:text-sky-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                    <input ref={fileAttachInputRef} type="file" onChange={handleFileSelect} className="hidden" />
                    <input ref={messageInputRef} type="text" placeholder="Type a message..." value={message} maxLength={2000}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
                        typingDebounceRef.current = setTimeout(() => emitTyping(e.target.value.length > 0), 400);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      className="flex-1 rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] px-4 py-3 text-[14px] text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-400" />
                    <button onClick={() => sendMessage()} disabled={sendingMessage || !message.trim()} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-500 text-white transition hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed">
                      {sendingMessage ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
      {stripeCheckoutVisible && pendingPayment && (
        <OfferPaymentModal
          amount={Number(pendingPayment.amount)}
          listingTitle={pendingPayment.listingTitle}
          listingId={pendingPayment.listingId}
          sellerEmail={pendingPayment.sellerEmail}
          buyerEmail={pendingPayment.buyerEmail}
          listingImage={pendingPayment.listingImage}
          listingPrice={pendingPayment.listingPrice}
          purchaseId={`${pendingPayment.listingId}_${pendingPayment.buyerEmail}`}
          onSuccess={() => {
            setPendingPayment(null);
            setHasPurchaseInChat(true);
          }}
          onClose={() => setPendingPayment(null)}
        />
      )}
    </>
  );
}
