import { AWHINA_NAME } from "../lib/awhina-brand";

type Props = {
  centered?: boolean;
  className?: string;
};

export default function AwhinaOnlineBadge({ centered = false, className = "" }: Props) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${centered ? "justify-center" : ""} ${className}`.trim()}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
        {AWHINA_NAME} · online
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/90">
          Live
        </span>
      </span>
    </div>
  );
}

/** Drop directly under a page h1 */
export function AwhinaUnderHeader({
  centered = false,
  className = "mt-3",
}: {
  centered?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex ${centered ? "justify-center" : ""} ${className}`.trim()}>
      <AwhinaOnlineBadge centered={centered} />
    </div>
  );
}
