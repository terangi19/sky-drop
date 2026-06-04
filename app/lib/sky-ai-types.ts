export type SkyAiListingContext = {
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: string;
  listingType?: string;
  location?: string;
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
