"use client";

export default function LoadingSpinner({ size = "md", text }: { size?: "sm" | "md" | "lg"; text?: string }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div className="flex items-center gap-2">
      <svg
        className={`animate-spin ${sizeClasses[size]} text-sky-400`}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {text && <span className="text-sm text-gray-400">{text}</span>}
    </div>
  );
}

export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white/[0.04] rounded-lg ${className || ""}`} />
  );
}

export function LoadingCard() {
  return (
    <div className="relative h-full flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <LoadingSkeleton className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col p-4 gap-3">
        <LoadingSkeleton className="h-4 w-3/4" />
        <LoadingSkeleton className="h-3 w-1/2" />
        <LoadingSkeleton className="h-6 w-1/3 mt-auto" />
      </div>
    </div>
  );
}
