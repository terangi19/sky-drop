"use client";

import { useEffect, useState } from "react";

export default function AnimatedCheckmark({ className = "h-7 w-7" }: { className?: string }) {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
        className="text-emerald-400"
        style={{
          strokeDasharray: 30,
          strokeDashoffset: drawn ? 0 : 30,
          transition: "stroke-dashoffset 0.4s ease-out",
        }}
      />
    </svg>
  );
}
