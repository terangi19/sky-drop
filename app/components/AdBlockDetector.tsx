"use client";

import { useEffect } from "react";
import { detectAdBlocker } from "../lib/adblock-detector";

export default function AdBlockDetector() {
  useEffect(() => {
    // Run detection after a short delay to avoid blocking initial render
    const timer = setTimeout(() => {
      detectAdBlocker();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
