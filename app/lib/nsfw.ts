"use client";

import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";

let model: nsfwjs.NSFWJS | null = null;
let loading: Promise<nsfwjs.NSFWJS> | null = null;

async function getModel(): Promise<nsfwjs.NSFWJS> {
  if (model) return model;
  if (!loading) {
    loading = (async () => {
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

        const flagged = predictions.filter((p) => NSFW_CLASSES.has(p.className) && p.probability > 0.4);
        const topFlagged = flagged.sort((a, b) => b.probability - a.probability)[0];

        resolve({
          safe: !topFlagged,
          predictions: predictions.map((p) => ({ className: p.className, probability: p.probability })),
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
