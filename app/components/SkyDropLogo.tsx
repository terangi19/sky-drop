"use client";

import Link from "next/link";
import { useId } from "react";

const SIZE_MAP = {
  sm: { badge: "h-8 w-8", text: "text-[15px]", sub: "text-[7px]" },
  md: { badge: "h-10 w-10 md:h-11 md:w-11", text: "text-[17px] md:text-[19px]", sub: "text-[8px] md:text-[9px]" },
  lg: { badge: "h-12 w-12", text: "text-2xl", sub: "text-[9px]" },
} as const;

type SkyDropLogoProps = {
  size?: keyof typeof SIZE_MAP;
  showWordmark?: boolean;
  showMicroTag?: boolean;
  showTagline?: boolean;
  href?: string;
  className?: string;
  interactive?: boolean;
};

export function SkyDropMark({ className = "", uid }: { className?: string; uid?: string }) {
  const autoId = useId();
  const id = (uid || autoId).replace(/:/g, "");

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-canopy`} x1="24" y1="5" x2="24" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7dd3fc" stopOpacity="0.5" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={`${id}-brand`} x1="10" y1="6" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id={`${id}-box`} x1="17" y1="28" x2="31" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* Parachute canopy — dome arc, not flat cloud */}
      <path
        d="M8 17.5 C8 8.5 15.5 4.5 24 4.5 C32.5 4.5 40 8.5 40 17.5"
        fill={`url(#${id}-canopy)`}
        stroke={`url(#${id}-brand)`}
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Apex vent — reads as parachute, not umbrella */}
      <circle cx="24" cy="7.5" r="1.6" fill="none" stroke="#7dd3fc" strokeWidth="0.9" opacity="0.9" />

      {/* Canopy panel ribs */}
      <path d="M24 8.5 L11 17" stroke="#7dd3fc" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />
      <path d="M24 8.5 L17 11.5" stroke="#7dd3fc" strokeWidth="0.7" strokeLinecap="round" opacity="0.35" />
      <path d="M24 8.5 L24 17" stroke="#7dd3fc" strokeWidth="0.7" strokeLinecap="round" opacity="0.4" />
      <path d="M24 8.5 L31 11.5" stroke="#7dd3fc" strokeWidth="0.7" strokeLinecap="round" opacity="0.35" />
      <path d="M24 8.5 L37 17" stroke="#7dd3fc" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />

      {/* Suspension lines → box */}
      <line x1="11" y1="17.2" x2="18.5" y2="27.5" stroke={`url(#${id}-brand)`} strokeWidth="1" strokeLinecap="round" opacity="0.75" />
      <line x1="17" y1="17.2" x2="18.5" y2="27.5" stroke={`url(#${id}-brand)`} strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1="24" y1="17.2" x2="24" y2="27.5" stroke={`url(#${id}-brand)`} strokeWidth="1" strokeLinecap="round" opacity="0.85" />
      <line x1="31" y1="17.2" x2="29.5" y2="27.5" stroke={`url(#${id}-brand)`} strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1="37" y1="17.2" x2="29.5" y2="27.5" stroke={`url(#${id}-brand)`} strokeWidth="1" strokeLinecap="round" opacity="0.75" />

      {/* Package box */}
      <rect
        x="17"
        y="27.5"
        width="14"
        height="10"
        rx="1.8"
        fill={`url(#${id}-box)`}
      />
      <path d="M17 30 H31" stroke="white" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
      <path
        d="M26.5 31.5 L29 31.5 L29 29.5"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Descent motion */}
      <circle cx="24" cy="40" r="1.1" fill="#38bdf8" opacity="0.55" />
      <circle cx="24" cy="42.2" r="0.75" fill="#a78bfa" opacity="0.4" />
    </svg>
  );
}

export function SkyDropWordmark({
  className = "",
  showMicroTag = false,
}: {
  className?: string;
  showMicroTag?: boolean;
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <span className="font-bold leading-none tracking-[-0.02em]">
        <span className="sky-drop-logo-sky text-white/95">Sky</span>
        <span className="sky-drop-logo-drop ml-0.5 bg-gradient-to-r from-sky-300 via-sky-400 to-sky-400 bg-clip-text font-extrabold text-transparent">
          Drop
        </span>
      </span>
      {showMicroTag && (
        <span className="sky-drop-logo-tag mt-1 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.28em] text-sky-400/55">
          <span className="h-px w-3 bg-gradient-to-r from-sky-400/70 to-sky-400/40" aria-hidden />
          NZ
        </span>
      )}
    </div>
  );
}

export default function SkyDropLogo({
  size = "md",
  showWordmark = true,
  showMicroTag = false,
  showTagline = false,
  href = "/",
  className = "",
  interactive = true,
}: SkyDropLogoProps) {
  const s = SIZE_MAP[size];
  const markId = useId();
  const groupClass = interactive
    ? "group transition-all duration-300 hover:scale-[1.02]"
    : "";

  const content = (
    <>
      <div className={`relative flex-shrink-0 ${s.badge}`}>
        {interactive && (
          <div className="absolute -inset-1 rounded-full bg-sky-400/0 opacity-0 blur-md transition-all duration-500 group-hover:bg-sky-400/15 group-hover:opacity-100" />
        )}
        <SkyDropMark
          uid={markId}
          className={`relative z-10 h-full w-full ${interactive ? "transition-transform duration-500 group-hover:scale-[1.03]" : ""}`}
        />
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <SkyDropWordmark className={s.text} showMicroTag={showMicroTag} />
          {showTagline && (
            <span
              className={`${s.sub} mt-0.5 font-semibold uppercase tracking-[0.22em] text-[var(--nav-ice-muted)]`}
            >
              Marketplace
            </span>
          )}
        </div>
      )}
    </>
  );

  const layoutClass = `flex items-center gap-3 ${groupClass} ${className}`;

  if (href) {
    return (
      <Link href={href} className={layoutClass} aria-label="Sky Drop home">
        {content}
      </Link>
    );
  }

  return <div className={layoutClass}>{content}</div>;
}
