"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { MOBILE_FAB_CLEARANCE, PAGE_SHELL_CHAT } from "../lib/page-layout";
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
import dynamic from "next/dynamic";
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
import EmptyState from "../components/EmptyState";
import { STAY_ON_SKY_DROP_HEADLINE, V1_ARRANGE_SAFETY_ONE_LINER } from "../lib/conversation-safety";
import { extractEmailsFromText,
  isEmailLike,
  publicHandleFromProfile,
  sanitizePublicText,
  sellerProfileSlug,
} from "../lib/public-display";
import { fetchPublicProfileBySlug } from "../lib/fetch-public-profile-client";
import { canSellerConfirmArrangeSale, countSellerSales } from "../lib/arrange-purchase-status";
import { purchaseStatusLabel } from "../lib/purchase-status";
import { getFreshIdToken } from "../lib/api-auth";
import { trackFunnelEvent } from "../lib/funnel-events";
import { isStripeCheckoutVisibleClient } from "../lib/stripe-checkout-flags";

const OfferPaymentModal = dynamic(() => import("../components/OfferPaymentModal"), { ssr: false });
const NegotiationAssistant = dynamic(() => import("../components/NegotiationAssistant"), { ssr: false });
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

/** Start-of-thread chips only — normal text messages, never Offers. */
const BUYER_START_QUICK_REPLIES = [
  "Is this still available?",
  "When can I pick it up?",
  "Whereabouts are you?",
];
const SELLER_START_QUICK_REPLIES = [
  "Yes, still available.",
  "Pickup works — when suits you?",
  "Happy to meet somewhere public.",
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
/** Same-sender consecutive bubbles within 3 minutes group together. */
function isGroupedWithNeighbor(
  a: { sender?: string; type?: string; createdAt?: { seconds?: number } } | null | undefined,
  b: { sender?: string; type?: string; createdAt?: { seconds?: number } } | null | undefined
): boolean {
  if (!a || !b) return false;
  const special = (t?: string) =>
    t === "offer" || t === "order" || t === "order_event" || t === "system" || t === "purchase";
  if (special(a.type) || special(b.type)) return false;
  if (!a.sender || a.sender !== b.sender) return false;
  const ta = a.createdAt?.seconds || 0;
  const tb = b.createdAt?.seconds || 0;
  return Math.abs(ta - tb) < 180;
}
function bubbleRadius(isOwn: boolean, groupStart: boolean, groupEnd: boolean): string {
  if (isOwn) {
    if (groupStart && groupEnd) return "rounded-2xl rounded-br-md";
    if (groupStart) return "rounded-2xl rounded-br-sm";
    if (groupEnd) return "rounded-2xl rounded-tr-sm rounded-br-md";
    return "rounded-2xl rounded-r-sm";
  }
  if (groupStart && groupEnd) return "rounded-2xl rounded-bl-md";
  if (groupStart) return "rounded-2xl rounded-bl-sm";
  if (groupEnd) return "rounded-2xl rounded-tl-sm rounded-bl-md";
  return "rounded-2xl rounded-l-sm";
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
  const [loadError, setLoadError] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
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
  const markReadConversationKeyRef = useRef<string>("");
  const notificationsMarkedForConvRef = useRef<string>("");
  const blockedUsersRef = useRef<string[]>([]);
  const usernamesRef = useRef<Record<string, string>>({});
  const rawMessagesRef = useRef<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Keyboard-avoiding: lift composer when mobile keyboard opens
  useEffect(() => {
    if (typeof window === "undefined" || !("visualViewport" in window)) return;
    const vv = window.visualViewport!;
    const sync = () => {
      if (window.innerWidth >= 768) {
        setComposerPad(0);
        return;
      }
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setComposerPad(overlap > 40 ? overlap : 0);
      if (overlap > 40) {
        composerBarRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
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
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [showSafetyWarning, setShowSafetyWarning] = useState(false);
  const [riskyKeyword, setRiskyKeyword] = useState<string | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);
  const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<boolean | null>(null);
  const lastTypingWriteAtRef = useRef(0);
  const sendInFlightRef = useRef(false);
  const avatarsRef = useRef<Record<string, string>>({});
  const lastMessageTime = useRef(0);
  const composerBarRef = useRef<HTMLDivElement>(null);
  const [composerPad, setComposerPad] = useState(0);
  // —— Effects ——
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
    avatarsRef.current = avatars;
  }, [avatars]);
  // Cleanup typing debounce / emit false on unmount or conversation switch
  useEffect(() => {
    return () => {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      lastTypingSentRef.current = null;
    };
  }, [chatUser, chatListingId]);
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
          if (isMobile || (typeof window !== "undefined" && window.innerWidth < 768)) {
            setMobileView("chat");
          }
        }
      }).catch(() => {});
      return;
    }
    const param = getSearchParam("user");
    if (param) {
      if (isEmailLike(param)) {
        setChatUser(param);
      } else {
        const listingParam = getSearchParam("listing");
        fetchPublicProfileBySlug(param)
          .then(async (profile) => {
            if (profile?.email) {
              setChatUser(profile.email);
              return;
            }
            if (listingParam) {
              try {
                const snap = await getDoc(doc(db, "listings", listingParam));
                const listingEmail = String(snap.data()?.sellerEmail || "").trim();
                if (listingEmail.includes("@")) {
                  setChatUser(listingEmail);
                  return;
                }
              } catch {
                /* fall through */
              }
            }
            setChatUser(param);
          })
          .catch(() => setChatUser(param));
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
      if (isMobile || (typeof window !== "undefined" && window.innerWidth < 768)) {
        setMobileView("chat");
      }
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
    blockedUsersRef.current = blockedUsers;
  }, [blockedUsers]);
  useEffect(() => {
    usernamesRef.current = usernames;
  }, [usernames]);

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

  // Fetch seller profile + trust score (prefer profile.salesCount aggregate)
  useEffect(() => {
    if (!chatUser) { setSellerProfile(null); setSellerTrust(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchPublicProfileBySlug(chatUser);
        if (profile && !cancelled) {
          const profileEmail = profile.email || chatUser;
          const trustedSales =
            typeof profile.salesCount === "number" && profile.salesCount >= 0
              ? profile.salesCount
              : null;
          let salesTotal = trustedSales ?? 0;
          // Only scan purchases when aggregate is missing
          if (trustedSales === null) {
            const purchaseSnap = await getDocs(
              query(collection(db, "purchases"), where("sellerEmail", "==", profileEmail), limit(100))
            );
            salesTotal = countSellerSales(
              purchaseSnap.docs.map((d) => d.data() as { status?: string; paymentType?: string })
            );
          }
          setSellerProfile({
            id: profile.uid,
            ...profile,
            sales: salesTotal,
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
    // intentionally omit messages — avoid re-getDoc on every inbox snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatListingId]);
  // Typing listener — peer writes to peerEmail_myEmail_listingId
  useEffect(() => {
    if (!chatUser || !user?.email) { setOtherTyping(false); return; }
    const typingRef = doc(db, "typing", `${chatUser}_${user.email}_${chatListingId || "general"}`);
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
  // Mark as read — dedupe by message id; notifications consolidated server-side once per conversation
  useEffect(() => {
    if (!chatUser || !user?.email) return;

    const convKey = `${chatUser}|${chatListingId || ""}`;
    if (markReadConversationKeyRef.current !== convKey) {
      markReadConversationKeyRef.current = convKey;
      seenBatchRef.current.clear();
    }

    let cancelled = false;
    const relevant = messages.filter((m: any) =>
      messageInActiveConversation(m, user.email!, chatUser, chatListingId)
    );
    const unreadMsgs = relevant.filter(
      (m: any) =>
        m.sender !== user.email &&
        !m.read &&
        !seenBatchRef.current.has(m.id)
    );

    for (const msg of unreadMsgs) {
      seenBatchRef.current.add(msg.id);
    }

    if (unreadMsgs.length > 0) {
      const messageIds = unreadMsgs.map((m: any) => m.id);
      const shouldMarkNotifications =
        notificationsMarkedForConvRef.current !== convKey;
      if (shouldMarkNotifications) {
        notificationsMarkedForConvRef.current = convKey;
      }
      const tokenP = user.getIdToken();
      tokenP.then((token) => {
        if (cancelled) return;
        fetch("/api/mark-messages-read", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messageIds,
            markNotifications: shouldMarkNotifications,
            fromEmail: chatUser,
            listingId: chatListingId || "",
          }),
        }).then(async (res) => {
          if (res.ok) {
            await res.json();
            setMessages(prev => prev.map(m =>
              messageIds.includes(m.id) ? { ...m, read: true } : m
            ));
          } else {
            console.error("[messages] Failed to mark messages read");
            for (const id of messageIds) seenBatchRef.current.delete(id);
            if (shouldMarkNotifications) {
              notificationsMarkedForConvRef.current = "";
            }
          }
        }).catch((e) => {
          console.error("Failed to batch mark messages read:", e);
          for (const id of messageIds) seenBatchRef.current.delete(id);
          if (shouldMarkNotifications) {
            notificationsMarkedForConvRef.current = "";
          }
        });
      }).catch((e) => console.error("Failed to get token for mark-read:", e));
    }

    return () => { cancelled = true; };
  }, [chatUser, user, messages, chatListingId]);
  // Fetch usernames + avatars — session cache; do not force-refresh repeatedly
  async function fetchUsername(identifier: string, forceRefresh = false) {
    if (!identifier || identifier === "system") return;
    if (!forceRefresh && (usernamesRef.current[identifier] || usernames[identifier])) return;
    try {
      const profile = await fetchPublicProfileBySlug(identifier, { forceRefresh });
      let handle = "User";
      if (profile) {
        handle = publicHandleFromProfile(profile, "User");
        const profileEmail = profile.email;
        const photo = typeof profile.photoURL === "string" ? profile.photoURL.trim() : "";
        if (profileEmail && profileEmail !== identifier) {
          setUsernames((prev) => ({ ...prev, [profileEmail]: handle }));
          if (photo) {
            setAvatars((prev) => ({ ...prev, [profileEmail]: photo, [identifier]: photo }));
          }
        } else if (photo) {
          setAvatars((prev) => ({ ...prev, [identifier]: photo }));
        }
      }
      setUsernames((prev) => ({ ...prev, [identifier]: handle }));
    } catch (e) {
      console.error("Failed to fetch username:", e);
    }
  }
  // Main messages listener — blockedUsers via ref to avoid resubscribe remounts
  useEffect(() => {
    if (!user?.email) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoadError(false);
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
        .filter((msg: any) => messageInInboxList(msg, user.email!, blockedUsersRef.current));
      items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      rawMessagesRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(items);
      setLoading(false);
      if (snap.metadata?.hasPendingWrites) return;
      // Dedupe profile resolution IDs across the inbox snapshot
      const ids = new Set<string>();
      for (const msg of items as any[]) {
        if (msg.sender) ids.add(msg.sender);
        if (msg.receiver) ids.add(msg.receiver);
        msg.participants?.forEach((p: string) => ids.add(p));
        extractEmailsFromText(msg.text || "").forEach((e) => ids.add(e));
      }
      ids.forEach((id) => {
        if (!usernamesRef.current[id]) fetchUsername(id);
      });
    }, (err) => {
      console.error("Messages snapshot error:", err);
      if (mounted) {
        setLoading(false);
        setLoadError(true);
      }
    });

    return () => { mounted = false; unsub(); };
  }, [user?.email]);

  // Re-filter inbox when block list changes without resubscribing
  useEffect(() => {
    if (!user?.email || rawMessagesRef.current.length === 0) return;
    const items = rawMessagesRef.current
      .filter((msg: any) => messageInInboxList(msg, user.email!, blockedUsers))
      .sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
    setMessages(items);
  }, [blockedUsers, user?.email]);
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
      // Throttle identical typing writes (400ms debounce upstream + 1.2s min gap)
      if (lastTypingSentRef.current === typing) {
        if (typing && Date.now() - lastTypingWriteAtRef.current < 1200) return;
        if (!typing) return;
      }
      lastTypingSentRef.current = typing;
      lastTypingWriteAtRef.current = Date.now();
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
      const imgRes = await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "image", imageUrl, text: "", receiver: chatUser,
          listingId: chatListingId || undefined, listingTitle: activeListingTitle || undefined,
        }),
      });
      if (!imgRes.ok) {
        const errData = await imgRes.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Failed to send image");
      }
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
      const fileRes = await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "file", fileUrl, fileName: fileAttachment.name, fileSize: fileAttachment.size,
          text: "", receiver: chatUser,
          listingId: chatListingId || undefined, listingTitle: activeListingTitle || undefined,
        }),
      });
      if (!fileRes.ok) {
        const errData = await fileRes.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Failed to send file");
      }
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
  const threadHasUserChat = useMemo(
    () =>
      filteredMessages.some(
        (m: any) =>
          m.sender !== "system" &&
          m.type !== "system" &&
          m.type !== "order_event" &&
          m.type !== "order" &&
          (m.text || m.type === "image" || m.type === "file" || m.type === "offer")
      ),
    [filteredMessages]
  );
  const startQuickReplies = isOwnListing ? SELLER_START_QUICK_REPLIES : BUYER_START_QUICK_REPLIES;
  const showStartQuickReplies = !!chatUser && !threadHasUserChat && !message.trim();

  // Send text message
  async function sendMessage(skipSafety = false, textOverride?: string) {
    if (sendingMessage || sendInFlightRef.current) return;
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

    sendInFlightRef.current = true;
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
      if (messageInputRef.current) {
        messageInputRef.current.style.height = "auto";
      }
      // Auto-scroll after optimistic update
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

      const sendToken = await user.getIdToken();
      const sendRes = await fetch("/api/send-message", {
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
      if (!sendRes.ok) {
        const errData = await sendRes.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Failed to send");
      }
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
      showToast(e instanceof Error ? e.message : "Failed to send", "error");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMessage(textToSend);
    } finally {
      sendInFlightRef.current = false;
      setSendingMessage(false);
    }
  }

  async function sendQuickReply(reply: string) {
    if (sendingMessage || sendInFlightRef.current || !reply.trim()) return;
    await sendMessage(false, reply);
  }
  async function sendPendingMessage() {
    if (!pendingMessage || !user?.email || !chatUser) return;
    if (!checkMessageRateLimit()) return;
    const textToSend = pendingMessage;
    setScamWarning(false);
    setMessage("");
    setPendingMessage("");
    try {
      const sendToken = await user.getIdToken();
      const sendRes = await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sendToken}` },
        body: JSON.stringify({ text: textToSend, receiver: chatUser }),
      });
      if (!sendRes.ok) {
        const errData = await sendRes.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Failed to send");
      }
      createNotification({
        targetEmail: chatUser,
        fromEmail: user.email,
        type: "message",
        title: "New message from " + notificationSenderLabel(),
        message: textToSend.length > 100 ? textToSend.slice(0, 100) + "..." : textToSend,
      });
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Failed to send", "error");
      setMessage(textToSend);
    }
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
      <section className={`${PAGE_SHELL_CHAT} py-2 sm:py-5`}>
        <div
          className={`mx-auto flex w-full max-w-[1100px] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow-sm)] sm:rounded-2xl ${
            !isMobile || mobileView === "list"
              ? "h-[calc(100dvh-7.5rem-var(--mobile-nav-offset,0px))] sm:h-[calc(100dvh-14rem)]"
              : "h-[calc(100dvh-5rem-var(--mobile-nav-offset,0px))] sm:h-[calc(100dvh-10rem)]"
          }`}
        >
          {/* SIDEBAR */}
          <div className={`flex w-full flex-col border-r border-[var(--card-border)] md:w-[300px] md:shrink-0 lg:w-[320px] ${isMobile && mobileView === "chat" ? "hidden" : "flex"}`}>
            <div className="border-b border-[var(--card-border)] px-4 py-3 sm:px-4 sm:py-3.5">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)] sm:text-xl">Messages</h1>
                {messages.length > 0 && (
                  <button
                    onClick={() => setClearAllConfirm(true)}
                    className="text-[10px] text-red-400/80 underline decoration-red-400/20 underline-offset-2 transition hover:text-red-400"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="mt-2.5 flex gap-1.5">
                <div className="relative flex-1">
                  <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] py-2 pl-8 pr-3 text-[13px] text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-500/50" />
                </div>
                <select
                  value={conversationFilter}
                  onChange={(e) => setConversationFilter(e.target.value as "all" | "sellers" | "buyers")}
                  className="h-9 shrink-0 rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] px-2 text-[11px] text-[var(--foreground)] outline-none transition focus:border-sky-500/50"
                >
                  <option value="all">All</option>
                  <option value="sellers">Sellers</option>
                  <option value="buyers">Buyers</option>
                </select>
                <button onClick={() => setShowUnreadOnly((prev) => !prev)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                    showUnreadOnly
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
                      : "border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`} title="Show unread only">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </button>
                <button onClick={markAllAsRead}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  title="Mark all as read">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {loading ? (
                <div className="flex justify-center p-6"><LoadingSpinner text="Loading conversations" /></div>
              ) : loadError ? (
                <div className="p-4">
                  <EmptyState
                    title="Couldn't load messages"
                    description="Check your connection and try again."
                    actionLabel="Retry"
                    onAction={() => {
                      setLoading(true);
                      setLoadError(false);
                      window.location.reload();
                    }}
                  />
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                  <p className="text-[15px] font-medium text-[var(--foreground)]">Your messages will appear here.</p>
                  <p className="mt-1.5 max-w-[220px] text-[13px] leading-relaxed text-[var(--muted)]">
                    Message a seller from a listing to start arranging a purchase.
                  </p>
                  <Link href="/" className="mt-5 text-[13px] font-medium text-sky-500 transition hover:text-sky-400">
                    Browse marketplace
                  </Link>
                </div>
              ) : (
                conversations.map(([key, convo]: any) => {
                  const unreadCount = conversationUnread[key] || 0;
                  const selected = chatUser === convo.participant && chatListingId === convo.listingId;
                  const displayName = getDisplayName(convo.participant);
                  const avatarUrl = avatars[convo.participant];
                  const preview =
                    convo.msg.text
                      ? formatMessageText(convo.msg.text)
                      : convo.msg.type === "image"
                        ? "Photo"
                        : convo.msg.type === "file"
                          ? `${convo.msg.fileName || "File"}`
                          : convo.msg.type === "offer"
                            ? `Offer: $${convo.msg.offerAmount || ""}`
                            : convo.msg.type === "purchase"
                              ? "Purchase request"
                              : convo.msg.type === "system"
                                ? "Update"
                                : "";
                  return (
                    <button key={key}
                      onClick={() => { 
                        setChatUser(convo.participant); 
                        setChatListingId(convo.listingId); 
                        if (isMobile) setMobileView("chat"); 
                      }}
                      className={`flex w-full items-center gap-3 border-b border-[var(--card-border)]/70 px-3.5 py-3 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--card-hover)] active:bg-[var(--card-hover)] ${
                        selected ? "bg-sky-500/[0.06] shadow-[inset_2px_0_0_0_var(--accent-primary)]" : ""
                      } ${unreadCount > 0 && !selected ? "bg-[var(--soft-card)]/40" : ""}`}>
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[var(--soft-card)] ring-1 ring-[var(--card-border)]">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-sky-500">
                            {(displayName || "?").replace(/^@/, "").charAt(0).toUpperCase()}
                          </div>
                        )}
                        {unreadCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-500 px-1 text-[9px] font-bold text-white ring-2 ring-[var(--card)]">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[13px] leading-tight ${unreadCount > 0 ? "font-semibold text-[var(--foreground)]" : "font-medium text-[var(--foreground)]"}`}>
                            {displayName}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">{formatTime(convo.msg.createdAt)}</span>
                        </div>
                        {convo.listingTitle && (
                          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{convo.listingTitle}</p>
                        )}
                        <p className={`mt-0.5 truncate text-[12px] leading-snug ${unreadCount > 0 ? "font-medium text-[var(--foreground)]/85" : "text-[var(--muted)]"}`}>
                          {preview}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          {/* CHAT AREA */}
          <div className={`flex min-w-0 flex-1 flex-col ${isMobile && mobileView === "list" ? "hidden" : "flex"}`}>
            {/* Chat header — compact */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--card-border)] bg-[var(--soft-card)]/30 px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                {isMobile && (
                  <button
                    onClick={() => setMobileView("list")}
                    aria-label="Back to conversations"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--card-hover)] hover:text-[var(--foreground)] active:scale-[0.97] motion-reduce:active:scale-100"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                {chatUser ? (
                  <>
                    <div className="relative shrink-0">
                      <button onClick={() => setShowProfilePreview(!showProfilePreview)}
                        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--soft-card)] text-[12px] font-semibold text-sky-500 ring-1 ring-[var(--card-border)] transition hover:ring-sky-500/40">
                        {avatars[chatUser] ? (
                          <img src={avatars[chatUser]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          getDisplayName(chatUser).replace(/^@/, "").charAt(0).toUpperCase()
                        )}
                      </button>
                      {showProfilePreview && (
                        <div ref={profilePreviewRef} className="absolute left-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow-md)]"
                          onClick={(e) => e.stopPropagation()}>
                          <div className="p-4 text-center">
                            <div className="mx-auto flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[var(--soft-card)] text-[14px] font-semibold text-sky-500 ring-1 ring-[var(--card-border)]">
                              {avatars[chatUser] ? (
                                <img src={avatars[chatUser]} alt="" className="h-full w-full object-cover" />
                              ) : (
                                getDisplayName(chatUser).replace(/^@/, "").charAt(0).toUpperCase()
                              )}
                            </div>
                            <p className="mt-2.5 text-[13px] font-semibold text-[var(--foreground)]">{getDisplayName(chatUser)}</p>
                            {sellerProfile && (
                              <p className="mt-1 text-[11px] text-[var(--muted)]">{sellerProfile.sales || 0} sales{sellerTrust ? ` · ${sellerTrust.score}% trust` : ""}</p>
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
                              className="mt-3 inline-block w-full rounded-lg bg-sky-500 py-2 text-[11px] font-semibold text-white transition hover:bg-sky-400">
                              View Profile
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-[14px] font-semibold leading-tight text-[var(--foreground)]">{getDisplayName(chatUser)}</h2>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--muted)]">
                        {listingCard ? (
                          <Link
                            href={listingCard?.type === "service" ? "/services" : `/post/listing/${listingCard.id}`}
                            className="truncate transition hover:text-sky-500"
                          >
                            {listingCard.title || "Listing"}
                            {listingCard.price ? ` · $${listingCard.price}` : ""}
                          </Link>
                        ) : otherTyping ? (
                          <span className="text-sky-500">Typing…</span>
                        ) : sellerProfile?.verified ? (
                          <span>Verified</span>
                        ) : null}
                        {otherTyping && listingCard && (
                          <span className="shrink-0 text-sky-500">· Typing…</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <h2 className="text-[14px] font-semibold text-[var(--muted)]">Select a conversation</h2>
                )}
              </div>
              {chatUser && (
                <div className="relative shrink-0">
                  <button onClick={() => setShowMenu(!showMenu)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
                    </svg>
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-10 z-40 w-48 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1 shadow-[var(--shadow-md)]">
                      <button onClick={() => reportUser(chatUser)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--foreground)] transition hover:bg-[var(--card-hover)]">
                        Report user
                      </button>
                      <button onClick={() => setBlockConfirmTarget(chatUser)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--foreground)] transition hover:bg-[var(--card-hover)]">
                        Block user
                      </button>
                      <button onClick={clearConversation} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--foreground)] transition hover:bg-[var(--card-hover)]">
                        Clear conversation
                      </button>
                      {hasPurchaseInChat && purchaseData?.buyerEmail === user?.email && !purchaseData?.disputeStatus && (
                        <button onClick={() => router.push("/purchases")} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-red-400 transition hover:bg-[var(--card-hover)]">
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
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                <p className="text-[15px] font-medium text-[var(--foreground)]">Your messages will appear here.</p>
                <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-[var(--muted)]">
                  Pick a conversation from the list, or message a seller from any listing.
                </p>
              </div>
            ) : (
              <>
                {/* Messages area */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 sm:px-5 sm:py-4">
                   {/* Listing context card — purchased */}
                  {hasPurchaseInChat && !isRefundedStatus(purchaseData?.status) && (
                    <StayOnSkyDropNotice paymentType={purchaseData?.paymentType} />
                  )}
                  {listingCard && hasPurchaseInChat && (
                    <div className={`mb-2 overflow-hidden rounded-lg border ${
                      isRefundedStatus(purchaseData?.status)
                        ? "border-violet-500/25 bg-[var(--soft-card)]"
                        : "border-[var(--card-border)] bg-[var(--soft-card)]/80"
                    }`}>
                      <div className="flex items-center gap-2.5 px-2.5 py-2">
                        {listingCard.image ? (
                          <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-[var(--soft-card)]">
                            <img src={listingCard.image} alt="" className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : (
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--soft-card)]">
                            <span className="text-[10px] font-bold text-sky-500">SD</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                          {!isRefundedStatus(purchaseData?.status) && (
                            <p className="text-[11px] text-[var(--muted)]">
                              ${purchaseData?.total || listingCard.price}
                              {" · "}
                              {purchaseData?.status === "arrange_requested"
                                ? purchaseData?.sellerEmail === user?.email
                                  ? "Awaiting your confirmation"
                                  : "Purchase request sent"
                                : purchaseData?.status === "pending"
                                  ? "Awaiting seller confirmation"
                                  : purchaseStatusLabel(purchaseData?.status)}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
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
                              className="rounded-md bg-sky-500 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60"
                            >
                              {confirmingArrangeSale ? "Updating…" : "Mark sold"}
                            </button>
                          )}
                          <Link href={purchaseData?.sellerEmail === user?.email ? "/sales" : "/purchases"}
                            className="rounded-md border border-[var(--card-border)] px-2.5 py-1 text-center text-[10px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-hover)]">
                            View Order
                          </Link>
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
                  {/* Compact listing context — non-purchase threads */}
                  {listingCard && !hasPurchaseInChat && (
                    <div className={`mb-2.5 flex items-center gap-2.5 overflow-hidden rounded-lg border px-2.5 py-2 ${
                      auctionEnded && isAuctionWinner
                        ? "border-sky-500/25 bg-sky-500/5"
                        : listingCard.status === "sold"
                          ? "border-[var(--card-border)] bg-[var(--soft-card)]/50 opacity-80"
                          : "border-[var(--card-border)] bg-[var(--soft-card)]/70"
                    }`}>
                      {listingCard.image ? (
                        <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-[var(--soft-card)]">
                          <img src={listingCard.image} alt="" className="h-full w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      ) : (
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[var(--soft-card)]">
                          <span className="text-[10px] font-bold text-sky-500">SD</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-[var(--foreground)]">{listingCard.title || "Listing"}</p>
                        <p className="truncate text-[11px] text-[var(--muted)]">
                          {listingCard.status === "sold"
                            ? "Sold"
                            : auctionEnded
                              ? isAuctionWinner
                                ? `Won · $${listingCard.currentBid || listingCard.price}`
                                : "Auction ended"
                              : isAuction
                                ? `Auction · $${listingCard.currentBid || listingCard.price}`
                                : listingCard.price
                                  ? `$${listingCard.price}`
                                  : "Listing"}
                        </p>
                      </div>
                      <Link
                        href={listingCard?.type === "service" ? "/services" : `/post/listing/${listingCard.id}`}
                        className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--foreground)] transition hover:border-sky-500/40 hover:text-sky-500"
                      >
                        {auctionEnded && isAuctionWinner
                          ? (listingCard.saleType === "auction_buy_now"
                              ? (stripeCheckoutVisible ? "Proceed to Payment" : "Arrange")
                              : "Arrange Pickup")
                          : "View listing"}
                      </Link>
                    </div>
                  )}
                  {/* Messages */}
                  {filteredMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                      <p className="text-[14px] font-medium text-[var(--foreground)]">No messages yet</p>
                      <p className="mt-1 text-[12px] text-[var(--muted)]">Say hello to start arranging.</p>
                    </div>
                  ) : (
                    <div className="mx-auto w-full max-w-[42rem] space-y-0.5">
                      {filteredMessages.map((msg: any, idx: number) => {
                        const isOwn = user?.email === msg.sender;
                        const prevMsg = idx > 0 ? filteredMessages[idx - 1] : null;
                        const nextMsg = idx < filteredMessages.length - 1 ? filteredMessages[idx + 1] : null;
                        const groupStart = !isGroupedWithNeighbor(prevMsg, msg);
                        const groupEnd = !isGroupedWithNeighbor(msg, nextMsg);
                        const showTime = groupEnd;
                        const gapClass = groupStart ? (idx === 0 ? "" : "mt-2.5") : "mt-0.5";
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
                                      <button disabled={sendingOffer} onClick={() => sendOffer("decline")} className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] py-2.5 text-[10px] font-bold text-[var(--foreground)] transition hover:bg-[var(--card-hover)] disabled:opacity-50">Decline</button>
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
                            const configs: Record<string, { label: string; color: string }> = {
                              paid: { label: "Payment confirmed", color: "text-sky-400" },
                              awaiting_seller: { label: "Awaiting seller", color: "text-sky-400" },
                              pickup_arranged: { label: "Pickup arranged", color: "text-sky-400" },
                              shipped: { label: "Shipped", color: "text-sky-400" },
                              delivered: { label: "Delivered", color: "text-sky-400" },
                              completed: { label: "Completed", color: "text-sky-400" },
                              disputed: { label: "Disputed", color: "text-red-400" },
                            };
                            return configs[status || "paid"] || configs.paid;
                          };
                          const statusConfig = isWantedListing
                            ? { label: "Wanted", color: "text-sky-400" }
                            : getStatusConfig(effectiveOrderStatus);
                          const isDisputed = !isWantedListing && effectiveOrderStatus === "disputed";
                          const isPaid = !isWantedListing && effectiveOrderStatus === "paid";

                          return (
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                              <div className="w-full max-w-md">
                                <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
                                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
                                    <span className={`text-sm font-semibold ${statusConfig.color}`}>{statusConfig.label}</span>
                                    <div className="text-[10px] text-[var(--muted)]">
                                      {(msg.purchaseId || msg.id).slice(-8).toUpperCase()}
                                    </div>
                                  </div>

                                  <div className="p-4">
                                    <div className="flex gap-3">
                                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--soft-card)]">
                                        {msg.listingImage ? (
                                          <img src={msg.listingImage} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center text-[var(--muted)] text-[10px]">No image</div>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-sm font-semibold text-[var(--foreground)]">{msg.listingTitle || "Listing"}</h3>
                                        <div className="mt-1 flex items-baseline gap-2">
                                          <span className="text-sm font-semibold text-[var(--foreground)]">${msg.listingPrice || "—"}</span>
                                          <span className="text-xs text-[var(--muted)]">{formatTime(msg.createdAt)}</span>
                                        </div>
                                        {isPaid && (
                                          <p className="mt-2 text-xs text-[var(--muted)]">
                                            Next: arrange pickup or shipping in this chat.
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--card-border)]">
                                    <button
                                      onClick={() =>
                                        router.push(isSellerViewer ? "/sales" : "/purchases")
                                      }
                                      className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] px-3 py-2.5 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-hover)]"
                                    >
                                      View order
                                    </button>
                                    <button
                                      onClick={() => router.push(`/post/listing/${chatListingId}`)}
                                      className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] px-3 py-2.5 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-hover)]"
                                    >
                                      View listing
                                    </button>
                                    {isDisputed && (
                                      <button
                                        className="flex-1 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20"
                                      >
                                        Dispute
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
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} ${gapClass}`}>
                              <div className="max-w-[min(75%,22rem)]">
                                <div className={`overflow-hidden ${bubbleRadius(isOwn, groupStart, groupEnd)} ${isOwn ? "bg-sky-500" : "bg-[var(--soft-card)] ring-1 ring-[var(--card-border)]"}`}>
                                  {(msg.imageUrl || msg.imageData) && (
                                    <img src={msg.imageUrl || msg.imageData} alt="Shared image" className="max-h-72 w-full object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                  )}
                                  {msg.text && <div className={`px-3 py-2 text-[13px] ${isOwn ? "text-always-white" : "text-[var(--foreground)]"}`}><p>{msg.text}</p></div>}
                                  {showTime && (
                                    <div className="flex items-center justify-end gap-1 px-3 pb-1.5">
                                      <span className={`text-[9px] ${isOwn ? "text-always-white/70" : "text-[var(--muted)]"}`}>{formatFullTime(msg.createdAt) || formatTime(msg.createdAt)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        // File attachment message
                        if (msg.type === "file") {
                          const isPdf = msg.fileName?.toLowerCase().endsWith(".pdf");
                          return (
                            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} ${gapClass}`}>
                              <div className="max-w-[min(75%,22rem)]">
                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer"
                                  className={`flex items-center gap-3 px-3 py-2.5 transition hover:opacity-90 ${bubbleRadius(isOwn, groupStart, groupEnd)} ${
                                    isOwn ? "bg-sky-500 text-always-white" : "bg-[var(--soft-card)] text-[var(--foreground)] ring-1 ring-[var(--card-border)]"
                                  }`}>
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/10 text-current">
                                    {isPdf ? (
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                    ) : (
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-medium">{msg.fileName}</p>
                                    <p className={`text-[10px] ${isOwn ? "text-always-white/70" : "text-[var(--muted)]"}`}>
                                      {msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : ""}
                                      {isPdf && " · PDF"}
                                    </p>
                                  </div>
                                </a>
                                {showTime && (
                                  <div className="mt-0.5 flex justify-end px-1">
                                    <span className={`text-[9px] ${isOwn ? "text-[var(--muted)]" : "text-[var(--muted)]"}`}>{formatFullTime(msg.createdAt) || formatTime(msg.createdAt)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        // Order event (system message)
                        if (msg.type === "order_event") {
                          const hasActionDetail = !!(msg.shippingAddress || msg.deliveryMethod === "pickup");
                          return (
                            <div key={msg.id} className={`flex justify-center ${gapClass} py-1`}>
                              {hasActionDetail ? (
                                <div className="w-full max-w-sm rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)]/80 px-3.5 py-2.5">
                                  <p className="text-[12px] leading-relaxed text-[var(--foreground)]">{formatMessageText(msg.text)}</p>
                                  {msg.shippingAddress && (
                                    <div className="mt-2 rounded-lg bg-[var(--card)] px-3 py-2 text-[10px] text-[var(--muted)]">
                                      <p className="text-[var(--foreground)]">
                                        {msg.buyerName && !isEmailLike(msg.buyerName)
                                          ? msg.buyerName.startsWith("@")
                                            ? msg.buyerName
                                            : `@${msg.buyerName}`
                                          : "Buyer"}
                                      </p>
                                      <p className="text-[var(--foreground)]">{msg.shippingAddress}</p>
                                      {msg.buyerPhone && <p className="text-[var(--foreground)]">{msg.buyerPhone}</p>}
                                    </div>
                                  )}
                                  {msg.deliveryMethod === "pickup" && (
                                    <p className="mt-1 text-[10px] text-[var(--muted)]">Pickup — arrange with seller</p>
                                  )}
                                </div>
                              ) : (
                                <div className="max-w-[min(90%,24rem)] rounded-full border border-[var(--card-border)] bg-[var(--soft-card)]/80 px-3.5 py-1.5 text-center">
                                  <p className="text-[11px] leading-snug text-[var(--muted)]">{formatMessageText(msg.text)}</p>
                                </div>
                              )}
                            </div>
                          );
                        }
                        // Arrange / system starter
                        if (msg.type === "system" && msg.sender === "system") {
                          return (
                            <div key={msg.id} className={`flex justify-center ${gapClass} py-1`}>
                              <div className="max-w-[min(92%,26rem)] rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)]/60 px-3.5 py-2.5 text-left">
                                <p className="whitespace-pre-line text-[12px] leading-relaxed text-[var(--muted)]">
                                  {formatMessageText(msg.text)}
                                </p>
                                <ArrangePaymentCopyBar text={msg.text || ""} />
                              </div>
                            </div>
                          );
                        }
                        // Text message
                        return (
                          <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} ${gapClass}`}>
                            <div className="max-w-[min(78%,26rem)]">
                              <div className={`px-3 py-1.5 text-[13.5px] leading-relaxed ${bubbleRadius(isOwn, groupStart, groupEnd)} ${
                                isOwn
                                  ? "bg-sky-500 text-always-white"
                                  : "bg-[var(--soft-card)] text-[var(--foreground)] ring-1 ring-[var(--card-border)]"
                              }`}>
                                {!isOwn && (() => { const check = detectScam(msg.text || ""); return check.isScam ? (
                                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-400" title={`Flagged: ${check.keywords.join(", ")}`}>Caution</span>
                                ) : null; })()}
                                {!isOwn && containsRiskyKeywords(msg.text || "") && (
                                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold text-sky-500">Off-platform mention</span>
                                )}
                                <p className="break-words whitespace-pre-line">{formatMessageText(msg.text)}</p>
                                {showTime && (
                                  <div className="mt-1 flex items-center justify-end gap-1">
                                    <span className={`text-[9px] tabular-nums ${isOwn ? "text-always-white/70" : "text-[var(--muted)]"}`}>{formatTime(msg.createdAt)}</span>
                                    {isOwn && (
                                      <span className="text-[10px]">
                                        {msg.read ? (
                                          <svg className="h-3 w-3 text-sky-200" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 7.5l-12 12L5 13l1.5-1.5 5 5 10.5-10.5L23.5 7.5zM17.5 7.5l-6 6-1.5-1.5 6-6 1.5 1.5z" /></svg>
                                        ) : (
                                          <svg className="h-3 w-3 text-always-white/70" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                )}
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
                <div className="border-t border-[var(--card-border)] px-3 pt-2 pb-0 sm:px-4">
                  <StayOnSkyDropNotice paymentType={purchaseData?.paymentType} compact />
                </div>
                {/* Composer */}
                <div
                  ref={composerBarRef}
                  className={`px-3 py-2 sm:px-4 sm:py-2.5 ${MOBILE_FAB_CLEARANCE}`}
                  style={composerPad > 0 ? { paddingBottom: composerPad } : undefined}
                >
                  {imagePreview && (
                    <div className="mb-2 flex items-center gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] p-2">
                      <img src={imagePreview} alt="Preview" className="h-11 w-11 rounded-md object-cover" />
                      <span className="flex-1 truncate text-[11px] text-[var(--muted)]">Image ready</span>
                      <button onClick={() => { setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>
                      <button onClick={sendImageMessage} className="rounded-md bg-sky-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-sky-400">Send</button>
                    </div>
                  )}
                  {fileAttachment && (
                    <div className="mb-2 flex items-center gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-[var(--foreground)]">{fileAttachment.name}</p>
                        <p className="text-[9px] text-[var(--muted)]">{(fileAttachment.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={() => { setFileAttachment(null); if (fileAttachInputRef.current) fileAttachInputRef.current.value = ""; }} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>
                      <button onClick={sendFileMessage} className="rounded-md bg-sky-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-sky-400">Send</button>
                    </div>
                  )}
                  {showStartQuickReplies && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {startQuickReplies.map((reply) => (
                        <button
                          key={reply}
                          type="button"
                          disabled={sendingMessage}
                          onClick={() => sendQuickReply(reply)}
                          className="rounded-full border border-[var(--card-border)] bg-[var(--soft-card)] px-3 py-1 text-[11px] font-medium text-[var(--muted)] transition hover:border-sky-500/35 hover:text-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-1.5">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Attach photo"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] transition hover:border-sky-500/40 hover:text-sky-500"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileAttachInputRef.current?.click()}
                      aria-label="Attach file"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] text-[var(--muted)] transition hover:border-sky-500/40 hover:text-sky-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                    <input ref={fileAttachInputRef} type="file" onChange={handleFileSelect} className="hidden" />
                    <textarea
                      ref={messageInputRef}
                      rows={1}
                      placeholder="Message…"
                      value={message}
                      maxLength={2000}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        const el = e.target;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                        if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
                        typingDebounceRef.current = setTimeout(() => emitTyping(e.target.value.length > 0), 400);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] px-3.5 py-2.5 text-[14px] leading-snug text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-500/50"
                    />
                    <button
                      onClick={() => sendMessage()}
                      disabled={sendingMessage || !message.trim()}
                      aria-label="Send message"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
                    >
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
