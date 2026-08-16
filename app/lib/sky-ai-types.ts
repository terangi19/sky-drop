export type SkyAiListingContext = {
  /**
   * Durable identity for one coherent listing task. It is intentionally stored
   * with the draft so late photo/AI work can never apply to a replacement task.
   */
  draftId?: string;
  /**
   * Durable UI ownership stamps for this draft. Kept alongside the values so a
   * hard refresh cannot turn Āwhina/vision facts into USER-locked fields.
   */
  fieldProvenance?: Partial<
    Record<
      string,
      | "USER"
      | "USER_CONFIRMED"
      | "USER_CORRECTED"
      | "AWHINA"
      | "IMAGE"
      | "EDITED_EXISTING_LISTING"
      | "DEFAULT_UNTOUCHED"
    >
  >;
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
