"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AwhinaInsight } from "../lib/awhina-insights";

type ContextValue = {
  insight: AwhinaInsight | null;
  setInsight: (insight: AwhinaInsight | null) => void;
};

const AwhinaPageInsightContext = createContext<ContextValue | null>(null);

export function AwhinaPageInsightProvider({ children }: { children: React.ReactNode }) {
  const [insight, setInsight] = useState<AwhinaInsight | null>(null);
  const value = useMemo(() => ({ insight, setInsight }), [insight]);
  return (
    <AwhinaPageInsightContext.Provider value={value}>{children}</AwhinaPageInsightContext.Provider>
  );
}

export function useAwhinaPageInsight() {
  const ctx = useContext(AwhinaPageInsightContext);
  if (!ctx) {
    return { insight: null, setInsight: () => {} };
  }
  return ctx;
}

/** Pages with data-driven insights register them here; cleared on unmount. */
export function useAwhinaInsightEffect(insight: AwhinaInsight | null) {
  const { setInsight } = useAwhinaPageInsight();
  useEffect(() => {
    setInsight(insight);
    return () => setInsight(null);
  }, [insight, setInsight]);
}
