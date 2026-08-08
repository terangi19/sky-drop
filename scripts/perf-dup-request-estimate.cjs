/**
 * Static before/after estimates for performance cleanup (code-path analysis).
 * Run: node scripts/perf-dup-request-estimate.cjs
 */
/* eslint-disable no-console */

const before = {
  homepage: {
    serialGetDocs: "listings then tradePosts (2 sequential round-trips)",
    overlappingFetch:
      "interval + visibilitychange + effect remount could stack concurrent getDocs pairs",
    estimatedReadsPerLoad: 2,
    estimatedReadsOnTabFocusDuringInflight: "4+ (duplicate pair)",
  },
  sellerMeta: {
    trigger: "every listings array identity change",
    reviews: "getDocs reviews for all unique emails every refresh",
    profiles: "batch API (cached) but still re-applied + ready flicker",
    scaleNote: "20 listings / 5 sellers still re-queried reviews on each homepage poll",
  },
  messages: {
    usernameForceRefresh: "2× fetchUsername(chatUser) including forceRefresh",
    inboxUsername: "per-message sender/receiver/participants (no ID dedupe)",
    messagesListenerResub: "resubscribe when blockedUsers changes",
    listingGetDoc: "re-ran on every messages snapshot ([chatListingId, messages])",
    markRead: "API + client getDocs(notifications limit 30) on every unread effect pass; seenBatch cleared each run",
    salesCount: "getDocs purchases limit 100 every conversation open",
  },
};

const after = {
  homepage: {
    parallelGetDocs: "Promise.all(listings, tradePosts)",
    overlappingFetch: "in-flight guard + queued single refresh",
    estimatedReadsPerLoad: 2,
    estimatedReadsOnTabFocusDuringInflight: "2 (deduped; one follow-up if queued)",
  },
  sellerMeta: {
    trigger: "unique seller signature change only",
    reviews: "module TTL cache; only missing emails fetched",
    profiles: "existing batch+cache; skip network when signature unchanged",
    scaleNote: "20 listings / 5 sellers → enrichment scales with 5 unique sellers",
  },
  messages: {
    usernameForceRefresh: "single cached fetchUsername(chatUser)",
    inboxUsername: "Set-deduped IDs before profile resolution; session cache",
    messagesListenerResub: "blockedUsers via ref; re-filter without resubscribe",
    listingGetDoc: "depends on chatListingId only",
    markRead: "message-id seenBatch kept per conversation; notifications once via API",
    salesCount: "use profile.salesCount when present; else scan purchases",
  },
  savings: {
    homepageSerialLatency: "~1 round-trip saved per load (parallel)",
    homepageDupOnFocus: "up to 50%+ fewer listing reads when overlap",
    sellerMetaOnPoll: "0 review/profile network when sellers unchanged (was full review query)",
    messagesNotifReads: "−30 notification docs + N updates per messages-change while unread",
    messagesSales: "−100 purchase reads per open when salesCount exists",
    bundle: "SkyAiChatPanel deferred until sheet open; Stripe OfferPaymentModal + NegotiationAssistant dynamic on messages",
  },
};

console.log(JSON.stringify({ before, after }, null, 2));
