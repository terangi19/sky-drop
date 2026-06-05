"use client";

import { useEffect, useState, type ReactNode } from "react";

export function SkyAiTypingText({
  text,
  run,
  speedMs = 24,
  children,
}: {
  text: string;
  run: boolean;
  speedMs?: number;
  children: (displayed: string, done: boolean) => ReactNode;
}) {
  const [count, setCount] = useState(run ? 0 : text.length);
  const [done, setDone] = useState(!run);

  useEffect(() => {
    if (!run) {
      setCount(text.length);
      setDone(true);
      return;
    }
    setCount(0);
    setDone(false);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) {
        window.clearInterval(timer);
        setDone(true);
      }
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [text, run, speedMs]);

  return <>{children(text.slice(0, count), done)}</>;
}

export function SkyAiTypingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[1px] animate-pulse bg-sky-400 align-middle"
      aria-hidden
    />
  );
}
