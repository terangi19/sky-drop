/**
 * Āwhina Canonical Type System
 * 
 * Single source of truth for all AI types across the architecture.
 * No duplicates, no adapters, no type casting.
 */

// ============================================================================
// INTENT TYPES
// ============================================================================

export type AwhinaIntent =
  | "navigation"
  | "marketplace_search"
  | "listing_create"
  | "listing_edit"
  | "messaging"
  | "purchase"
  | "profile"
  | "admin"
  | "general_question"
  | "conversation"
  | "unknown";

export type AwhinaConfidence = "high" | "medium" | "low";

// ============================================================================
// ENTITY TYPES
// ============================================================================

export type AwhinaEntityType =
  | "destination"
  | "query"
  | "location"
  | "category"
  | "price"
  | "title"
  | "description"
  | "condition"
  | "vehicle_make"
  | "vehicle_model"
  | "vehicle_year"
  | "vehicle_odometer"
  | "vehicle_colour"
  | "vehicle_body_type"
  | "vehicle_fuel_type"
  | "vehicle_transmission"
  | "listing_id"
  | "username"
  | "listing_type"
  | "payment_type"
  | "rental_price_weekly"
  | "rental_price_monthly"
  | "rental_deposit"
  | "bedrooms"
  | "bathrooms"
  | "parking"
  | "furnished"
  | "pets_policy"
  | "available_from"
  | "minimum_tenancy"
  | "message_recipient"
  | "purchase_id";

export interface AwhinaEntity {
  type: AwhinaEntityType;
  value: string;
  confidence?: number;
}

// ============================================================================
// INTENT RESULT
// ============================================================================

export interface AwhinaIntentResult {
  intent: AwhinaIntent;
  confidence: AwhinaConfidence;
  entities: AwhinaEntity[];
  reasoning: string;
  clarificationQuestion?: string;
}

// ============================================================================
// TOOL TYPES
// ============================================================================

export type AwhinaToolName =
  | "navigate"
  | "searchListings"
  | "createListing"
  | "editListing"
  | "openMessages"
  | "openConversation"
  | "sendMessage"
  | "viewProfile"
  | "adminAction"
  | "naturalConversation"
  | "arrangePurchase"
  | "updateProfile"
  | "voiceSearch"
  | "openCategory"
  | "reply"
  | "confirmAction";

export interface AwhinaToolCall {
  tool: AwhinaToolName;
  args: AwhinaToolArguments;
  confidence?: number;
  reasoning?: string;
}

export type AwhinaToolArguments = {
  navigate?: NavigateArgs;
  searchListings?: SearchListingsArgs;
  createListing?: CreateListingArgs;
  editListing?: EditListingArgs;
  openMessages?: OpenMessagesArgs;
  openConversation?: OpenConversationArgs;
  sendMessage?: SendMessageArgs;
  viewProfile?: ViewProfileArgs;
  adminAction?: AdminActionArgs;
  naturalConversation?: NaturalConversationArgs;
  arrangePurchase?: ArrangePurchaseArgs;
  updateProfile?: UpdateProfileArgs;
  voiceSearch?: VoiceSearchArgs;
  openCategory?: OpenCategoryArgs;
  reply?: ReplyArgs;
  confirmAction?: ConfirmActionArgs;
};

// ============================================================================
// TOOL ARGUMENT TYPES
// ============================================================================

export interface NavigateArgs {
  path: string;
  reason?: string;
}

export interface SearchListingsArgs {
  query: string;
  filters?: {
    maxPrice?: number;
    minPrice?: number;
    location?: string;
    category?: string;
    condition?: string;
  };
}

export interface CreateListingArgs {
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: string;
  location?: string;
  listingType?: string;
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
  bedrooms?: string;
  bathrooms?: string;
  parking?: string;
  furnished?: string;
  petsPolicy?: string;
  availableFrom?: string;
  minimumTenancy?: string;
  [key: string]: string | undefined;
}

export interface EditListingArgs {
  listingId: string;
  updates: Record<string, string>;
}

export interface OpenMessagesArgs {
  conversationId?: string;
  userId?: string;
}

export interface OpenConversationArgs {
  recipientUsername: string;
}

export interface SendMessageArgs {
  conversationId: string;
  message: string;
}

export interface ViewProfileArgs {
  username: string;
}

