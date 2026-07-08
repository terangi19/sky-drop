import { LoadingSkeleton } from "../components/LoadingSpinner";

export default function LoginLoading() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)]">
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.08)_0%,transparent_60%)]" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <div className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <LoadingSkeleton className="h-12 w-12 rounded-xl" />
            <LoadingSkeleton className="h-6 w-40" />
            <LoadingSkeleton className="h-4 w-56" />
          </div>
          <div className="space-y-4">
            <LoadingSkeleton className="h-10 w-full rounded-xl" />
            <LoadingSkeleton className="h-10 w-full rounded-xl" />
          </div>
          <LoadingSkeleton className="h-12 w-full rounded-xl" />
          <LoadingSkeleton className="h-4 w-48 mx-auto" />
        </div>
      </div>
    </div>
  );
}
