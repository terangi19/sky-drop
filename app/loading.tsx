import { LoadingSkeleton } from "./components/LoadingSpinner";

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Navbar placeholder */}
      <div className="sticky top-0 z-[9999] border-b border-white/10 backdrop-blur-xl" style={{ backgroundColor: "var(--nav-bg)" }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <LoadingSkeleton className="h-8 w-8" />
            <LoadingSkeleton className="h-4 w-24 hidden sm:block" />
          </div>
          <div className="flex items-center gap-3">
            <LoadingSkeleton className="h-4 w-16 hidden md:block" />
            <LoadingSkeleton className="h-4 w-16 hidden md:block" />
            <LoadingSkeleton className="h-8 w-8 rounded-full" />
            <LoadingSkeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>

      {/* Page content skeleton */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <LoadingSkeleton className="h-8 w-64 mb-8" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <LoadingSkeleton className="aspect-[4/3] w-full" />
              <div className="p-4 space-y-3">
                <LoadingSkeleton className="h-4 w-3/4" />
                <LoadingSkeleton className="h-3 w-1/2" />
                <LoadingSkeleton className="h-6 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
