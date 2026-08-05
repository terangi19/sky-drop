"use client";

import { useEffect, useState } from "react";

/** Subtle ambient backdrop — restrained sky wash, no drifting orb theater. */
export default function Background() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const check = () => setIsLight(document.documentElement.classList.contains("light"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  if (isLight) {
    return (
      <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-white" />
        <div className="absolute inset-x-0 top-0 h-[42%] bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.08),transparent_70%)]" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[#0a0a0f]" />
      <div className="absolute inset-x-0 top-0 h-[50%] bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.06),transparent_65%)]" />
    </div>
  );
}
