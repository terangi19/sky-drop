/**
 * Voice search analytics — tracks corrections and match quality for continuous improvement.
 */

import type { VoiceSearchCorrection, VoiceSearchIntent } from "./voice-search-pipeline";

export type VoiceSearchLogEntry = {
  timestamp: string;
  rawTranscript: string;
  correctedQuery: string;
  corrections: VoiceSearchCorrection[];
  confidence: VoiceSearchIntent["confidence"];
  categoryHint?: string;
  brandHint?: string;
  modelHint?: string;
  resultCount: number | null;
  topMatchTitle: string | null;
  source: "voice" | "search_page" | "text";
};

const MAX_ENTRIES = 300;
let _logs: VoiceSearchLogEntry[] = [];

export function logVoiceSearch(
  intent: VoiceSearchIntent,
  meta: {
    resultCount?: number | null;
    topMatchTitle?: string | null;
    source?: VoiceSearchLogEntry["source"];
  } = {}
): void {
  const entry: VoiceSearchLogEntry = {
    timestamp: new Date().toISOString(),
    rawTranscript: intent.rawTranscript,
    correctedQuery: intent.searchQuery,
    corrections: intent.corrections,
    confidence: intent.confidence,
    categoryHint: intent.categoryHint,
    brandHint: intent.brandHint,
    modelHint: intent.modelHint,
    resultCount: meta.resultCount ?? null,
    topMatchTitle: meta.topMatchTitle ?? null,
    source: meta.source ?? "voice",
  };

  _logs.push(entry);
  if (_logs.length > MAX_ENTRIES) _logs = _logs.slice(-MAX_ENTRIES);

  if (process.env.NODE_ENV === "development") {
    const fixes =
      intent.corrections.length > 0
        ? ` [fixed: ${intent.corrections.map((c) => `${c.from}→${c.to}`).join(", ")}]`
        : "";
    console.log(
      `[VoiceSearch] "${intent.rawTranscript}" → "${intent.searchQuery}"` +
        ` (${intent.confidence})${fixes}`
    );
  }

  if (typeof window !== "undefined") {
    try {
      const key = "skydrop:voice-search-logs";
      const stored = JSON.parse(sessionStorage.getItem(key) ?? "[]") as VoiceSearchLogEntry[];
      stored.push(entry);
      sessionStorage.setItem(key, JSON.stringify(stored.slice(-100)));
    } catch {
      /* ignore storage errors */
    }
  }
}

export function getVoiceSearchLogs(n = 50): VoiceSearchLogEntry[] {
  return _logs.slice(-n);
}

export function getVoiceSearchStats(): {
  total: number;
  withCorrections: number;
  avgCorrections: number;
  topCorrections: Array<{ from: string; to: string; count: number }>;
} {
  const total = _logs.length;
  if (total === 0) {
    return { total: 0, withCorrections: 0, avgCorrections: 0, topCorrections: [] };
  }

  const withCorrections = _logs.filter((l) => l.corrections.length > 0).length;
  const totalFixes = _logs.reduce((s, l) => s + l.corrections.length, 0);

  const fixCounts = new Map<string, number>();
  for (const log of _logs) {
    for (const c of log.corrections) {
      const key = `${c.from}→${c.to}`;
      fixCounts.set(key, (fixCounts.get(key) ?? 0) + 1);
    }
  }

  const topCorrections = [...fixCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => {
      const [from, to] = key.split("→");
      return { from, to, count };
    });

  return {
    total,
    withCorrections,
    avgCorrections: Math.round((totalFixes / total) * 10) / 10,
    topCorrections,
  };
}
