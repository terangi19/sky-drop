/**
 * Āwhina general language-reasoning capability (controlled OpenAI).
 *
 * Used ONLY when local/canonical cannot resolve intent, OR for NL help / semantic needs.
 * Returns structured tool calls → validate → execute. Never regex-parse AI prose for actions.
 * Single model call (no separate intent classifier) to avoid duplicate latency/tokens.
 */

import OpenAI from "openai";
import {
  type AwhinaToolCall,
  type AwhinaToolName,
  type AwhinaToolArguments,
} from "./awhina-types";
import { AWHINA_TOOLS, validateToolCall, isStateChangingTool } from "./awhina-tool-registry";
import {
  type AwhinaConfidenceLevel,
  normalizeConfidenceLevel,
  gateByConfidence,
  confidenceLevelToScore,
  isDestructiveTool,
} from "./awhina-confidence-levels";
import { awhinaPersonalityPromptBlock, awhinaCapabilitiesReply } from "./awhina-personality";
import { openaiErrorResponse } from "./openai-errors";
import { recordAwhinaObs } from "./awhina-observability";
import { getGuideReply } from "./guide-assistant";
import { isSkyAiGeneralQuestion } from "./sky-ai-prompts";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiProfileFill } from "./sky-ai-profile-fill";
import { validateListingFillFields } from "./awhina-listing-fill-tools";
import { sanitizeProfileFillProposal } from "./awhina-profile-tools";

export type LlmCapabilityRequest = {
  message: string;
  pathname?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  listingContext?: SkyAiListingContext | null;
  isAdmin?: boolean;
};

export type LlmCapabilityResult = {
  ok: boolean;
  reply: string;
  navigateTo?: string;
  listingFill?: SkyAiListingFill;
  profileFill?: SkyAiProfileFill;
  toolCall?: AwhinaToolCall;
  confidence: AwhinaConfidenceLevel;
  degraded?: boolean;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  clarification?: boolean;
  errorCode?: string;
  routing: "llm_capability";
};

const SYSTEM = `You are Āwhina, Sky Drop's NZ marketplace assistant.

${awhinaPersonalityPromptBlock()}

You MUST use function calls for any action (navigate, search, listing draft, profile, messages).
Use the "reply" tool for text-only help that needs no action.
Never invent listings, sellers, prices, ratings, availability, messages, or policies.
Buying is messaging-first: Browse → Listing → Message Seller — never pitch Buy Now, Stripe Checkout, escrow, or buyer protection as how V1 buying works.
If unsure about a state-changing action, ask one clarification via the reply tool — do not guess.
Destructive / admin actions require confirmation — use confirmAction only when the user already confirmed.
Return function calls only when acting; keep reply text concise NZ English.`;

function openAiFunctions() {
  return Object.values(AWHINA_TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

function parseToolArgs(
  name: string,
  rawArgs: string
): { tool: AwhinaToolName; args: AwhinaToolArguments; confidence?: number } | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    return null;
  }

  const tool = name as AwhinaToolName;
  // Models often return flat args; registry expects nested { [tool]: args }
  const nested: AwhinaToolArguments = {};
  if (parsed[tool] && typeof parsed[tool] === "object") {
    (nested as Record<string, unknown>)[tool] = parsed[tool];
  } else {
    (nested as Record<string, unknown>)[tool] = parsed;
  }

  const confRaw = parsed.confidence;
  const confidence =
    typeof confRaw === "number"
      ? confRaw
      : typeof confRaw === "string"
        ? confidenceLevelToScore(normalizeConfidenceLevel(confRaw))
        : 0.75;

  return { tool, args: nested, confidence };
}

