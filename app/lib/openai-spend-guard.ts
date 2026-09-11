/**
 * Server-side OpenAI spend choke point.
 *
 * Every billed OpenAI call must go through `gateOpenAiCall` / `createGatedOpenAI`.
 * Do not use `openai-spend-caps.ts` (client localStorage stub).
 * Never import this module from Client Components.
 */

import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import OpenAI from "openai";
import { checkSpendingLimits, recordSpending } from "./openai-spending";

export const OPENAI_BUDGET_EXCEEDED_CODE = "openai_budget_exceeded" as const;
export const OPENAI_DISABLED_CODE = "openai_disabled" as const;
export const OPENAI_SPEND_BLOCKED_STATUS = 503;

export type OpenAiSpendBlockCode =
  | typeof OPENAI_BUDGET_EXCEEDED_CODE
  | typeof OPENAI_DISABLED_CODE;

export type OpenAiSpendContext = {
  uid: string | null;
  ip: string;
};

export type OpenAiSpendGateResult = {
  allowed: boolean;
  code?: OpenAiSpendBlockCode;
  reason?: string;
  userMessage: string;
};

const spendAls = new AsyncLocalStorage<OpenAiSpendContext>();

const BUDGET_USER_MESSAGE =
  "Āwhina AI is in limited mode because the OpenAI budget has been reached. You can keep using the app without AI.";
const DISABLED_USER_MESSAGE = "Āwhina AI is temporarily paused.";

export class OpenAiSpendBlockedError extends Error {
  readonly code: OpenAiSpendBlockCode;
  readonly status = OPENAI_SPEND_BLOCKED_STATUS;
  readonly reason?: string;
  readonly userMessage: string;

  constructor(gate: OpenAiSpendGateResult) {
    super(gate.userMessage);
    this.name = "OpenAiSpendBlockedError";
    this.code = gate.code || OPENAI_BUDGET_EXCEEDED_CODE;
    this.reason = gate.reason;
    this.userMessage = gate.userMessage;
  }
}

export function isOpenAiSpendBlockedError(err: unknown): err is OpenAiSpendBlockedError {
  if (err instanceof OpenAiSpendBlockedError) return true;
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === OPENAI_BUDGET_EXCEEDED_CODE || code === OPENAI_DISABLED_CODE;
}

/** Kill switch. Unset / empty = enabled. `false` / `0` / `off` / `no` disables billed calls. */
export function isOpenAiEnabled(): boolean {
  const raw = process.env.OPENAI_ENABLED;
  if (raw == null || String(raw).trim() === "") return true;
  return !/^(0|false|off|no|disabled)$/i.test(String(raw).trim());
}

export function getOpenAiSpendContext(): OpenAiSpendContext {
  return spendAls.getStore() || { uid: null, ip: "unknown" };
}

export function withOpenAiSpendContext<T>(
  ctx: OpenAiSpendContext,
  fn: () => T | Promise<T>
): Promise<T> {
  return Promise.resolve(spendAls.run(ctx, fn));
}

export function spendBlockedPayload(gate: OpenAiSpendGateResult): {
  error: string;
  code: OpenAiSpendBlockCode;
  reason?: string;
  fallbackReason?: string;
} {
  return {
    error: gate.userMessage,
    code: gate.code || OPENAI_BUDGET_EXCEEDED_CODE,
    reason: gate.reason,
    fallbackReason: gate.reason || gate.code,
  };
}

