export type SkyAiListingContext = {
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: string;
  listingType?: string;
  location?: string;
  paymentType?: string;
  pricingType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  /** Canonical generation token e.g. R34 — never infer slot-complete from title/model alone */
  vehicleGeneration?: string;
  vehicleYear?: string;
  vehicleOdometer?: string;
  vehicleColour?: string;
  vehicleBodyType?: string;
  vehicleFuelType?: string;
  vehicleTransmission?: string;
  rentalSubType?: string;
  rentalPropertyType?: string;
  rentalPriceWeekly?: string;
  rentalPriceMonthly?: string;
  rentalDeposit?: string;
  rentalBedrooms?: string;
  rentalBathrooms?: string;
  rentalParkingSpaces?: string;
  rentalFurnishedStatus?: string;
  rentalPetsPolicy?: string;
  rentalMinTenancy?: string;
  rentalAvailableDate?: string;
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