function toolCallToListingFill(toolCall: AwhinaToolCall): SkyAiListingFill | undefined {
  if (toolCall.tool === "createListing" && toolCall.args.createListing) {
    return { ...toolCall.args.createListing } as SkyAiListingFill;
  }
  if (toolCall.tool === "updateListingDraft" && toolCall.args.updateListingDraft) {
    const u = toolCall.args.updateListingDraft;
    const fill: SkyAiListingFill = {};
    if (u.title) fill.title = u.title;
    if (u.description) fill.description = u.description;
    if (u.category) fill.category = u.category;
    if (u.price) fill.price = u.price;
    if (u.condition) fill.condition = u.condition;
    if (u.location) fill.location = u.location;
    if (typeof u.pickupAvailable === "boolean") fill.pickupAvailable = u.pickupAvailable;
    if (typeof u.shippingAvailable === "boolean") fill.shippingAvailable = u.shippingAvailable;
    if (u.keywords?.length) fill.extras = u.keywords.map((k) => `kw:${k}`);
    return fill;
  }
  return undefined;
}

function toolCallToProfileFill(toolCall: AwhinaToolCall): SkyAiProfileFill | undefined {
  if (toolCall.tool !== "updateProfile" || !toolCall.args.updateProfile) return undefined;
  const { field, value } = toolCall.args.updateProfile;
  if (!field || value === undefined) return undefined;
  return { [field]: value } as SkyAiProfileFill;
}

function toolCallToNavigate(toolCall: AwhinaToolCall): string | undefined {
  if (toolCall.tool === "navigate") return toolCall.args.navigate?.path;
  if (toolCall.tool === "openMessages") return "/messages";
  if (toolCall.tool === "openCategory") {
    const c = toolCall.args.openCategory?.category?.toLowerCase() || "";
    if (c.includes("vehicle") || c.includes("car")) return "/vehicles";
    if (c.includes("service")) return "/services";
    if (c.includes("rental")) return "/rentals";
    if (c.includes("digital")) return "/digital";
    return "/";
  }
  if (toolCall.tool === "searchListings") {
    const q = toolCall.args.searchListings?.query || "";
    const filters = toolCall.args.searchListings?.filters || {};
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
    if (filters.minPrice != null) params.set("minPrice", String(filters.minPrice));
    if (filters.location) params.set("location", filters.location);
    if (filters.category) params.set("category", filters.category);
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }
  if (toolCall.tool === "arrangePurchase") return "/messages";
  return undefined;
}

function toolCallToReply(toolCall: AwhinaToolCall, textFallback?: string): string {
  if (toolCall.tool === "reply" && toolCall.args.reply?.message) {
    return toolCall.args.reply.message;
  }
  if (toolCall.tool === "naturalConversation" && toolCall.args.naturalConversation?.message) {
    return toolCall.args.naturalConversation.message;
  }
  if (toolCall.tool === "arrangePurchase") {
    return "Message the seller and arrange payment/pickup in **Messages**. Sky Drop V1 is messaging-first — no Buy Now checkout.";
  }
  if (toolCall.tool === "navigate") {
    return `Taking you there now.`;
  }
  if (toolCall.tool === "searchListings") {
    const q = toolCall.args.searchListings?.query || "listings";
    return `Searching for **${q}**.`;
  }
  if (toolCall.tool === "createListing" || toolCall.tool === "updateListingDraft") {
    const title =
      toolCall.args.createListing?.title || toolCall.args.updateListingDraft?.title || "your listing";
    return `Updated your listing draft — **${title}**. Add photos, then hit **Publish**.`;
  }
  if (toolCall.tool === "updateProfile") {
    return `Updated your profile **${toolCall.args.updateProfile?.field}**.`;
  }
  if (toolCall.tool === "confirmAction") {
    return toolCall.args.confirmAction?.confirmed
      ? "Confirmed."
      : "Okay, cancelled.";
  }
  return textFallback || "Done.";
}

export function freeFormDegradedReply(message: string, pathname: string): string {
  if (isSkyAiGeneralQuestion(message)) return awhinaCapabilitiesReply();
  const guide = getGuideReply(message, pathname);
  return (
    guide.text ||
    "Āwhina's language helper is temporarily unavailable. Try **Find something**, **Sell something**, or **Help me navigate** — those still work locally."
  );
}

