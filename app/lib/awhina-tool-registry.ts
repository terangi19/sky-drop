/**
 * Āwhina Tool Registry - GPT-Style Architecture
 * 
 * Defines the structured tools that the AI can call instead of using free-form text.
 * The AI never directly manipulates UI - it selects tools only.
 * The application executes the tools.
 */

import {
  AwhinaToolName,
  AwhinaToolCall,
  AwhinaToolArguments,
  AwhinaToolResult,
  NavigateArgs,
  SearchListingsArgs,
  CreateListingArgs,
  UpdateListingDraftArgs,
  EditListingArgs,
  OpenMessagesArgs,
  OpenConversationArgs,
  SendMessageArgs,
  ViewProfileArgs,
  AdminActionArgs,
  NaturalConversationArgs,
  ArrangePurchaseArgs,
  UpdateProfileArgs,
  VoiceSearchArgs,
  OpenCategoryArgs,
  ReplyArgs,
  ConfirmActionArgs,
} from "./awhina-types";

export type AwhinaToolArgs = AwhinaToolArguments;

/**
 * Tool Registry - defines all available tools with their schemas
 */
export const AWHINA_TOOLS = {
  navigate: {
    name: "navigate",
    description: "Navigate to a specific page in the application",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to navigate to (e.g., '/', '/sell', '/messages', '/profile')",
        },
        reason: {
          type: "string",
          description: "Why this navigation is needed",
        },
      },
      required: ["path"],
    },
  },

  searchListings: {
    name: "searchListings",
    description: "Search for marketplace listings with filters",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query text",
        },
        filters: {
          type: "object",
          properties: {
            maxPrice: { type: "number", description: "Maximum price in NZD" },
            minPrice: { type: "number", description: "Minimum price in NZD" },
            location: { type: "string", description: "Location filter (e.g., 'Auckland')" },
            category: { type: "string", description: "Category filter" },
            condition: { type: "string", description: "Condition filter" },
            make: { type: "string", description: "Vehicle make" },
            model: { type: "string", description: "Vehicle model" },
            year: { type: "number", description: "Vehicle year" },
            minYear: { type: "number", description: "Minimum vehicle year" },
            maxYear: { type: "number", description: "Maximum vehicle year" },
            transmission: { type: "string", description: "Transmission filter" },
          },
        },
      },
      required: ["query"],
    },
  },

  createListing: {
    name: "createListing",
    description: "Create a new marketplace listing",
    parameters: {
      type: "object",
      properties: {
        listingType: {
          type: "string",
          enum: ["physical", "digital", "service", "rental", "vehicle", "wanted"],
          description: "Type of listing to create",
        },
        title: { type: "string", description: "Listing title" },
        description: { type: "string", description: "Listing description" },
        price: { type: "string", description: "Price in NZD" },
        category: { type: "string", description: "Listing category" },
        condition: { type: "string", description: "Item condition" },
        location: { type: "string", description: "Item location" },
        vehicleMake: { type: "string", description: "Vehicle make (for vehicle listings)" },
        vehicleModel: { type: "string", description: "Vehicle model (for vehicle listings)" },
        vehicleYear: { type: "string", description: "Vehicle year (for vehicle listings)" },
        vehicleOdometer: { type: "string", description: "Vehicle odometer (for vehicle listings)" },
        vehicleColour: { type: "string", description: "Vehicle colour (for vehicle listings)" },
        vehicleTransmission: { type: "string", description: "Vehicle transmission (for vehicle listings)" },
        rentalPriceWeekly: { type: "string", description: "Weekly rent (for rental listings)" },
        rentalPriceMonthly: { type: "string", description: "Monthly rent (for rental listings)" },
        rentalDeposit: { type: "string", description: "Rental deposit (for rental listings)" },
        rentalBedrooms: { type: "string", description: "Number of bedrooms (for rental listings)" },
        rentalBathrooms: { type: "string", description: "Number of bathrooms (for rental listings)" },
        serviceDuration: { type: "string", description: "Service duration (for service listings)" },
        paymentType: {
          type: "string",
          enum: ["fixed_price", "quote_required"],
          description: "Payment type (for digital listings)",
        },
      },
      required: ["listingType"],
    },
  },

  updateListingDraft: {
    name: "updateListingDraft",
    description: "Partially update the active sell listing draft (only provided fields change)",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        subcategory: { type: "string" },
        price: { type: "string" },
        condition: { type: "string", enum: ["New", "Used - Like New", "Used - Good", "Used - Fair"] },
        location: { type: "string" },
        pickupAvailable: { type: "boolean" },
        shippingAvailable: { type: "boolean" },
        keywords: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
      },
    },
  },

  editListing: {
    name: "editListing",
    description: "Edit an existing listing",
    parameters: {
      type: "object",
      properties: {
        listingId: {
          type: "string",
          description: "ID of the listing to edit",
        },
        updates: {
          type: "object",
          description: "Fields to update with their new values",
        },
      },
      required: ["listingId", "updates"],
    },
  },

  openMessages: {
    name: "openMessages",
    description: "Open the messages interface",
    parameters: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "Specific conversation ID to open",
        },
        userId: {
          type: "string",
          description: "User ID to start conversation with",
        },
      },
    },
  },

  sendMessage: {
    name: "sendMessage",
    description: "Send a message in a conversation",
    parameters: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "Conversation ID to send message to",
        },
        message: {
          type: "string",
          description: "Message content",
        },
      },
      required: ["conversationId", "message"],
    },
  },

  arrangePurchase: {
    name: "arrangePurchase",
    description: "Arrange purchase delivery/pickup",
    parameters: {
      type: "object",
      properties: {
        listingId: {
          type: "string",
          description: "Listing ID being purchased",
        },
        method: {
          type: "string",
          enum: ["pickup", "shipping"],
          description: "Delivery method",
        },
        location: {
          type: "string",
          description: "Pickup location (if pickup method)",
        },
      },
      required: ["listingId", "method"],
    },
  },

  updateProfile: {
    name: "updateProfile",
    description: "Update user profile information",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description: "Profile field to update",
        },
        value: {
          type: "string",
          description: "New value for the field",
        },
      },
      required: ["field", "value"],
    },
  },

  voiceSearch: {
    name: "voiceSearch",
    description: "Process voice transcript for search",
    parameters: {
      type: "object",
      properties: {
        transcript: {
          type: "string",
          description: "Voice transcript to process",
        },
      },
      required: ["transcript"],
    },
  },

  openCategory: {
    name: "openCategory",
    description: "Open a specific category page",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Category to open",
        },
      },
      required: ["category"],
    },
  },

  reply: {
    name: "reply",
    description: "Send a text reply to the user",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Reply message",
        },
      },
      required: ["message"],
    },
  },

  confirmAction: {
    name: "confirmAction",
    description: "Confirm or reject a pending action",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action being confirmed",
        },
        confirmed: {
          type: "boolean",
          description: "True to confirm, false to reject",
        },
      },
      required: ["action", "confirmed"],
    },
  },
} as const;

