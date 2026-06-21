type Props = {
  speaking?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: { box: "h-8 w-8 sm:h-9 sm:w-9", svg: "h-4 w-4 sm:h-5 sm:w-5", glow: "-inset-1 sm:-inset-1.5 rounded-xl" },
  md: { box: "h-10 w-10 sm:h-12 sm:w-12", svg: "h-6 w-6 sm:h-7 sm:w-7", glow: "-inset-1.5 sm:-inset-2 rounded-2xl" },
  lg: { box: "h-14 w-14 sm:h-16 sm:w-16", svg: "h-8 w-8 sm:h-9 sm:w-9", glow: "-inset-2 sm:-inset-2.5 rounded-2xl" },
};

export default function AwhinaAvatar({ speaking = false, size = "md" }: Props) {
  const s = sizes[size];

  return (
    <div className="relative shrink-0">
      <div
        className={`absolute ${s.glow} bg-sky-400/15 blur-lg transition-opacity duration-500 ${
          speaking ? "opacity-100" : "opacity-40"
        }`}
      />
      <div
        className={`relative flex ${s.box} items-center justify-center rounded-2xl border border-sky-400/25 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[0_0_24px_rgba(56,189,248,0.18)] light:border-sky-600/25 light:from-gray-100 light:to-gray-200 light:shadow-[0_0_24px_rgba(14,165,233,0.15)]`}
      >
        <svg viewBox="0 0 64 64" className={s.svg} aria-hidden>
          <rect x="14" y="18" width="36" height="30" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" className="light:fill-white light:stroke-sky-600" />
          <line x1="32" y1="10" x2="32" y2="18" stroke="#38bdf8" strokeWidth="2" className="light:stroke-sky-600" />
          <circle cx="32" cy="8" r="3" fill="#38bdf8" className={speaking ? "animate-pulse" : ""} />
          <circle cx="24" cy="30" r="4" fill="#0ea5e9" className={speaking ? "animate-pulse" : ""} />
          <circle cx="40" cy="30" r="4" fill="#0ea5e9" className={speaking ? "animate-pulse" : ""} />
          <rect x="22" y="40" width="20" height="4" rx="2" fill="#38bdf8" opacity="0.85" />
        </svg>
      </div>
    </div>
  );
}
