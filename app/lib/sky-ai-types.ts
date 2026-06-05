export type SkyAiListingContext = {
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: string;
  listingType?: string;
  location?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleOdometer?: string;
  vehicleColour?: string;
  vehicleBodyType?: string;
  vehicleFuelType?: string;
  vehicleTransmission?: string;
  servicePricingType?: string;
  serviceDuration?: string;
  serviceDeliveryMethod?: string;
};

export type SkyAiHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type SkyAiFlow =
  | "listing_creation"
  | "auction_creation"
  | "auction_setup"
  | "vehicle_listing"
  | "service_listing"
  | "service_quote"
  | "request_quote"
  | "pricing_estimate"
  | "marketplace_search"
  | "marketplace_help"
  | "scam_check"
  | "negotiation";

export type SkyAiStep =
  | "listing_type"
  | "photos"
  | "describe_item"
  | "vehicle_details"
  | "auction_params"
  | "auction_title"
  | "auction_confirm_create"
  | "service_scope"
  | "service_price"
  | "pricing_request"
  | "listing_confirm_create";

export type SkyAiDraftStatus = "draft" | "ready" | "complete";

export type SkyAiListingDraft = {
  status: SkyAiDraftStatus;
  flow?: SkyAiFlow | null;
  step?: SkyAiStep | null;
  entityType?: string;
  entityName?: string;
  entityKey?: string;
  listingType?: string;
  saleType?: string;
  category?: string;
  title?: string;
  description?: string;
  condition?: string;
  price?: string;
  startingBid?: string;
  reservePrice?: string;
  durationDays?: string;
  location?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleOdometer?: string;
  vehicleColour?: string;
  vehicleBodyType?: string;
  vehicleFuelType?: string;
  vehicleTransmission?: string;
  servicePricingType?: string;
  serviceDuration?: string;
  serviceDeliveryMethod?: string;
};

export type SkyAiConversationState = {
  flow: SkyAiFlow | null;
  step: SkyAiStep | null;
};

export type SkyAiConversationSummary = {
  id: string;
  title: string;
  updatedAt: number | null;
  messageCount: number;
};
