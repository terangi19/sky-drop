"use client";

type Tab = "chat" | "listing";

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
  listingHint?: boolean;
  awhinaAsking?: boolean;
};

/** Mobile pane switch — only when a draft/workspace is active. */
export default function SellWorkspaceTabs({
  active,
  onChange,
  listingHint,
  awhinaAsking,
}: Props) {
  return (
    <div
      className="mb-4 flex gap-1 rounded-xl bg-[var(--surface-2)] p-1 lg:hidden"
      role="tablist"
      aria-label="Sell workspace"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === "chat"}
        onClick={() => onChange("chat")}
        className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
          active === "chat"
            ? "bg-[var(--surface-3)] text-[var(--foreground)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        Āwhina
        {awhinaAsking ? (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" aria-hidden />
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "listing"}
        onClick={() => onChange("listing")}
        className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
          active === "listing"
            ? "bg-[var(--surface-3)] text-[var(--foreground)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        Listing
        {listingHint ? (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" aria-hidden />
        ) : null}
      </button>
    </div>
  );
}
