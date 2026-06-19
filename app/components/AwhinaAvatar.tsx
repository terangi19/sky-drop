type Props = {
  speaking?: boolean;
  size?: "sm" | "md";
};

const sizes = {
  sm: { box: "h-9 w-9", svg: "h-5 w-5", glow: "-inset-1.5 rounded-xl" },
  md: { box: "h-12 w-12", svg: "h-7 w-7", glow: "-inset-2 rounded-2xl" },
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
        className={`relative flex ${s.box} items-center justify-center rounded-2xl border border-sky-400/25 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[0_0_24px_rgba(56,189,248,0.18)]`}
      >
        <svg viewBox="0 0 64 64" className={s.svg} aria-hidden>
          <rect x="14" y="18" width="36" height="30" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
          <line x1="32" y1="10" x2="32" y2="18" stroke="#38bdf8" strokeWidth="2" />
          <circle cx="32" cy="8" r="3" fill="#38bdf8" className={speaking ? "animate-pulse" : ""} />
          <circle cx="24" cy="30" r="4" fill="#0ea5e9" className={speaking ? "animate-pulse" : ""} />
          <circle cx="40" cy="30" r="4" fill="#0ea5e9" className={speaking ? "animate-pulse" : ""} />
          <rect x="22" y="40" width="20" height="4" rx="2" fill="#38bdf8" opacity="0.85" />
        </svg>
      </div>
    </div>
  );
}