export interface AdminActionArgs {
  action: string;
  targetId?: string;
  reason?: string;
}

export interface NaturalConversationArgs {
  message: string;
  context?: string;
}

export interface ArrangePurchaseArgs {
  listingId: string;
  method: "pickup" | "shipping";
  location?: string;
}

export interface UpdateProfileArgs {
  field: string;
  value: string;
}

export interface VoiceSearchArgs {
  transcript: string;
}

export interface OpenCategoryArgs {
  category: string;
}

export interface ReplyArgs {
  message: string;
}

export interface ConfirmActionArgs {
  action: string;
  confirmed: boolean;
}

// ============================================================================
// TOOL RESULT TYPES
// ============================================================================

export interface AwhinaToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  navigateTo?: string;
  listingFill?: CreateListingArgs;
  executionTime?: number;
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface AwhinaConversationTurn {
  role: "user" | "assistant";
  content: string;
  intent?: AwhinaIntent;
  entities?: AwhinaEntity[];
  toolCall?: AwhinaToolCall;
  toolResult?: AwhinaToolResult;
  timestamp: number;
}

export interface AwhinaConversationContext {
  currentPath: string;
  hasListingContext: boolean;
  listingContext?: CreateListingArgs;
  isAdmin: boolean;
  userId?: string;
  conversationHistory: AwhinaConversationTurn[];
  // Additional fields for conversation memory
  entities?: Record<string, string>;
  currentIntent?: AwhinaIntent;
  lastToolCall?: AwhinaToolCall;
  startedAt?: number;
  lastActivity?: number;
}

// ============================================================================
// CONFIDENCE EVALUATION TYPES
// ============================================================================

export interface AwhinaConfidenceEvaluation {
  level?: "high" | "medium" | "low";
  score: number;
  reasoning: string;
  clarificationQuestion?: string;
  shouldAskForClarification: boolean;
}

export interface AwhinaConfidenceContext {
  hasConversationHistory: boolean;
  hasListingContext: boolean;
  currentPath: string;
  isAdmin: boolean;
  previousIntent?: AwhinaIntent;
}

// ============================================================================
// AI RESPONSE TYPES
// ============================================================================

export interface AwhinaAIResponse {
  text: string;
  navigateTo?: string;
  listingFill?: CreateListingArgs;
  toolCall?: AwhinaToolCall;
  toolResult?: AwhinaToolResult;
  source: "ai" | "tool" | "rule";
  confidence: number;
}

// ============================================================================
// PERFORMANCE TYPES
// ============================================================================

export type AwhinaRoutingSource = "local" | "cache" | "ai";

export interface AwhinaPerformanceMetrics {
  routingSource: AwhinaRoutingSource;
  cached: boolean;
  executionTime: number;
  intent?: AwhinaIntent;
  tool?: AwhinaToolName;
  confidence?: number;
}

// ============================================================================
// LOGGING TYPES
// ============================================================================

export interface AwhinaLogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface AwhinaRequestLog {
  requestId: string;
  timestamp: number;
  userId?: string;
  message: string;
  context: AwhinaConversationContext;
  intentResult?: AwhinaIntentResult;
  toolCall?: AwhinaToolCall;
  toolResult?: AwhinaToolResult;
  response?: AwhinaAIResponse;
  performanceMetrics: AwhinaPerformanceMetrics;
  success: boolean;
  error?: string;
}

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

export interface AwhinaIntegrationContext {
  pathname: string;
  isAdmin: boolean;
  hasListingContext: boolean;
  listingContext?: CreateListingArgs;
  conversationHistory: AwhinaConversationTurn[];
  uid?: string;
}

export interface AwhinaIntegrationResult {
  action: string;
  data: {
    toolCall?: AwhinaToolCall;
    text?: string;
    navigateTo?: string;
    listingFill?: CreateListingArgs;
  };
  routingMode: AwhinaRoutingSource;
  intent: AwhinaIntent;
  confidence: number;
  usedLocalExecution: boolean;
  executionTime: number;
  clarificationQuestion?: string;
}

// ============================================================================
// SERVER-SIDE INTENT CONTEXT
// ============================================================================

export interface AwhinaServerIntentContext {
  pathname?: string;
  isAdmin?: boolean;
  listingContext?: Record<string, unknown>;
  conversationHistory?: Array<{ role: string; content: string }>;
}
