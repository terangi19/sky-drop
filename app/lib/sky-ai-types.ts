export type SkyAiListingContext = {
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: string;
  listingType?: string;
  location?: string;
  paymentType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleOdometer?: string;
  vehicleColour?: string;
  vehicleBodyType?: string;
  vehicleFuelType?: string;
  vehicleTransmission?: string;
  rentalPriceWeekly?: string;
  rentalPriceMonthly?: string;
  rentalDeposit?: string;
  stockQuantity?: string;
  serviceDuration?: string;
  /** Incremental add-ons (servicing, tyres, receipts, included items) */
  extras?: string[];
};

export type SkyAiHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type SkyAiConversationSummary = {
  id: string;
  title: string;
  updatedAt: number | null;
  messageCount: number;
};
