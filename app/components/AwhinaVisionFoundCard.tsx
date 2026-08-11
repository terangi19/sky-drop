"use client";

type Props = {
  status: "idle" | "checking" | "found" | "error";
  identity?: string;
  message?: string;
  onYes?: () => void;
  onChange?: () => void;
  className?: string;
};

/**
 * Restrained camera-first result UX — not a JSON dump.
 * Confirm only when identity is uncertain (MEDIUM/LOW paths).
 */
export default function AwhinaVisionFoundCard({
  status,
  identity,
  message,
  onYes,
  onChange,
  className = "",
}: Props) {
  if (status === "idle") return null;

  if (status === "checking") {
    return (
      <div
        className={`rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-zinc-400 ${className}`}
        role="status"
        aria-live="polite"
      >
        Looking at your photo…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className={`rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100/90 ${className}`}
        role="alert"
      >
        {message || "Couldn't read those photos. Tell Āwhina what it is in chat."}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-sky-100/90">
        Looks like <span className="font-semibold text-white">{identity || "your item"}</span>
        {" — "}is that right?
      </p>
      {message ? <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{message}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onYes}
          className="rounded-lg bg-sky-500 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-sky-400"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={onChange}
          className="rounded-lg border border-white/15 bg-transparent px-3.5 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-white/25 hover:text-white"
        >
          Change
        </button>
      </div>
    </div>
  );
}