const READ_ONLY_TOOLS = new Set<AwhinaToolName>([
  "navigate",
  "searchListings",
  "openMessages",
  "openConversation",
  "viewProfile",
  "voiceSearch",
  "openCategory",
  "reply",
  "naturalConversation",
]);

const STATE_CHANGING_TOOLS = new Set<AwhinaToolName>([
  "createListing",
  "updateListingDraft",
  "editListing",
  "sendMessage",
  "arrangePurchase",
  "updateProfile",
  "adminAction",
  "confirmAction",
]);

export function isStateChangingTool(toolCall: Pick<AwhinaToolCall, "tool">): boolean {
  return STATE_CHANGING_TOOLS.has(toolCall.tool);
}

export function isReadOnlyTool(toolCall: Pick<AwhinaToolCall, "tool">): boolean {
  return READ_ONLY_TOOLS.has(toolCall.tool);
}

export type ToolValidationResult =
  | { ok: true; toolCall: AwhinaToolCall }
  | { ok: false; error: string };

/** Validate tool name + required args. Never invent missing IDs. */
export function validateToolCall(toolCall: AwhinaToolCall | null | undefined): ToolValidationResult {
  if (!toolCall || !toolCall.tool) {
    return { ok: false, error: "Missing tool call" };
  }
  if (!(toolCall.tool in AWHINA_TOOLS) && !["openConversation", "viewProfile", "adminAction", "naturalConversation"].includes(toolCall.tool)) {
    return { ok: false, error: `Unknown tool: ${toolCall.tool}` };
  }
  const args = toolCall.args || {};
  switch (toolCall.tool) {
    case "navigate": {
      const path = args.navigate?.path;
      if (!path || typeof path !== "string") return { ok: false, error: "navigate requires path" };
      if (path !== "BACK" && !path.startsWith("/")) return { ok: false, error: "navigate path must start with /" };
      break;
    }
    case "searchListings": {
      if (typeof args.searchListings?.query !== "string") {
        return { ok: false, error: "searchListings requires query string" };
      }
      break;
    }
    case "createListing": {
      const cl = args.createListing;
      if (!cl || typeof cl !== "object") return { ok: false, error: "createListing requires args" };
      if (cl.listingType) {
        const allowed = new Set(["physical", "digital", "service", "rental", "vehicle", "wanted"]);
        if (!allowed.has(String(cl.listingType).toLowerCase())) {
          return { ok: false, error: `Invalid listingType: ${cl.listingType}` };
        }
      }
      if (cl.price !== undefined && cl.price !== "") {
        const p = String(cl.price).replace(/,/g, "").trim();
        if (!/^\d+(\.\d{1,2})?$/.test(p) || Number(p) < 0 || Number(p) > 10_000_000) {
          return { ok: false, error: "Invalid listing price" };
        }
      }
      break;
    }
    case "updateListingDraft": {
      const u = args.updateListingDraft;
      if (!u || typeof u !== "object") return { ok: false, error: "updateListingDraft requires args" };
      const keys = Object.keys(u);
      if (keys.length === 0) return { ok: false, error: "updateListingDraft requires at least one field" };
      if (u.price !== undefined && u.price !== "") {
        const p = String(u.price).replace(/,/g, "").trim();
        if (!/^\d+(\.\d{1,2})?$/.test(p) || Number(p) < 0 || Number(p) > 10_000_000) {
          return { ok: false, error: "Invalid listing price" };
        }
      }
      if (u.condition) {
        const allowed = new Set(["New", "Used - Like New", "Used - Good", "Used - Fair"]);
        if (!allowed.has(String(u.condition))) {
          return { ok: false, error: `Invalid condition: ${u.condition}` };
        }
      }
      break;
    }
    case "editListing": {
      if (!args.editListing?.listingId || !args.editListing?.updates) {
        return { ok: false, error: "editListing requires listingId and updates" };
      }
      break;
    }
    case "sendMessage": {
      if (!args.sendMessage?.conversationId || !args.sendMessage?.message) {
        return { ok: false, error: "sendMessage requires conversationId and message" };
      }
      break;
    }
    case "arrangePurchase": {
      if (!args.arrangePurchase?.listingId || !args.arrangePurchase?.method) {
        return { ok: false, error: "arrangePurchase requires listingId and method" };
      }
      break;
    }
    case "updateProfile": {
      if (!args.updateProfile?.field || args.updateProfile.value === undefined) {
        return { ok: false, error: "updateProfile requires field and value" };
      }
      // Allowlist only — never admin/verification/ratings/trust/uid/role
      const field = String(args.updateProfile.field).trim();
      const ALLOWED = new Set([
        "username",
        "bio",
        "region",
        "discord",
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "website",
        "businessName",
        "favouriteCategories",
      ]);
      const FORBIDDEN = new Set([
        "admin",
        "role",
        "verified",
        "verification",
        "trust",
        "rating",
        "ratings",
        "reviews",
        "uid",
        "userId",
        "permissions",
        "isAdmin",
        "kyc",
      ]);
      if (FORBIDDEN.has(field.toLowerCase()) || !ALLOWED.has(field)) {
        return { ok: false, error: `updateProfile field not allowlisted: ${field}` };
      }
      if (typeof args.updateProfile.value !== "string" && typeof args.updateProfile.value !== "number") {
        return { ok: false, error: "updateProfile value must be a string" };
      }
      break;
    }
    case "openCategory": {
      if (!args.openCategory?.category) return { ok: false, error: "openCategory requires category" };
      break;
    }
    case "reply": {
      if (!args.reply?.message) return { ok: false, error: "reply requires message" };
      break;
    }
    case "confirmAction": {
      if (!args.confirmAction?.action || typeof args.confirmAction.confirmed !== "boolean") {
        return { ok: false, error: "confirmAction requires action and confirmed" };
      }
      break;
    }
    default:
      break;
  }
  return { ok: true, toolCall };
}

