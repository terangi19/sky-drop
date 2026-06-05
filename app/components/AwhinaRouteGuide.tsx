"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AWHINA_NAME } from "../lib/awhina-brand";
import { resolveAwhinaGuide } from "../lib/awhina-page-guides";

function SmallRobot({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
      <rect x="14" y="18" width="36" height="30" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
      <line x1="32" y1="10" x2="32" y2="18" stroke="#38bdf8" strokeWidth="2" />
      <circle cx="32" cy="8" r="3" fill="#38bdf8" className={active ? "animate-pulse" : ""} />
      <circle cx="24" cy="30" r="4" fill="#0ea5e9" />
      <circle cx="40" cy="30" r="4" fill="#0ea5e9" />
      <rect x="22" y="40" width="20" height="4" rx="2" fill="#38bdf8" opacity="0.8" />
    </svg>
  );
}

export default function AwhinaRouteGuide() {
  const pathname = usePathname();
  const config = useMemo(() => resolveAwhinaGuide(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    setOpen(false);
    setSeen(false);
    setDismissed(false);
    if (!config?.storageKey || typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(config.storageKey) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, [config?.storageKey]);

  function dismiss() {
    setDismissed(true);
    setOpen(false);
    if (config?.storageKey) {
      try {
        sessionStorage.setItem(config.storageKey, "1");
      } catch {
        /* ignore */
      }
    }
  }

  if (!config || dismissed) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-4 z-[9998] max-md:bottom-24 md:left-6"
      role="complementary"
      aria-label={`${AWHINA_NAME} page guide`}
    >
      <div className="pointer-events-auto flex flex-col items-start gap-2">
        {open && (
          <div className="relative max-w-[240px] rounded-xl border border-sky-500/25 bg-zinc-950/95 px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md sm:max-w-[260px]">
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-1.5 top-1.5 rounded px-1 text-[10px] text-zinc-600 transition hover:text-zinc-300"
              aria-label="Dismiss guide"
            >
              ✕
            </button>
            <p className="pr-4 text-[9px] font-bold uppercase tracking-[0.18em] text-sky-400">
              {AWHINA_NAME}
            </p>
            {config.lines.map((line, i) => (
              <p
                key={i}
                className={`leading-snug ${i === 0 ? "mt-1 text-[11px] text-zinc-200" : "mt-1 text-[10px] text-zinc-500"}`}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setSeen(true);
          }}
          className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-sky-500/30 bg-zinc-950/90 shadow-[0_0_16px_rgba(56,189,248,0.2)] backdrop-blur-sm transition hover:border-sky-400/50 hover:shadow-[0_0_20px_rgba(56,189,248,0.35)] active:scale-95 ${
            open ? "ring-2 ring-sky-500/40" : ""
          }`}
          aria-label={open ? "Hide page guide" : `What is this page? Ask ${AWHINA_NAME}`}
          aria-expanded={open}
        >
          <SmallRobot active={open} />
          {!open && !seen && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-sky-400" />
          )}
        </button>
      </div>
    </div>
  );
}
