"use client";

import { useEffect, useState } from "react";

export default function BraveWarning() {
  const [isBrave, setIsBrave] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if Brave browser
    const isBraveBrowser = () => {
      return (
        (navigator as any).brave !== undefined ||
        (navigator as any).userAgentData?.brands?.some((brand: any) => brand.brand === "Brave")
      );
    };

    // Check if already dismissed
    const wasDismissed = localStorage.getItem("brave-warning-dismissed");
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    if (isBraveBrowser()) {
      setIsBrave(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("brave-warning-dismissed", "true");
  };

  if (!isBrave || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-orange-600 to-orange-500 text-white px-4 py-3 shadow-lg">
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-2xl">🦁</span>
          <div className="flex-1">
            <p className="text-sm font-bold">Brave Browser Detected</p>
            <p className="text-xs opacity-90">
              Brave shields may block Sky Drop features. Click the shield icon in the address bar and disable shields for this site.
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-bold transition"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
