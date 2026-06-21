import { Timestamp } from "firebase/firestore";

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: string;
  category: string;
  condition?: string;
  type: "physical" | "digital" | "service" | "rental" | "event" | "vehicle" | "job" | "property" | "wanted";
  sellerEmail: string;
  sellerUsername: string;
  sellerId: string;
  imageUrl: string;
  images: string[];
  location?: string;
  paymentType: "contact" | "stripe";
  acceptOffers: boolean;
  status: "live" | "sold" | "expired" | "pending";
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  expiresAt: Date;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  pickupArea?: string;
  shippingFee?: string;
  freeShipping?: boolean;
  saleType?: "buy_now" | "auction" | "auction_buy_now";
  startingBid?: string;
  reservePrice?: string;
  buyNowPrice?: string;
  auctionDuration?: string;
  stockQuantity?: string;
  expiresIn?: string;
  // Digital
  digitalFileURL?: string;
  digitalFileName?: string;
  digitalStoragePath?: string;
  pricingType?: "fixed" | "quote";
  // Service
  serviceDuration?: string;
  servicePricingType?: "fixed" | "hourly" | "request_quote";
  // Rental
  rentalSubType?: "property" | "equipment" | "vehicle";
  rentalPropertyType?: string;
  rentalPriceWeekly?: string;
  rentalPriceMonthly?: string;
  rentalDeposit?: string;
  rentalBedrooms?: string;
  rentalBathrooms?: string;
  rentalParkingSpaces?: string;
  rentalFurnishedStatus?: string;
  rentalPetsPolicy?: string;
  rentalAvailableDate?: string;
  rentalFeatures?: string[];
  rentalMinTenancy?: string;
  // Event
  eventDate?: string;
  eventTime?: string;
  venue?: string;
  ticketQuantity?: string;
  ticketType?: string;
  // Vehicle
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleOdometer?: string;
  vehicleBodyType?: string;
  vehicleFuelType?: string;
  vehicleTransmission?: string;
  vehicleColour?: string;
  // Job
  jobCompany?: string;
  jobEmploymentType?: string;
  salaryMin?: string;
  salaryMax?: string;
  // Property
  propertyType?: string;
  bedrooms?: string;
  bathrooms?: string;
  landArea?: string;
  floorArea?: string;
  parking?: string;
}

export interface Purchase {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImage: string;
  listingPrice: string;
  buyerEmail: string;
  buyerUsername: string;
  buyerId: string;
  sellerEmail: string;
  sellerUsername: string;
  sellerId: string;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "disputed";
  paymentType: "contact" | "stripe";
  stripePaymentIntentId?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  expiresAt?: Date;
  // Arrange Purchase
  arrangePurchaseDetails?: {
    agreedPaymentMethod?: string;
    agreedDeliveryMethod?: string;
    agreedPrice?: string;
  };
  // Shipping
  shippingAddress?: string;
  shippingCity?: string;
  shippingPostcode?: string;
  trackingNumber?: string;
  // Offers
  offerAmount?: string;
  offerStatus?: "pending" | "accepted" | "declined" | "countered";
  counterOfferAmount?: string;
}

export interface Profile {
  uid: string;
  email: string;
  username?: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  phone?: string;
  phoneVerified?: boolean;
  verified?: boolean;
  kycStatus?: "pending" | "approved" | "rejected";
  followers?: number;
  location?: string;
  createdAt?: Timestamp;
  // Payment
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  stripeConnectedAccountId?: string;
  // Settings
  emailNotifications?: boolean;
  pushNotifications?: boolean;
}

export interface Review {
  id: string;
  sellerEmail: string;
  sellerUsername: string;
  buyerEmail: string;
  buyerUsername: string;
  rating: number;
  comment: string;
  listingId?: string;
  createdAt: Timestamp;
}

export interface Report {
  id: string;
  reportedUserEmail: string;
  reporterEmail: string;
  reporterUsername: string;
  reason: string;
  description: string;
  listingId?: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}

export interface Notification {
  id: string;
  targetEmail: string;
  title: string;
  message: string;
  type: "message" | "purchase" | "sale" | "offer" | "review" | "system";
  fromEmail?: string;
  fromUsername?: string;
  listingId?: string;
  purchaseId?: string;
  read: boolean;
  createdAt: Timestamp;
}

export interface Message {
  id: string;
  conversationId: string;
  senderEmail: string;
  senderUsername: string;
  recipientEmail: string;
  recipientUsername: string;
  text: string;
  imageUrl?: string;
  read: boolean;
  createdAt: Timestamp;
}

export interface Dispute {
  id: string;
  purchaseId: string;
  buyerEmail: string;
  sellerEmail: string;
  reason: string;
  description: string;
  status: "open" | "investigating" | "resolved" | "closed";
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolution?: string;
  adminNotes?: string;
}

export interface TradePost {
  id: string;
  authorEmail: string;
  authorUsername: string;
  content: string;
  imageUrl?: string;
  likes: number;
  comments: number;
  createdAt: Timestamp;
}
