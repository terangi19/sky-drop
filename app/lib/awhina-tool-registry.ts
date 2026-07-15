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

/**
 * Execute a tool call
 * This is the actual execution layer - the AI selects tools, the app executes them
 */
export async function executeToolCall(
  toolCall: AwhinaToolCall
): Promise<AwhinaToolResult> {
  const startTime = Date.now();

  try {
    switch (toolCall.tool) {
      case "navigate":
        return await executeNavigate(toolCall.args.navigate!);
      case "searchListings":
        return await executeSearchListings(toolCall.args.searchListings!);
      case "createListing":
        return await executeCreateListing(toolCall.args.createListing!);
      case "editListing":
        return await executeEditListing(toolCall.args.editListing!);
      case "openMessages":
        return await executeOpenMessages(toolCall.args.openMessages!);
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
  // Integrate with existing navigation logic
  if (typeof window !== "undefined") {
    window.location.href = args.path;
  }
  return {
    success: true,
    data: { navigatedTo: args.path },
    navigateTo: args.path,
    executionTime: 0,
  };
}

async function executeSearchListings(args: SearchListingsArgs): Promise<AwhinaToolResult> {
  // Integrate with existing search logic
  const params = new URLSearchParams({ q: args.query });
  if (args.filters) {
    Object.entries(args.filters).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
  }
  const searchPath = `/search?${params.toString()}`;
  
  if (typeof window !== "undefined") {
    window.location.href = searchPath;
  }
  
  return {
    success: true,
    data: { searchPath },
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

async function executeEditListing(args: EditListingArgs): Promise<AwhinaToolResult> {
  // Integrate with existing listing edit logic
  return {
    success: true,
    data: { listingId: args.listingId, updates: args.updates },
    executionTime: 0,
  };
}

async function executeOpenMessages(args: OpenMessagesArgs): Promise<AwhinaToolResult> {
  // Integrate with existing messages logic
  if (typeof window !== "undefined") {
    window.location.href = "/messages";
  }
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