export async function checkOpenAiSpendGate(
  uid?: string | null,
  ip?: string
): Promise<OpenAiSpendGateResult> {
  if (!isOpenAiEnabled()) {
    return {
      allowed: false,
      code: OPENAI_DISABLED_CODE,
      reason: "OPENAI_ENABLED is false",
      userMessage: DISABLED_USER_MESSAGE,
    };
  }

  const ctx = getOpenAiSpendContext();
  const resolvedUid = uid === undefined ? ctx.uid : uid;
  const resolvedIp = ip || ctx.ip || "unknown";

  try {
    const result = await checkSpendingLimits(resolvedUid, resolvedIp);
    if (!result.allowed) {
      return {
        allowed: false,
        code: OPENAI_BUDGET_EXCEEDED_CODE,
        reason: result.reason || "OpenAI spend limit exceeded",
        userMessage: BUDGET_USER_MESSAGE,
      };
    }
    return { allowed: true, userMessage: "" };
  } catch (err) {
    // Fail open on tracker errors so Āwhina stays intelligent when under budget
    // and Firestore is briefly unavailable. Caps still enforce when readable.
    console.warn("[openai-spend] check failed; allowing request", err);
    return { allowed: true, userMessage: "" };
  }
}

export async function assertOpenAiSpendAllowed(
  uid?: string | null,
  ip?: string
): Promise<void> {
  const gate = await checkOpenAiSpendGate(uid, ip);
  if (!gate.allowed) {
    throw new OpenAiSpendBlockedError(gate);
  }
}

export async function recordOpenAiCallUsage(usage: {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  const ctx = getOpenAiSpendContext();
  try {
    await recordSpending(
      ctx.uid,
      ctx.ip || "unknown",
      usage.inputTokens || 0,
      usage.outputTokens || 0,
      usage.model || "gpt-4o-mini"
    );
  } catch (err) {
    console.warn("[openai-spend] record failed", err);
  }
}

/**
 * Lowest shared choke point: check caps before the billed call, record after success.
 * Routes must not call the OpenAI SDK (or api.openai.com) except through this.
 */
export async function gateOpenAiCall<T>(
  billedCall: () => Promise<T>,
  getUsage: (result: T) => {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  } = () => ({})
): Promise<T> {
  await assertOpenAiSpendAllowed();
  const result = await billedCall();
  const usage = getUsage(result) || {};
  await recordOpenAiCallUsage({
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
  return result;
}

function usageFromChatCompletion(
  result: unknown,
  model: string
): { model: string; inputTokens: number; outputTokens: number } {
  const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
    .usage;
  return {
    model,
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
  };
}

function usageFromResponses(
  result: unknown,
  model: string
): { model: string; inputTokens: number; outputTokens: number } {
  const usage = (result as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  return {
    model,
    inputTokens: usage?.input_tokens || 0,
    outputTokens: usage?.output_tokens || 0,
  };
}

/** Gated OpenAI SDK client — billed methods cannot bypass spend checks. */
export function createGatedOpenAI(
  options?: ConstructorParameters<typeof OpenAI>[0]
): OpenAI {
  const client = new OpenAI(options);

  const chatCreate = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = ((body: unknown, requestOptions?: unknown) => {
    const params = body as { model?: string };
    const model = params?.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    return gateOpenAiCall(
      () => chatCreate(body as never, requestOptions as never),
      (result) => usageFromChatCompletion(result, model)
    );
  }) as typeof client.chat.completions.create;

  const responsesCreate = client.responses.create.bind(client.responses);
  client.responses.create = ((body: unknown, requestOptions?: unknown) => {
    const params = body as { model?: string };
    const model = params?.model || process.env.OPENAI_VISION_MODEL || "gpt-4o";
    return gateOpenAiCall(
      () => responsesCreate(body as never, requestOptions as never),
      (result) => usageFromResponses(result, model)
    );
  }) as typeof client.responses.create;

  const transcribeCreate = client.audio.transcriptions.create.bind(
    client.audio.transcriptions
  );
  client.audio.transcriptions.create = ((body: unknown, requestOptions?: unknown) => {
    return gateOpenAiCall(
      () => transcribeCreate(body as never, requestOptions as never),
      () => ({ model: "whisper-1", inputTokens: 0, outputTokens: 0 })
    );
  }) as typeof client.audio.transcriptions.create;

  return client;
}
