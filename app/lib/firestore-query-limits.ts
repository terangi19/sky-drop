/**
 * Shared caps for marketplace Firestore reads.
 * Unbounded queries grow linearly with listings/users — keep these in one place.
 */
export const BROWSE_LISTINGS_LIMIT = 120;
export const SEARCH_LISTINGS_LIMIT = 400;
export const SELLER_LISTINGS_LIMIT = 100;
export const SELLER_TRADE_POSTS_LIMIT = 100;
export const SELLER_OTHER_LISTINGS_FETCH_LIMIT = 20;
export const SELLER_REVIEWS_LIMIT = 50;
export const SELLER_SALES_LIMIT = 50;
export const LISTING_QNA_LIMIT = 100;
export const LISTING_ORDERS_LIMIT = 50;
export const LISTING_REPORTS_LIMIT = 50;
export const INBOX_BLOCKED_LIMIT = 100;
export const INBOX_HIDDEN_LIMIT = 100;
export const WATCHLIST_LIMIT = 100;
export const FAVORITES_LIMIT = 200;
export const DASHBOARD_ORDERS_LIMIT = 100;
export const DASHBOARD_DISPUTES_LIMIT = 100;
export const DASHBOARD_APPLICATIONS_LIMIT = 100;
export const ADMIN_DISPUTES_LIMIT = 200;
export const ADMIN_PENDING_REVIEW_LIMIT = 100;
export const NOTIFICATIONS_PAGE_SIZE = 20;
export const NOTIFICATIONS_MAX_LIMIT = 100;
export const LISTINGS_POLL_MS = 300_000;
export const SELLER_PAGE_POLL_MS = 60_000;
