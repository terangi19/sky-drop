/**
 * Āwhina Local Execution - GPT-Style Architecture
 * 
 * Common commands should never call the AI.
 * These execute immediately with deterministic routing.
 */

import type { AwhinaToolCall, AwhinaToolResult } from "./awhina-tool-registry";

export type LocalCommandResult = {
  handled: boolean;
  toolCall?: AwhinaToolCall;
  reason?: string;
};

/**
 * Local command patterns that should bypass AI
 */
const LOCAL_COMMANDS = {
  // Navigation shortcuts
  home: /^(home|go home|take me home|back to home)$/i,
  sell: /^(sell|go to sell|take me to sell|create listing|new listing|list something|post)$/i,
  sales: /^(sales|my sales|go to sales|take me to sales)$/i,
  messages: /^(messages|go to messages|take me to messages|inbox|open messages|go messages)$/i,
  search: /^(search|go to search|take me to search)$/i,
  watchlist: /^(watchlist|my watchlist|go to watchlist|take me to watchlist|saved|favorites)$/i,
  profile: /^(profile|my profile|go to profile|take me to profile|open profile|account)$/i,
  admin: /^(admin|go to admin|take me to admin|dashboard)$/i,
  vehicles: /^(vehicles?|cars?|open vehicles?|show vehicles?|go to vehicles?|take me to vehicles?)$/i,
  services: /^(services?|open services?|go to services?)$/i,
  rentals: /^(rentals?|open rentals?|go to rentals?)$/i,

  // Voice control
  stopListening: /^(stop listening|stop voice|turn off voice|voice off|exit voice)$/i,
  resumeListening: /^(resume listening|continue listening|keep listening|unpause)$/i,

  // Context actions
  goBack: /^(go back|back|previous|go back a page)$/i,
  refresh: /^(refresh|reload|refresh page)$/i,
  scrollUp: /^(scroll up|page up)$/i,
  scrollDown: /^(scroll down|page down)$/i,
  scrollTop: /^(scroll to top|go to top)$/i,
  scrollBottom: /^(scroll to bottom|go to bottom)$/i,
};

/**
 * Route mappings for local commands
 */
const ROUTE_MAPPINGS: Record<string, string> = {
  home: "/",
  sell: "/post/ai",
  sales: "/sales",
  messages: "/messages",
  search: "/search",
  watchlist: "/watchlist",
  profile: "/profile",
  admin: "/admin",
  vehicles: "/vehicles",
  services: "/services",
  rentals: "/rentals",
};

/**
 * Try to execute a command locally without AI
 * Returns handled=true if command was matched and executed
 */
export function tryLocalExecution(
  message: string,
  currentPath: string = "/"
): LocalCommandResult {
  const trimmed = message.trim();
  if (!trimmed) return { handled: false };

  // Check each local command pattern
  for (const [command, pattern] of Object.entries(LOCAL_COMMANDS)) {
    if (pattern.test(trimmed)) {
      const result = executeLocalCommand(command, currentPath);
      return {
        handled: true,
        toolCall: result.toolCall,
        reason: result.reason,
      };
    }
  }

  // Check if already on the target page
  for (const [command, path] of Object.entries(ROUTE_MAPPINGS)) {
    if (currentPath === path) {
      const pattern = LOCAL_COMMANDS[command as keyof typeof LOCAL_COMMANDS];
      if (pattern && pattern.test(trimmed)) {
        return {
          handled: true,
          reason: `Already on ${command} page`,
        };
      }
    }
  }

  return { handled: false };
}

/**
 * Execute a specific local command
 */
