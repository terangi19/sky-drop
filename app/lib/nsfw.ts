"use client";

// TODO: NSFW moderation is currently disabled due to webpack compilation issues with nsfwjs model files
// The nsfwjs library contains model files with require() calls that webpack cannot statically analyze
// To re-enable:
// 1. Set ENABLE_NSFW_CHECK=true in environment variables
// 2. Uncomment the NSFW implementation code below
// 3. Ensure nsfwjs and @tensorflow/tfjs are properly configured for webpack
// 4. Consider using a different approach like server-side NSFW detection or a different library
// This feature is only used for AI image moderation in chat features, not critical for payment flow

const ENABLE_NSFW_CHECK = process.env.NEXT_PUBLIC_ENABLE_NSFW_CHECK === "true";

export interface NsfwResult {
  safe: boolean;
  predictions: Array<{ className: string; probability: number }>;
  reason?: string;
}

export async function checkImage(file: File): Promise<NsfwResult> {
  // When disabled, return safe immediately without any imports
  if (!ENABLE_NSFW_CHECK) {
    return { safe: true, predictions: [] };
  }

  // NSFW IMPLEMENTATION (uncomment when ENABLE_NSFW_CHECK=true)
  /*
  try {
    const tf = await import("@tensorflow/tfjs");
    const nsfwjs = await import("nsfwjs");
    
    await tf.ready();
    const model = await nsfwjs.load();
    
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = async () => {
        try {
          URL.revokeObjectURL(url);
          const predictions = await model.classify(img);
          type Prediction = { className: string; probability: number };

          const NSFW_CLASSES = new Set(["Porn", "Hentai"]);
          const flagged = predictions.filter(
            (p: Prediction) => NSFW_CLASSES.has(p.className) && p.probability > 0.4
          );
          const topFlagged = flagged.sort(
            (a: Prediction, b: Prediction) => b.probability - a.probability
          )[0];

          resolve({
            safe: !topFlagged,
            predictions: predictions.map((p: Prediction) => ({
              className: p.className,
              probability: p.probability,
            })),
            reason: topFlagged
              ? `Flagged as ${topFlagged.className} (${Math.round(topFlagged.probability * 100)}%)`
              : undefined,
          });
        } catch (e) {
          resolve({ safe: true, predictions: [] });
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ safe: true, predictions: [] });
      };

      img.src = url;
    });
  } catch (e) {
    console.warn("[nsfw] Failed to load NSFW libraries:", e);
    return { safe: true, predictions: [] };
  }
  */

  // Fallback when enabled but implementation is commented out
  console.warn("[nsfw] NSFW check is enabled but implementation is commented out. Returning safe.");
  return { safe: true, predictions: [] };
}
