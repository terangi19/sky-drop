/** Voice command logging and analytics — tracks recognition quality over time. */

export type CommandLogEntry = {
  timestamp: string;
  rawTranscript: string;
  normalizedTranscript: string;
  matchedCommand: string | null;
  confidence: "high" | "medium" | "low" | "none";
  targetPath: string | null;
  targetTitle: string | null;
  executedAction: "navigate" | "search" | "page" | "reply" | "resume" | "voice_off" | "listing" | "ai_conversation" | "none";
  route: string;
  executionTimeMs: number;
  aiBypassed: boolean;
  phoneticCorrected: boolean;
  originalTranscript: string;
};

const MAX_LOG_ENTRIES = 500;
let _logs: CommandLogEntry[] = [];
let _exported = false;

/** Record a voice command execution. */
export function logCommand(entry: Omit<CommandLogEntry, "timestamp">): void {
  const full: CommandLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  _logs.push(full);
  if (_logs.length > MAX_LOG_ENTRIES) {
    _logs = _logs.slice(-MAX_LOG_ENTRIES);
  }

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[Voice] "${entry.rawTranscript}" → ${entry.matchedCommand ?? "?"} ` +
      `(${entry.confidence}) → ${entry.targetPath ?? "—"} ` +
      `${entry.aiBypassed ? "[LOCAL]" : "[AI]"} ` +
      `${entry.executionTimeMs}ms`
    );
  }
}

/** Get the last N log entries. */
export function getCommandLogs(n = 50): CommandLogEntry[] {
  return _logs.slice(-n);
}

/** Get summary statistics. */
export function getCommandStats(): {
  total: number;
  localMatch: number;
  aiFallback: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  avgExecutionTime: number;
  topCommands: Array<{ command: string; count: number }>;
} {
  const total = _logs.length;
  if (total === 0) {
    return { total: 0, localMatch: 0, aiFallback: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0, avgExecutionTime: 0, topCommands: [] };
  }

  const localMatch = _logs.filter((l) => l.aiBypassed).length;
  const aiFallback = total - localMatch;
  const highConfidence = _logs.filter((l) => l.confidence === "high").length;
  const mediumConfidence = _logs.filter((l) => l.confidence === "medium").length;
  const lowConfidence = _logs.filter((l) => l.confidence === "low" || l.confidence === "none").length;
  const totalTime = _logs.reduce((sum, l) => sum + l.executionTimeMs, 0);
  const avgExecutionTime = Math.round(totalTime / total);

  const cmdCounts = new Map<string, number>();
  for (const l of _logs) {
    const cmd = l.matchedCommand ?? "none";
    cmdCounts.set(cmd, (cmdCounts.get(cmd) ?? 0) + 1);
  }
  const topCommands = [...cmdCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([command, count]) => ({ command, count }));

  return { total, localMatch, aiFallback, highConfidence, mediumConfidence, lowConfidence, avgExecutionTime, topCommands };
}

/** Export logs as JSON for analysis. */
export function exportCommandLogs(): CommandLogEntry[] {
  _exported = true;
  return [..._logs];
}

/** Clear all logs. */
export function clearCommandLogs(): void {
  _logs = [];
  _exported = false;
}
