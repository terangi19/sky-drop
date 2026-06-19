"use client";

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
      });
    }

    return () => {
      if (widgetIdRef.current && typeof window.turnstile !== "undefined") {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
    };
  }, []);

  if (!getTurnstileSiteKey()) return null;

  return <div ref={containerRef} className={className} />;
}