function executeLocalCommand(
  command: string,
  currentPath: string
): { toolCall?: AwhinaToolCall; reason?: string } {
  switch (command) {
    case "home":
    case "sell":
    case "sales":
    case "messages":
    case "search":
    case "watchlist":
    case "profile":
    case "admin":
    case "vehicles":
    case "services":
    case "rentals": {
      const path = ROUTE_MAPPINGS[command];
      if (currentPath === path) {
        return { reason: `Already on ${command} page` };
      }
      return {
        toolCall: {
          tool: "navigate",
          args: { navigate: { path, reason: `Local command: ${command}` } },
          confidence: 1.0,
          reasoning: "Local command execution - no AI needed",
        },
      };
    }

    case "stopListening":
      return {
        toolCall: {
          tool: "confirmAction",
          args: { confirmAction: { action: "stopVoice", confirmed: true } },
          confidence: 1.0,
          reasoning: "Local voice control command",
        },
      };

    case "resumeListening":
      return {
        toolCall: {
          tool: "confirmAction",
          args: { confirmAction: { action: "resumeVoice", confirmed: true } },
          confidence: 1.0,
          reasoning: "Local voice control command",
        },
      };

    case "goBack":
      return {
        toolCall: {
          tool: "navigate",
          args: { navigate: { path: "BACK", reason: "Go back" } },
          confidence: 1.0,
          reasoning: "Local navigation command",
        },
      };

    case "refresh":
      return {
        toolCall: {
          tool: "confirmAction",
          args: { confirmAction: { action: "refresh", confirmed: true } },
          confidence: 1.0,
          reasoning: "Local refresh command",
        },
      };

    case "scrollUp":
      return {
        toolCall: {
          tool: "confirmAction",
          args: { confirmAction: { action: "scrollUp", confirmed: true } },
          confidence: 1.0,
          reasoning: "Local scroll command",
        },
      };

    case "scrollDown":
      return {
        toolCall: {
          tool: "confirmAction",
          args: { confirmAction: { action: "scrollDown", confirmed: true } },
          confidence: 1.0,
          reasoning: "Local scroll command",
        },
      };

    case "scrollTop":
      return {
        toolCall: {
          tool: "confirmAction",
          args: { confirmAction: { action: "scrollTop", confirmed: true } },
          confidence: 1.0,
          reasoning: "Local scroll command",
        },
      };

    case "scrollBottom":
      return {
        toolCall: {
          tool: "confirmAction",
          args: { confirmAction: { action: "scrollBottom", confirmed: true } },
          confidence: 1.0,
          reasoning: "Local scroll command",
        },
      };

    default:
      return { reason: "Unknown local command" };
  }
}

/**
 * Check if a message is likely a local command
 * Fast check without full pattern matching
 */
export function isLikelyLocalCommand(message: string): boolean {
  const trimmed = message.trim().toLowerCase();
  if (!trimmed) return false;

  const words = trimmed.split(/\s+/);
  if (words.length > 5) return false; // Too long for local command

  const firstWord = words[0];
  const localCommandWords = [
    "home", "sell", "sales", "messages", "search", "watchlist", "profile", "admin",
    "stop", "resume", "back", "refresh", "scroll", "go"
  ];

  return localCommandWords.includes(firstWord);
}

/**
 * Get all local command patterns for documentation/testing
 */
export function getLocalCommandPatterns(): Record<string, RegExp> {
  return { ...LOCAL_COMMANDS };
}

/**
 * Cache for frequently used commands
 */
const COMMAND_CACHE = new Map<string, LocalCommandResult>();

/**
 * Try local execution with caching
 */
export function tryLocalExecutionCached(
  message: string,
  currentPath: string = "/"
): LocalCommandResult {
  const cacheKey = `${message}:${currentPath}`;
  
  if (COMMAND_CACHE.has(cacheKey)) {
    return COMMAND_CACHE.get(cacheKey)!;
  }

  const result = tryLocalExecution(message, currentPath);
  
  // Cache successful local commands
  if (result.handled) {
    COMMAND_CACHE.set(cacheKey, result);
    
    // Limit cache size
    if (COMMAND_CACHE.size > 100) {
      const firstKey = COMMAND_CACHE.keys().next().value;
      COMMAND_CACHE.delete(firstKey);
    }
  }

  return result;
}

/**
 * Clear command cache
 */
export function clearCommandCache(): void {
  COMMAND_CACHE.clear();
}
