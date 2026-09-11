/**
 * Browser stub for the `openai` package.
 * The real SDK is server-only; this keeps it out of client bundles.
 */
export default class OpenAI {
  constructor(_opts?: unknown) {
    throw new Error("OpenAI SDK is server-only");
  }
}
