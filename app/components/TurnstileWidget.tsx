"use client";

// Turnstile widget for Cloudflare verification
import { useEffect, useRef } from "react";
import { getTurnstileSiteKey } from "../lib/turnstile";

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, opts: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback"?: () => void;
        theme?: "light" | "dark" | "auto";
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function TurnstileWidget({ onToken, onExpire, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const siteKey = getTurnstileSiteKey();
    if (!siteKey || !containerRef.current) return;

    if (typeof window.turnstile === "undefined") {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => renderWidget();
      document.head.appendChild(script);
    } else {
      renderWidget();
    }

    function renderWidget() {
      if (!containerRef.current || typeof window.turnstile === "undefined") return;
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": onExpire,
        theme: "dark",
        size: "normal",
      } as any);
    }

    return () => {
      if (widgetIdRef.current && typeof window.turnstile !== "undefined") {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
    };
  }, []);

  if (!getTurnstileSiteKey()) return null;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-xs font-medium text-zinc-400">Security Check</span>
      </div>
      <div ref={containerRef} />
      <p className="mt-1 text-[10px] text-zinc-500">Helps us prevent spam and fake accounts</p>
    </div>
  );
}
