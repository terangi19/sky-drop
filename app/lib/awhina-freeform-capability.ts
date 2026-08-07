/**
 * Āwhina free-form language capability — controlled OpenAI after local/tools fail.
 * Re-exports the LLM capability module under the canonical capability name.
 */

export {
  runLlmCapability as runFreeformCapability,
  runLlmCapability,
  shouldUseLlmCapability as shouldUseFreeformCapability,
  freeFormDegradedReply,
  type LlmCapabilityRequest as FreeformCapabilityRequest,
  type LlmCapabilityResult as FreeformCapabilityResult,
  type LlmCapabilityRequest,
  type LlmCapabilityResult,
} from "./awhina-llm-capability";
