"use client";

type Props = {
  visible: boolean;
  loading?: boolean;
  label?: string;
  onPublish: () => void;
};

/**
 * Mobile-only sticky publish — only when ready on review/listing pane.
 * Safe-area aware; parent must hide when composer tab is active.
 */
export default function SellStickyPublishBar({
  visible,
  loading,
  label = "Publish listing",
  onPublish,
}: Props) {
  if (!visible) return null;

  return (
    <div
      className="sell-sticky-publish fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--surface-1)]/95 px-4 pt-3 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
      role="region"
      aria-label="Publish listing"
    >
      <button
        type="button"
        onClick={onPublish}
        disabled={loading}
        className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[var(--accent-primary)] text-sm font-semibold text-white transition duration-150 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"
      >
        {loading ? "Saving…" : label}
      </button>
    </div>
  );
}
