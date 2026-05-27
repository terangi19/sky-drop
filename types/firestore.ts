export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds?: number;
  toDate?: () => Date;
  toMillis?: () => number;
}

export interface Listing {
  id: string;
  title?: string;
  price?: string;
  description?: string;
  category?: string;
  image?: string;
  imageUrl?: string;
  images?: string[];
  createdAt?: FirestoreTimestamp;
  expiresAt?: FirestoreTimestamp;
  promotedUntil?: FirestoreTimestamp;
  userId?: string;
  sellerEmail?: string;
  sellerUsername?: string;
  condition?: string;
  location?: string;
  acceptOffers?: boolean;
  saleType?: string;
  currentBid?: number;
  startingBid?: number;
  views?: number;
  bidCount?: number;
  status?: string;
  type?: string;
  [key: string]: unknown;
}

export type NotificationType = "message" | "offer" | "sold" | "purchase" | string;

export interface NotificationItem {
  id: string;
  sender: string;
  senderEmail: string;
  listingTitle: string;
  listingId: string;
  type: NotificationType;
  time: string;
  href: string;
  unread: boolean;
}
