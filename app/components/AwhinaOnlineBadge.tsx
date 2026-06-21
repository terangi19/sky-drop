import { AWHINA_NAME } from "../lib/awhina-brand";

const PREFERS_REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = {
  centered?: boolean;
  className?: string;
};

export default function AwhinaOnlineBadge({ centered = false, className = "" }: Props) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${centered ? "justify-center" : ""} ${className}`.trim()}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300 light:text-sky-600">
        {AWHINA_NAME} · online
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/[0.08] px-1.5 py-0.5 light:border-sky-600/30 light:bg-sky-100">
        <span className="relative flex h-1.5 w-1.5">
          {!PREFERS_REDUCED_MOTION && (
            <span className="absolute inline-flex h-full w-full awhina-ping rounded-full bg-sky-400/60 light:bg-sky-500/60" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400 light:bg-sky-600" />
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-sky-400/90 light:text-sky-700">
          Live
        </span>
      </span>
    </div>
  );
}

/** Optional slot under page headers — kept for imports; renders nothing */
export function AwhinaUnderHeader(_props?: {
  centered?: boolean;
  className?: string;
}) {
  return null;
}
