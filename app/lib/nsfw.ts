"use client";

let model: any = null;
let loading: Promise<any> | null = null;

async function getModel() {
  if (model) return model;
  if (!loading) {
    loading = (async () => {
      // Lazy load heavy TensorFlow libraries only when needed
      const tf = await import("@tensorflow/tfjs");
      const nsfwjs = await import("nsfwjs");
      await tf.ready();
      const m = await nsfwjs.load();
      model = m;
      return m;
    })();
  }
  return loading;
}

export interface NsfwResult {
  safe: boolean;
  predictions: Array<{ className: string; probability: number }>;
  reason?: string;
}

const NSFW_CLASSES = new Set(["Porn", "Hentai"]);

export async function checkImage(file: File): Promise<NsfwResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        URL.revokeObjectURL(url);
        const m = await getModel();
        const predictions = await m.classify(img);
        type Prediction = { className: string; probability: number };

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
}