/**
 * Should this message hit the LLM capability?
 * Prefer local/canonical first — caller only invokes this when canonical.handled === false.
 */
export function shouldUseLlmCapability(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  // Pure nav / known short commands should never reach here if canonical worked;
  // still guard against accidental LLM for ultra-short nav tokens.
  if (/^(home|messages?|sell|profile|back|vehicles?|services?|rentals?|digital)$/i.test(t)) {
    return false;
  }
  return true;
}

export async function runLlmCapability(
  request: LlmCapabilityRequest
): Promise<LlmCapabilityResult> {
  const start = Date.now();
  const pathname = request.pathname || "/";
  const message = request.message.trim();

  if (!shouldUseLlmCapability(message)) {
    const reply = freeFormDegradedReply(message, pathname);
    return {
      ok: true,
      reply,
      confidence: "HIGH",
      latencyMs: Date.now() - start,
      routing: "llm_capability",
      clarification: false,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const reply = freeFormDegradedReply(message, pathname);
    recordAwhinaObs({
      intent: "free_form",
      localVsAi: "ai",
      capability: "free_form",
      success: false,
      latencyMs: Date.now() - start,
      clarification: false,
      pathname,
      aiFail: true,
      degraded: true,
    });
    return {
      ok: false,
      reply,
      confidence: "LOW",
      degraded: true,
      latencyMs: Date.now() - start,
      errorCode: "missing_openai_key",
      routing: "llm_capability",
    };
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM },
    ];

    if (request.history?.length) {
      for (const h of request.history.slice(-6)) {
        messages.push({ role: h.role, content: h.content.slice(0, 1500) });
      }
    }

    let contextInfo = `\nCurrent page: ${pathname}`;
    if (request.isAdmin) contextInfo += "\nUser has admin access";
    if (request.listingContext && Object.keys(request.listingContext).length > 0) {
      contextInfo += "\nUser has an active listing draft";
    }

    messages.push({
      role: "user",
      content: `${message}${contextInfo}`,
    });

    // Single call — function calling only (no prior intent classification)
    const completion = await openai.chat.completions.create({
      model,
      messages,
      functions: openAiFunctions(),
      function_call: "auto",
      temperature: 0.3,
      max_tokens: 900,
    });

    const promptTokens = completion.usage?.prompt_tokens;
    const completionTokens = completion.usage?.completion_tokens;
    const choice = completion.choices[0];
    const functionCall = choice?.message?.function_call;
    const content = choice?.message?.content?.trim();

    if (functionCall?.name && functionCall.arguments) {
      const parsed = parseToolArgs(functionCall.name, functionCall.arguments);
      if (!parsed) {
        recordAwhinaObs({
          intent: "free_form",
          localVsAi: "ai",
          capability: "free_form",
          success: false,
          latencyMs: Date.now() - start,
          clarification: true,
          pathname,
          promptTokens,
          completionTokens,
          aiFail: true,
        });
        return {
          ok: false,
          reply: "Could you rephrase that? I want to make sure I get the action right.",
          confidence: "LOW",
          latencyMs: Date.now() - start,
          promptTokens,
          completionTokens,
          clarification: true,
          errorCode: "tool_parse_failed",
          routing: "llm_capability",
        };
      }

      const toolCall: AwhinaToolCall = {
        tool: parsed.tool,
        args: parsed.args,
        confidence: parsed.confidence,
      };

      const validated = validateToolCall(toolCall);
      if (!validated.ok) {
        return {
          ok: false,
          reply: `I need a bit more detail — ${validated.error}`,
          confidence: "LOW",
          latencyMs: Date.now() - start,
          promptTokens,
          completionTokens,
          clarification: true,
          errorCode: "tool_validation_failed",
          routing: "llm_capability",
        };
      }

      const level = normalizeConfidenceLevel(parsed.confidence ?? 0.75);
      const gate = gateByConfidence(validated.toolCall, level);

      if (gate.needsConfirmation || isDestructiveTool(validated.toolCall)) {
        recordAwhinaObs({
          intent: "free_form",
          localVsAi: "ai",
          capability: "free_form",
          tool: validated.toolCall.tool,
          success: true,
          latencyMs: Date.now() - start,
          clarification: true,
          pathname,
          promptTokens,
          completionTokens,
        });
        return {
          ok: true,
          reply: `Just to confirm — you want me to run **${validated.toolCall.tool}**? Reply **yes** to confirm.`,
          toolCall: validated.toolCall,
          confidence: level,
          latencyMs: Date.now() - start,
          promptTokens,
          completionTokens,
          clarification: true,
          routing: "llm_capability",
        };
      }

      if (gate.needsClarification) {
        recordAwhinaObs({
          intent: "free_form",
          localVsAi: "ai",
          capability: "free_form",
          tool: validated.toolCall.tool,
          success: true,
          latencyMs: Date.now() - start,
          clarification: true,
          pathname,
          promptTokens,
          completionTokens,
        });
        return {
          ok: true,
          reply: "Could you clarify what you'd like me to do? One short sentence is enough.",
          toolCall: validated.toolCall,
          confidence: level,
          latencyMs: Date.now() - start,
          promptTokens,
          completionTokens,
          clarification: true,
          routing: "llm_capability",
        };
      }

      let listingFill = toolCallToListingFill(validated.toolCall);
      if (listingFill) {
        const v = validateListingFillFields(listingFill);
        listingFill = v.ok ? v.fill : undefined;
      }

      let profileFill = toolCallToProfileFill(validated.toolCall);
      if (profileFill) {
        const s = sanitizeProfileFillProposal(profileFill);
        profileFill = s.ok ? s.fill : undefined;
      }

      const navigateTo = toolCallToNavigate(validated.toolCall);
      const reply = toolCallToReply(validated.toolCall, content);

      recordAwhinaObs({
        intent: "free_form",
        localVsAi: "ai",
        capability: "free_form",
        tool: validated.toolCall.tool,
        success: true,
        latencyMs: Date.now() - start,
        clarification: false,
        pathname,
        promptTokens,
        completionTokens,
        stateChanging: isStateChangingTool(validated.toolCall),
      });

      return {
        ok: true,
        reply,
        navigateTo,
        listingFill,
        profileFill,
        toolCall: validated.toolCall,
        confidence: level,
        latencyMs: Date.now() - start,
        promptTokens,
        completionTokens,
        routing: "llm_capability",
      };
    }

    // Text-only response — treat as reply tool, never regex-parse for LISTING_FILL / NAV
    const reply =
      content ||
      "I'm not sure how to help with that. Try **sell**, **find [item]**, or **messages**.";

    recordAwhinaObs({
      intent: "free_form",
      localVsAi: "ai",
      capability: "free_form",
      tool: "reply",
      success: true,
      latencyMs: Date.now() - start,
      clarification: false,
      pathname,
      promptTokens,
      completionTokens,
    });

    return {
      ok: true,
      reply,
      confidence: "MEDIUM",
      latencyMs: Date.now() - start,
      promptTokens,
      completionTokens,
      routing: "llm_capability",
      toolCall: {
        tool: "reply",
        args: { reply: { message: reply } },
        confidence: 0.7,
      },
    };
  } catch (err) {
    const mapped = openaiErrorResponse(err);
    const reply = freeFormDegradedReply(message, pathname);
    recordAwhinaObs({
      intent: "free_form",
      localVsAi: "ai",
      capability: "free_form",
      success: false,
      latencyMs: Date.now() - start,
      clarification: false,
      pathname,
      aiFail: true,
      degraded: true,
    });
    return {
      ok: false,
      reply,
      confidence: "LOW",
      degraded: true,
      latencyMs: Date.now() - start,
      errorCode: mapped.code,
      routing: "llm_capability",
    };
  }
}
