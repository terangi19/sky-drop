"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";
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
import { STAY_ON_SKY_DROP_HEADLINE } from "../lib/conversation-safety";
import {
  extractEmailsFromText,
  isEmailLike,
  publicHandleFromProfile,
  sanitizePublicText,
  sellerProfileSlug,
} from "../lib/public-display";
import { resolveSellerBySlug } from "../lib/seller-profile-lookup";
import { getTurnstileSiteKey } from "../lib/turnstile";
import { canSellerConfirmArrangeSale, countSellerSales } from "../lib/arrange-purchase-status";
import { getFreshIdToken } from "../lib/api-auth";
import TurnstileWidget from "../components/TurnstileWidget";
import {
  blockedEmailsFromDocs,
  conversationKey,
  isUnreadMessageForUser,
  messageInActiveConversation,
  messageInInboxList,
} from "../lib/messages-unread";
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
      <Background />
      <Navbar />
      <Suspense fallback={<div className="flex h-full items-center justify-center p-12"><span className="text-[var(--muted)]">Loading...</span></div>}>
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
  // Typing
  const [otherTyping, setOtherTyping] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});
  const [conversationUnread, setConversationUnread] = useState<Record<string, number>>({});
  const [conversationReadTimes, setConversationReadTimes] = useState<Record<string, number>>({});
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
        resolveSellerBySlug(param).then((resolved) => {
          const profileEmail = (resolved?.data as any)?.email || param;
          setChatUser(profileEmail);
        }).catch(() => setChatUser(param));
      }
      setChatListingId(getSearchParam("listing") || null);
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

  // Fetch seller profile + trust score
  useEffect(() => {
    if (!chatUser) { setSellerProfile(null); setSellerTrust(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "profiles"), where("email", "==", chatUser)));
        if (!snap.empty && !cancelled) {
          const data = snap.docs[0].data();
          const purchaseSnap = await getDocs(
            query(collection(db, "purchases"), where("sellerEmail", "==", chatUser))
          );
          const salesTotal = countSellerSales(
            purchaseSnap.docs.map((d) => d.data() as { status?: string; paymentType?: string })
          );
          setSellerProfile({
            id: snap.docs[0].id,
            ...data,
            sales: salesTotal,
          });
          const trust = calculateTrustScore(data as any);
          setSellerTrust({ score: trust.score, level: trust.score >= 80 ? "Trusted" : trust.score >= 50 ? "Established" : "New" });
        } else if (!cancelled) {
          const resolved = await resolveSellerBySlug(chatUser);
          if (resolved && !cancelled) {
            const data = resolved.data as any;
            const profileEmail = data.email || chatUser;
            const purchaseSnap = await getDocs(
              query(collection(db, "purchases"), where("sellerEmail", "==", profileEmail))
            );
            const salesTotal = countSellerSales(
              purchaseSnap.docs.map((d) => d.data() as { status?: string; paymentType?: string })
            );
            setSellerProfile({
              id: resolved.uid,
              ...data,
              sales: salesTotal,
            });
            const trust = calculateTrustScore(data as any);
            setSellerTrust({ score: trust.score, level: trust.score >= 80 ? "Trusted" : trust.score >= 50 ? "Established" : "New" });
          } else {
            setSellerProfile(null);
          }
        }
      } catch (e) { console.error("Failed to fetch seller profile:", e); }
    })();
    return () => { cancelled = true; };
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
  // Real-time listing data listener
  useEffect(() => {
    if (!chatListingId) {
      setListingCard(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "listings", chatListingId), (snap) => {
      if (snap.exists()) {
        setListingCard({ id: snap.id, ...snap.data() });
      }
    }, (err) => {
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
    return () => unsub();
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
    
    console.log("[messages] Conversation opened", { chatUser, chatListingId });
    
    // Clear seen batch when conversation changes to allow re-marking
    seenBatchRef.current.clear();
    
    let cancelled = false;
    const relevant = messages.filter((m: any) =>
      messageInActiveConversation(m, user.email!, chatUser, chatListingId)
    );
    const unreadMsgs = relevant.filter((m: any) => m.sender !== user.email && !m.read);
    
    console.log("[messages] Unread messages to mark", unreadMsgs.length);
    
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
            console.log("[messages] Marked messages read successfully", messageIds.length);
            const result = await res.json();
            console.log("[messages] Marked count:", result.marked);
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
  // Fetch usernames
  async function fetchUsername(identifier: string) {
    if (!identifier || identifier === "system" || usernames[identifier]) return;
    try {
      const snap = await getDocs(query(collection(db, "profiles"), where("email", "==", identifier)));
      let handle = "User";
      if (!snap.empty) {
        handle = publicHandleFromProfile(snap.docs[0].data() as { username?: string }, "User");
      } else {
        const resolved = await resolveSellerBySlug(identifier);
        if (resolved) {
          const profileEmail = (resolved.data as any)?.email || identifier;
          if (usernames[profileEmail]) {
            handle = usernames[profileEmail];
          } else {
            handle = publicHandleFromProfile(resolved.data as { username?: string }, "User");
            setUsernames((prev) => ({ ...prev, [profileEmail]: handle }));
          }
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
      items.forEach((msg: any) => {
        fetchUsername(msg.sender);
        fetchUsername(msg.receiver);
        msg.participants?.forEach((p: string) => fetchUsername(p));
        extractEmailsFromText(msg.text || "").forEach((e) => fetchUsername(e));
      });
    }, (err) => { console.error("Messages snapshot error:", err); if (mounted) setLoading(false); });

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
    console.log("[messages] Unread map calculated", { totalUnread: Object.values(map).reduce((a, b) => a + b, 0), conversations: Object.keys(map).length });
    setConversationUnread(map);
    setUnreadMap(raw);
  }, [messages, user?.email, blockedUsers]);

  // Compute filteredMessages for chat view
  const filteredMessages = useMemo(
    () =>
      messages
        .filter((msg: any) =>
          messageInActiveConversation(msg, user?.email || "", chatUser, chatListingId)
        )
        .reverse(),
    [messages, chatUser, chatListingId, user?.email]
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

  function checkMessageRateLimit(): boolean {
    try {
      const msgTracker = JSON.parse(localStorage.getItem("msgTracker") || "{}");
      const now = Date.now();
      if (msgTracker[chatUser] && now - msgTracker[chatUser] < 5000) {
        showToast("Please wait before messaging this user again", "info");
        return false;
      }
      msgTracker[chatUser] = now;
      for (const key of Object.keys(msgTracker)) {
        if (now - msgTracker[key] > 3600000) delete msgTracker[key];
      }
      localStorage.setItem("msgTracker", JSON.stringify(msgTracker));
    } catch (e) { console.error("Msg tracker error:", e); }
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

  // Send text message
  async function sendMessage(skipSafety = false) {
    if (!message.trim()) return;
    if (!user?.email) { showToast("Please log in first", "info"); return; }
    if (!chatUser.trim()) { showToast("Select a conversation", "info"); return; }
    if (blockedUsers.includes(chatUser)) { showToast("This user is blocked", "error"); return; }
    if (message.length > MAX_MESSAGE_LENGTH) {
      showToast(`Message is too long. Max ${MAX_MESSAGE_LENGTH} characters.`, "error");
      return;
    }

    if (!checkMessageRateLimit()) return;

    if (!skipSafety) {
      const result = detectScam(message);
      if (result.isScam && !pendingMessage) { setPendingMessage(message); setScamWarning(true); return; }
      const kw = containsRiskyKeywords(message);
      if (kw) { setRiskyKeyword(kw); setShowSafetyWarning(true); return; }
    }
    if (getTurnstileSiteKey() && !turnstileToken) {
      showToast("Complete the security check to send messages.", "error");
      return;
    }

    const activeListingTitle = listingCard?.title || null;
    const activeListingImage = listingCard?.images?.[0] || listingCard?.image || listingCard?.imageUrl || null;
    const activeListingPrice = listingCard?.price || null;
    try {
      // Optimistic update - show message instantly
      const tempId = "temp_" + Date.now();
      const optimisticMsg = {
        id: tempId,
        text: message,
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
          text: message, receiver: chatUser,
          listingId: chatListingId || undefined, listingTitle: activeListingTitle || undefined,
          listingImage: activeListingImage || undefined, listingPrice: activeListingPrice || undefined,
        }),
      });
      createNotification({
        targetEmail: chatUser,
        fromEmail: user.email,
        type: "message",
        title: "New message from " + notificationSenderLabel(),
        message: message.length > 100 ? message.slice(0, 100) + "..." : message,
        listingId: chatListingId || undefined,
        listingTitle: activeListingTitle || undefined,
        listingImage: activeListingImage || undefined,
      });
      await emitTyping(false);
      // Reset turnstile token after each send to prevent replay
      setTurnstileToken("");
    } catch (e) { console.error(e); showToast("Failed to send", "error"); }
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
    try {
      const archived = JSON.parse(localStorage.getItem("archivedConversations") || "[]");
      if (!archived.includes(chatUser)) {
        archived.push(chatUser);
        localStorage.setItem("archivedConversations", JSON.stringify(archived));
      }
      const dismissed = JSON.parse(localStorage.getItem("dismissedNotifications") || "[]");
      const relevant = messages.filter((m: any) =>
        messageInActiveConversation(m, user.email, chatUser, chatListingId)
      );
      for (const msg of relevant) {
        if (!dismissed.includes(msg.id)) dismissed.push(msg.id);
      }
      localStorage.setItem("dismissedNotifications", JSON.stringify(dismissed));
      const messageIds = relevant.map((m: any) => m.id);
      const token = await user.getIdToken();
      fetch("/api/mark-messages-read", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageIds }),
      }).catch((e) => console.error("Failed to mark archived messages read:", e));
    } catch {}
    setShowMenu(false); setChatUser(""); setChatListingId(null);
  }
  async function executeClearAllMessages() {
    if (!user?.email) return;
    setClearAllConfirm(false);
    const ids = [...new Set(messages.map((m: any) => m.id))];
    const token = await user.getIdToken();
    const res = await fetch("/api/delete-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messageIds: ids }),
    });
    const data = await res.json().catch(() => ({}));
    const marked = data.marked || 0;
    const failed = data.failed || 0;
    setChatUser("");
    setChatListingId(null);
    if (failed === 0) showToast("All messages cleared", "info");
    else showToast(`Cleared ${ids.length - failed} messages (${failed} failed)`, failed === ids.length ? "error" : "info");
  }
  // Feature 3: Offer system with status
  async function sendOffer(type: string, amount?: string) {
    if (!user?.email || !chatUser || sendingOffer) return;
    setSendingOffer(true);
    try {
      const sendToken = await user.getIdToken();
      const msgRes = await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sendToken}` },
        body: JSON.stringify({
          type: "offer", receiver: chatUser,
          offerType: type,
          offerAmount: amount || null,
          offerStatus: type === "make" ? "pending" : type === "accept" ? "accepted" : type === "decline" ? "declined" : "countered",
          text: type === "make" ? `Offer: $${amount || "?"}` : type === "accept" ? "Offer accepted" : type === "decline" ? "Offer declined" : "Counter offer",
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
  let conversations = Array.from(conversationMap.entries());
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
  const isOwnListing = listingCard?.sellerEmail === user?.email;
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
    if (!chatUser || !user?.email) { setHasPurchaseInChat(false); return; }
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "purchases"), where("listingId", "==", chatListingId || "")));
        const matched = snap.docs.find((d) => {
          const data = d.data();
          return (data.sellerEmail === user.email && data.buyerEmail === chatUser) || (data.buyerEmail === user.email && data.sellerEmail === chatUser);
        });
        if (matched && mounted) { setHasPurchaseInChat(true); setPurchaseData({ id: matched.id, ...matched.data() }); }
        else if (mounted) { setHasPurchaseInChat(false); setPurchaseData(null); }
      } catch { if (mounted) { setHasPurchaseInChat(false); setPurchaseData(null); } }
    })();
    return () => { mounted = false; };
  }, [chatUser, chatListingId, user?.email]);
  // â€”â€” Render â€”â€”
  return (
    <>
      {/* Block User Confirmation Modal */}
      {blockConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setBlockConfirmTarget(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-red-400">Block User</h3>
            <p className="mt-2 text-sm text-[var(--foreground)]">Block {getDisplayName(blockConfirmTarget)}? They won&apos;t be able to message you, and their messages will be hidden.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setBlockConfirmTarget(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={() => { blockUser(blockConfirmTarget); setBlockConfirmTarget(null); }} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Block</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Messages Confirmation Modal */}
      {clearAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setClearAllConfirm(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-red-400">Clear All Messages</h3>
            <p className="mt-2 text-sm text-[var(--foreground)]">Delete all your messages? This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setClearAllConfirm(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={executeClearAllMessages} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Delete All</button>
            </div>
          </div>
        </div>
      )}

      {/* Scam Warning Modal */}
      {scamWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setScamWarning(false); setPendingMessage(""); }}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[var(--foreground)]">&#9888;&#65039; Safety Warning</h3>
              <button onClick={() => { setScamWarning(false); setPendingMessage(""); }} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]">
              Your message contains words associated with suspicious activity. {STAY_ON_SKY_DROP_HEADLINE} so we can review disputes and reports — we cannot see SMS, email, or other apps.
            </p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setScamWarning(false); setPendingMessage(""); }} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Edit Message</button>
              <button onClick={sendPendingMessage} className="flex flex-1 items-center justify-center rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">Send Anyway</button>
            </div>
          </div>
        </div>
      )}
      {/* Risky keyword warning */}
      {showSafetyWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowSafetyWarning(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-sky-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-sky-400">&#9888;&#65039; Payment Safety</h3>
              <button onClick={() => setShowSafetyWarning(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]">
              Your message mentions &ldquo;{riskyKeyword}&rdquo; — often used to move deals off Sky Drop. {STAY_ON_SKY_DROP_HEADLINE}: Stripe disputes need your chat history here (Purchases → Open dispute within 7 days). Off-platform chats cannot be reviewed.
            </p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setShowSafetyWarning(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Edit Message</button>
              <button onClick={() => { setShowSafetyWarning(false); sendMessage(true); }} className="flex flex-1 items-center justify-center rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">Send Anyway</button>
            </div>
          </div>
        </div>
      )}
      <section className={`${PAGE_SHELL_CHAT} py-6 sm:py-8`}>
        <div
          className={`flex w-full overflow-hidden rounded-[40px] border border-[var(--card-border)] bg-[var(--card)] shadow-2xl backdrop-blur-xl ${
            !isMobile || mobileView === "list"
              ? "h-[calc(100dvh-17rem)] sm:h-[calc(100dvh-18rem)]"
              : "h-[calc(100dvh-10rem)]"
          }`}
        >
          {/* SIDEBAR */}
          <div className={`flex w-[340px] flex-col border-r border-[var(--card-border)] ${isMobile && mobileView === "chat" ? "hidden" : "flex"} ${isMobile ? "w-full" : ""}`}>
            <div className="border-b border-[var(--card-border)] p-5">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl font-black text-sky-400">Inbox</h1>
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
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {loading ? (
                <div className="p-6 text-center text-[13px] text-[var(--muted)]">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04]">
                    <svg className="h-5 w-5 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <p className="mt-4 text-[13px] font-medium text-[var(--foreground)]">No conversations yet</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">Messages about listings will appear here.</p>
                  <Link href="/" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
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
                        console.log("[messages] Conversation clicked", { participant: convo.participant, listingId: convo.listingId });
                        setChatUser(convo.participant); 
                        setChatListingId(convo.listingId); 
                        if (isMobile) setMobileView("chat"); 
                      }}
                      className={`flex w-full items-start gap-3 border-b border-[var(--card-border)] px-4 py-3.5 text-left transition-all duration-200 hover:bg-sky-500/5 ${chatUser === convo.participant && chatListingId === convo.listingId ? "bg-sky-500/10" : ""}`}>
                      {/* Thumbnail */}
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 ring-2 ring-white/[0.04]">
                        {convo.msg.listingImage ? (
                          <img src={convo.msg.listingImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm font-bold text-sky-400">
                            {getDisplayName(convo.participant)?.[0]?.toUpperCase?.() || "?"}
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
                          {hasOffer && <span className="ml-1 shrink-0 text-[10px]">💰</span>}
                        </div>
                        <p className={`mt-1 truncate text-[12px] leading-relaxed ${unreadCount > 0 ? "font-medium text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                          {convo.msg.text
                            ? formatMessageText(convo.msg.text)
                            : convo.msg.type === "image"
                              ? "📷 Photo"
                              : convo.msg.type === "file"
                                ? `📎 ${convo.msg.fileName || "File"}`
                                : convo.msg.type === "offer"
                                  ? `💰 Offer: $${convo.msg.offerAmount || ""}`
                                  : convo.msg.type === "purchase"
                                    ? "🛒 Purchase request"
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
                  <button onClick={() => setMobileView("list")} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-white/[0.05] hover:text-[var(--foreground)]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
                        <div ref={profilePreviewRef} className="absolute left-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
                          onClick={(e) => e.stopPropagation()}>
                          <div className="relative h-16 bg-gradient-to-r from-sky-500/20 via-sky-500/10 to-purple-500/20">
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-sky-500/10 text-[16px] font-bold text-sky-400 ring-4 ring-zinc-950/95">
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
                    <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl p-1.5">
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
                        Archive conversation
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
                  {hasPurchaseInChat && (
                    <StayOnSkyDropNotice paymentType={purchaseData?.paymentType} />
                  )}
                  {listingCard && hasPurchaseInChat && (
                    <div className="mb-2 overflow-hidden rounded-xl border border-[var(--card-border)]/50 bg-zinc-900/60">
                      <div className="flex items-center gap-3 p-3">
                        {listingCard.image && (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                            <img src={listingCard.image} alt="" className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          <p className="text-[12px] font-black text-sky-400">${purchaseData?.total || listingCard.price}</p>
                          {(purchaseData?.tracking || purchaseData?.trackingNumber) &&
                            ["shipped", "delivered"].includes(purchaseData?.status) && (
                            <p className="mt-1 text-[10px] text-sky-400/90">
                              Tracking: {purchaseData.tracking || purchaseData.trackingNumber}
                            </p>
                          )}
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
                                : purchaseData?.status === "pending" ? "Awaiting seller confirmation" :
                               purchaseData?.status === "seller_confirming" ? "Confirmed" :
                               purchaseData?.status === "shipped" ? "Shipped" :
                               purchaseData?.status === "delivered" ? "Delivered" :
                               purchaseData?.status === "completed" ? "Completed" :
                               purchaseData?.status === "cancelled" ? "Cancelled" :
                               "Purchased"}
                            </span>
                            {purchaseData?.disputeStatus && (
                              <span className="text-[10px] font-bold text-red-400">
                                {purchaseData.disputeStatus === "refunded" ? "✅ Refunded" : "⚠️ Disputed"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          {purchaseData?.sellerEmail === user?.email &&
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
                          <Link href={`/purchases`}
                            className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white text-center transition hover:bg-sky-400">
                            View Order
                          </Link>
                          {purchaseData?.buyerEmail === user?.email && !purchaseData?.disputeStatus && (
                            <button onClick={() => router.push("/purchases")}
                              className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold text-red-400 transition hover:bg-red-500/20">
                              ⚠️ Dispute
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Listing context card — auction ended */}
                  {listingCard && !hasPurchaseInChat && auctionEnded && (
                    <div className={`mb-3 overflow-hidden rounded-2xl border ${
                      isAuctionWinner ? "border-sky-500/30 bg-sky-500/5" : "border-sky-500/10 bg-zinc-900/60"
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
                        {listingCard.image && (
                          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-800 shadow-md">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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
                                ? listingCard.highestBidder ? "bg-sky-500 text-black" : "bg-zinc-700 text-[var(--foreground)]"
                                : "bg-zinc-700 text-[var(--foreground)]"
                          }`}>
                          {isAuctionWinner ? (listingCard.saleType === "auction_buy_now" ? "Proceed to Payment" : "Arrange Pickup")
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
                        {listingCard.image && (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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
                    <div className="mb-3 overflow-hidden rounded-2xl border border-sky-500/10 bg-zinc-900/60">
                      <div className="flex items-center gap-3 p-3">
                        {listingCard.image && (
                          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-800 shadow-md">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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
                        {listingCard.image && (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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
                        {listingCard.image && (
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                            <img src={listingCard.image} alt={listingCard.title || ""} className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          {listingCard.price && <p className="text-[12px] font-black text-[var(--muted)]">${listingCard.price}</p>}
                        </div>
                        <Link href={listingCard?.type === "service" ? "/services" : `/post/listing/${listingCard.id}`}
                          className="shrink-0 rounded-lg bg-zinc-700 px-3 py-1.5 text-[10px] font-bold text-[var(--foreground)] transition hover:bg-zinc-600">
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
                            pending: "text-sky-400 border-sky-500/20 bg-sky-500/10",
                            accepted: "text-sky-400 border-sky-500/20 bg-sky-500/10",
                            declined: "text-red-400 border-red-500/20 bg-red-500/10",
                            countered: "text-sky-400 border-sky-500/20 bg-sky-500/10",
                          };
                          const statusColor = statusColors[msg.offerStatus || "pending"] || statusColors.pending;
                          return (
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className={`w-[280px] overflow-hidden rounded-2xl border ${statusColor}`}>
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
                                  {/* Pay Now for accepted offers */}
                                  {!isOwn && msg.offerStatus === "accepted" && !hasPurchaseInChat && (
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
                          const isWantedListing = msg.listingType === "wanted";
                          const getStatusConfig = (status?: string) => {
                            const configs: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
                              paid: { icon: "💳", label: "Payment Confirmed", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              awaiting_seller: { icon: "⏳", label: "Awaiting Seller", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
                              pickup_arranged: { icon: "📍", label: "Pickup Arranged", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              shipped: { icon: "🚚", label: "Shipped", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                              delivered: { icon: "✅", label: "Delivered", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
                              completed: { icon: "✨", label: "Completed", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
                              disputed: { icon: "⚠️", label: "Disputed", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
                            };
                            return configs[status || "paid"] || configs.paid;
                          };
                          const statusConfig = isWantedListing ? { icon: "📋", label: "Wanted", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" } : getStatusConfig(msg.orderStatus);
                          const isCompleted = !isWantedListing && (msg.orderStatus === "completed" || msg.orderStatus === "delivered");
                          const isDisputed = !isWantedListing && msg.orderStatus === "disputed";

                          return (
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className="w-full max-w-md">
                                <div className={`overflow-hidden rounded-2xl border ${statusConfig.border} bg-[var(--card)] shadow-lg hover:shadow-xl transition-shadow duration-200`}>
                                  {/* Header */}
                                  <div className="flex items-start gap-3 p-4 border-b border-white/[0.04]">
                                    {/* Thumbnail */}
                                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-800/50 border border-white/[0.06]">
                                      {msg.listingImage ? (
                                        <img src={msg.listingImage} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-zinc-600">
                                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                        </div>
                                      )}
                                    </div>
                                    {/* Title, Price, Seller */}
                                    <div className="min-w-0 flex-1">
                                      <h3 className="truncate text-sm font-bold text-[var(--foreground)]">{msg.listingTitle || "Listing"}</h3>
                                      <div className="mt-1 flex items-center gap-2">
                                        <span className="text-lg font-black text-sky-400">${msg.listingPrice || "—"}</span>
                                        <span className="text-xs text-[var(--muted)]">·</span>
                                        <span className="text-xs text-[var(--muted)]">{chatUser}</span>
                                      </div>
                                      <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                                        <span>ID: {(msg.purchaseId || msg.id).slice(-8).toUpperCase()}</span>
                                        <span>·</span>
                                        <span>{formatTime(msg.createdAt)}</span>
                                      </div>
                                    </div>
                                    {/* Status Pill */}
                                    <div className={`shrink-0 rounded-full border ${statusConfig.border} ${statusConfig.bg} px-3 py-1.5`}>
                                      <div className="flex items-center gap-1.5">
                                        <span>{statusConfig.icon}</span>
                                        <span className={`text-[11px] font-bold uppercase tracking-wide ${statusConfig.color}`}>
                                          {statusConfig.label}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Content: Progress Tracker OR Success State */}
                                  {isWantedListing ? (
                                    <div className="px-4 py-3 bg-[var(--card)] border-b border-[var(--border)]">
                                      <div className="flex items-center gap-2">
                                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${statusConfig.bg}`}>
                                          <span className="text-lg">{statusConfig.icon}</span>
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium text-[var(--foreground)]">Wanted Listing</p>
                                          <p className="text-[10px] text-[var(--muted)]">Sellers can message you about this request</p>
                                        </div>
                                      </div>
                                    </div>
                                  ) : isCompleted ? (
                                    // Success State for completed orders
                                    <div className="px-4 py-4 bg-emerald-500/5 border-b border-emerald-500/10">
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
                                          <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                        </div>
                                        <div>
                                          <p className="text-sm font-bold text-emerald-400">Order Completed</p>
                                          <p className="text-[11px] text-emerald-400/80">Your purchase has been successfully delivered.</p>
                                        </div>
                                      </div>
                                      <div className="mt-3 flex items-center gap-4 text-[10px] text-[var(--muted)]">
                                        <span>Delivered: {formatTime(msg.createdAt)}</span>
                                        <span>Seller: {chatUser}</span>
                                      </div>
                                    </div>
                                  ) : isDisputed ? (
                                    // Dispute State
                                    <div className="px-4 py-3 bg-red-500/5 border-b border-red-500/10">
                                      <div className="flex items-center gap-2">
                                        <span className="text-lg">⚠️</span>
                                        <p className="text-xs font-medium text-red-400">This order is under dispute review</p>
                                      </div>
                                    </div>
                                  ) : (
                                    // Simple Status for in-progress orders
                                    <div className="px-4 py-3 bg-[var(--card)] border-b border-[var(--border)]">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${statusConfig.bg}`}>
                                            <span className="text-lg">{statusConfig.icon}</span>
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-[var(--foreground)]">{statusConfig.label}</p>
                                            <p className="text-[10px] text-[var(--muted)]">Updated {formatTime(msg.createdAt)}</p>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Actions */}
                                  <div className="flex items-center gap-2 p-3">
                                    <button
                                      onClick={() => router.push(`/messages?user=${encodeURIComponent(chatUser)}&listing=${chatListingId}`)}
                                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/20"
                                    >
                                      <span>💬</span>
                                      <span>Message Seller</span>
                                    </button>
                                    <button
                                      onClick={() => router.push(`/post/listing/${chatListingId}`)}
                                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)] transition hover:border-sky-500/20 hover:bg-[var(--card-hover)]"
                                    >
                                      <span>🔗</span>
                                      <span>View Listing</span>
                                    </button>
                                    {isCompleted ? (
                                      <button
                                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-400 transition hover:bg-amber-500/20"
                                      >
                                        <span>⭐</span>
                                        <span>Review</span>
                                      </button>
                                    ) : (
                                      <button
                                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-400 transition hover:bg-red-500/20"
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
                                <div className={`overflow-hidden rounded-2xl shadow-xl transition-all duration-200 hover:shadow-2xl ${isOwn ? "rounded-br-md border border-sky-500/20" : "rounded-bl-md border border-zinc-700/30"}`}>
                                  {(msg.imageUrl || msg.imageData) && (
                                    <img src={msg.imageUrl || msg.imageData} alt="Shared image" className="max-h-80 w-full object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                  )}
                                  {msg.text && <div className={`px-4 py-3 text-[14px] ${isOwn ? "bg-gradient-to-br from-sky-500/20 to-sky-600/15" : "bg-gradient-to-br from-zinc-800/80 to-zinc-900/60"}`}><p>{msg.text}</p></div>}
                                  <div className={`flex items-center justify-end gap-1 px-4 pb-3 ${isOwn ? "bg-gradient-to-br from-sky-500/20 to-sky-600/15" : "bg-gradient-to-br from-zinc-800/80 to-zinc-900/60"}`}>
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
                                    isOwn ? "rounded-br-md bg-sky-500/15" : "rounded-bl-md bg-zinc-800/60"
                                  }`}>
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg">
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
                              <div className="w-full max-w-sm rounded-xl border border-sky-500/10 bg-sky-500/5 px-4 py-3 my-2">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-sm">📦</span>
                                  <span className="text-[11px] font-bold text-sky-400">Order Event</span>
                                </div>
                                <p className="text-xs text-[var(--foreground)] leading-relaxed">{formatMessageText(msg.text)}</p>
                                {msg.shippingAddress && (
                                  <div className="mt-2 rounded-lg bg-zinc-800/30 px-3 py-2 text-[10px] text-[var(--muted)]">
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
                              <div className="max-w-[90%] rounded-xl border border-sky-500/15 bg-sky-500/5 px-4 py-3 text-left">
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
                              <div className={`rounded-2xl px-4 py-3 text-[14px] shadow-lg transition-all duration-200 hover:shadow-xl ${isOwn ? "rounded-br-md bg-gradient-to-br from-sky-500/20 to-sky-600/15 text-[var(--foreground)] border border-sky-500/20" : "rounded-bl-md bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 text-[var(--foreground)] border border-zinc-700/30"}`}>
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
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-lg">📎</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[11px] font-medium text-[var(--foreground)]">{fileAttachment.name}</p>
                        <p className="text-[9px] text-[var(--muted)]">{(fileAttachment.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={() => { setFileAttachment(null); if (fileAttachInputRef.current) fileAttachInputRef.current.value = ""; }} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>
                      <button onClick={sendFileMessage} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-sky-400">Send</button>
                    </div>
                  )}
                  {/* Offer input */}
                  {showOfferInput && (
                    <div className="mb-2 flex items-center gap-2">
                      <input type="number" placeholder="Offer amount..." value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)}
                        className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] px-4 py-2 text-[13px] text-[var(--foreground)] outline-none transition focus:border-sky-400" />
                      <button onClick={() => { sendOffer("make", offerAmount); setShowOfferInput(false); setOfferAmount(""); }} className="rounded-xl bg-sky-500 px-4 py-2 text-[11px] font-bold text-white hover:bg-sky-400">Send Offer</button>
                      <button onClick={() => setShowOfferInput(false)} className="rounded-xl bg-zinc-700 px-4 py-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-zinc-600">Cancel</button>
                    </div>
                  )}
                  <TurnstileWidget
                    onToken={(token) => setTurnstileToken(token)}
                    onExpire={() => setTurnstileToken("")}
                    className="mb-2 scale-[0.7] origin-left"
                  />
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
                    {/* Offer button */}
                    {(chatListingId || getSearchParam("listing")) && user?.email !== chatUser && (
                      <button onClick={() => setShowOfferInput((prev) => !prev)}
                        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border transition ${
                          showOfferInput
                            ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                            : "border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] hover:border-sky-400 hover:text-sky-400"
                        }`}>
                        <span className="text-lg font-black">$</span>
                      </button>
                    )}
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
                    <button onClick={() => sendMessage()} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-500 text-white transition hover:bg-sky-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
      {pendingPayment && (
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