/**
 * Execute a tool call (server-safe: returns navigateTo / data — no window mutation).
 */
export async function executeToolCall(
  toolCall: AwhinaToolCall
): Promise<AwhinaToolResult> {
  const startTime = Date.now();
  const validated = validateToolCall(toolCall);
  if (!validated.ok) {
    return { success: false, error: validated.error, executionTime: Date.now() - startTime };
  }

  try {
    switch (toolCall.tool) {
      case "navigate":
        return await executeNavigate(toolCall.args.navigate!);
      case "searchListings":
        return await executeSearchListings(toolCall.args.searchListings!);
      case "createListing":
        return await executeCreateListing(toolCall.args.createListing!);
      case "updateListingDraft":
        return await executeUpdateListingDraft(toolCall.args.updateListingDraft!);
      case "editListing":
        return await executeEditListing(toolCall.args.editListing!);
      case "openMessages":
        return await executeOpenMessages(toolCall.args.openMessages || {});
      case "sendMessage":
        return await executeSendMessage(toolCall.args.sendMessage!);
      case "arrangePurchase":
        return await executeArrangePurchase(toolCall.args.arrangePurchase!);
      case "updateProfile":
        return await executeUpdateProfile(toolCall.args.updateProfile!);
      case "voiceSearch":
        return await executeVoiceSearch(toolCall.args.voiceSearch!);
      case "openCategory":
        return await executeOpenCategory(toolCall.args.openCategory!);
      case "reply":
        return await executeReply(toolCall.args.reply!);
      case "confirmAction":
        return await executeConfirmAction(toolCall.args.confirmAction!);
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolCall.tool}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Tool execution implementations
 * These are placeholders - actual implementations will integrate with existing systems
 */

async function executeNavigate(args: NavigateArgs): Promise<AwhinaToolResult> {
  // Server-safe: callers perform navigation from navigateTo
  return {
    success: true,
    data: { navigatedTo: args.path },
    navigateTo: args.path,
    executionTime: 0,
  };
}

async function executeSearchListings(args: SearchListingsArgs): Promise<AwhinaToolResult> {
  const params = new URLSearchParams();
  if (args.query) params.set("q", args.query);
  if (args.filters) {
    Object.entries(args.filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    });
  }
  const searchPath = `/search?${params.toString()}`;
  return {
    success: true,
    data: { searchPath, query: args.query, filters: args.filters },
    navigateTo: searchPath,
    executionTime: 0,
  };
}

async function executeCreateListing(args: CreateListingArgs): Promise<AwhinaToolResult> {
  // Integrate with existing listing creation logic
  return {
    success: true,
    data: { message: "Navigate to sell page with pre-filled data" },
    listingFill: args,
    navigateTo: "/post/ai",
    executionTime: 0,
  };
}

async function executeUpdateListingDraft(args: UpdateListingDraftArgs): Promise<AwhinaToolResult> {
  const listingFill: CreateListingArgs = {};
  if (args.title) listingFill.title = args.title;
  if (args.description) listingFill.description = args.description;
  if (args.category) listingFill.category = args.category;
  if (args.price) listingFill.price = args.price;
  if (args.condition) listingFill.condition = args.condition;
  if (args.location) listingFill.location = args.location;
  if (typeof args.pickupAvailable === "boolean") {
    (listingFill as Record<string, string | undefined>).pickupAvailable = args.pickupAvailable
      ? "true"
      : "false";
  }
  if (typeof args.shippingAvailable === "boolean") {
    (listingFill as Record<string, string | undefined>).shippingAvailable = args.shippingAvailable
      ? "true"
      : "false";
  }
  const tags = args.keywords || args.tags;
  return {
    success: true,
    data: {
      partial: true,
      updates: args,
      extras: tags,
      pickupAvailable: args.pickupAvailable,
      shippingAvailable: args.shippingAvailable,
    },
    listingFill,
    executionTime: 0,
  };
}

async function executeEditListing(args: EditListingArgs): Promise<AwhinaToolResult> {
  // Integrate with existing listing edit logic
  return {
    success: true,
    data: { listingId: args.listingId, updates: args.updates },
    executionTime: 0,
  };
}

async function executeOpenMessages(args: OpenMessagesArgs): Promise<AwhinaToolResult> {
  return {
    success: true,
    data: { opened: args.conversationId || "messages" },
    navigateTo: "/messages",
    executionTime: 0,
  };
}

async function executeSendMessage(args: SendMessageArgs): Promise<AwhinaToolResult> {
  // Integrate with existing message sending logic
  return {
    success: true,
    data: { conversationId: args.conversationId },
    executionTime: 0,
  };
}

async function executeArrangePurchase(args: ArrangePurchaseArgs): Promise<AwhinaToolResult> {
  // Integrate with existing purchase arrangement logic
  return {
    success: true,
    data: { listingId: args.listingId, method: args.method },
    executionTime: 0,
  };
}

async function executeUpdateProfile(args: UpdateProfileArgs): Promise<AwhinaToolResult> {
  // Integrate with existing profile logic
  return {
    success: true,
    data: { field: args.field, value: args.value },
    executionTime: 0,
  };
}

async function executeVoiceSearch(args: VoiceSearchArgs): Promise<AwhinaToolResult> {
  // Integrate with existing voice search logic
  return {
    success: true,
    data: { transcript: args.transcript },
    executionTime: 0,
  };
}

async function executeOpenCategory(args: OpenCategoryArgs): Promise<AwhinaToolResult> {
  // Integrate with existing category logic
  return {
    success: true,
    navigateTo: `/search?category=${args.category}`,
    executionTime: 0,
  };
}

async function executeReply(args: ReplyArgs): Promise<AwhinaToolResult> {
  // Integrate with existing reply logic
  return {
    success: true,
    data: { message: args.message },
    executionTime: 0,
  };
}

async function executeConfirmAction(args: ConfirmActionArgs): Promise<AwhinaToolResult> {
  // Integrate with existing confirmation logic
  return {
    success: true,
    data: { action: args.action, confirmed: args.confirmed },
    executionTime: 0,
  };
}

// Export types for other modules
export type { AwhinaToolCall, AwhinaToolResult } from "./awhina-types";
