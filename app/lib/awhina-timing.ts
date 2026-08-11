/**
 * Lightweight timing instrumentation for photo → draft and message → reply paths.
 * Dev-oriented; safe in production (no PII).
 */

export type AwhinaTimingMarks = Record<string, number>;

export type AwhinaTimingSession = {
  id: string;
  marks: AwhinaTimingMarks;
  mark: (name: string) => void;
  snapshot: () => AwhinaTimingMarks;
  elapsed: (from: string, to?: string) => number | undefined;
};

let lastSession: AwhinaTimingSession | null = null;

export function startAwhinaTiming(id?: string): AwhinaTimingSession {
  const start = Date.now();
  const marks: AwhinaTimingMarks = { startedAt: start };
  const session: AwhinaTimingSession = {
    id: id || `t_${start.toString(36)}`,
    marks,
    mark(name: string) {
      marks[name] = Date.now();
    },
    snapshot() {
      return { ...marks, now: Date.now() };
    },
    elapsed(from: string, to?: string) {
      const a = marks[from];
      const b = to ? marks[to] : Date.now();
      if (a == null || b == null) return undefined;
      return b - a;
    },
  };
  lastSession = session;
  return session;
}

export function markAwhinaTiming(name: string): void {
  lastSession?.mark(name);
}

export function getLastAwhinaTiming(): AwhinaTimingSession | null {
  return lastSession;
}

/** Structured log line for bottlenecks (server console). */
export function logAwhinaTiming(
  label: string,
  marks: AwhinaTimingMarks,
  extra?: Record<string, unknown>
): void {
  const started = marks.startedAt || marks.photoSelectedAt || marks.messageSubmittedAt;
  const done = marks.draftCompletedAt || marks.completedAt || marks.now;
  const total =
    started != null && done != null ? done - started : undefined;
  if (typeof console !== "undefined") {
    console.info(
      `[awhina-timing] ${label}`,
      JSON.stringify({
        totalMs: total,
        marks,
        ...extra,
      })
    );
  }
}
