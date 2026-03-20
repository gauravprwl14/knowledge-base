import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/8", className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// SourceCardSkeleton — mirrors the SourceCard layout
// ---------------------------------------------------------------------------

function SourceCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg bg-white/10 shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-32 bg-white/10" />
          <Skeleton className="h-3 w-20 bg-white/[0.06]" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full bg-white/[0.06]" />
      </div>
      <Skeleton className="h-3 w-full bg-white/[0.05]" />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-8 w-20 rounded-lg bg-white/[0.06]" />
        <Skeleton className="h-8 w-24 rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FileListSkeleton — mirrors a file list row
// ---------------------------------------------------------------------------

function FileListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/[0.05] bg-white/[0.02]">
          <Skeleton className="h-8 w-8 rounded-md bg-white/10 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-48 bg-white/10" />
            <Skeleton className="h-2.5 w-24 bg-white/[0.06]" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full bg-white/[0.06]" />
          <Skeleton className="h-3 w-20 bg-white/[0.05]" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DashboardSkeleton — mirrors the dashboard page layout
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-8">
      {/* Welcome banner skeleton */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <Skeleton className="h-7 w-56 bg-white/10 mb-2" />
        <Skeleton className="h-4 w-72 bg-white/[0.06]" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-9 w-9 rounded-lg bg-white/10" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-12 bg-white/10" />
              <Skeleton className="h-4 w-28 bg-white/[0.07]" />
              <Skeleton className="h-3 w-36 bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </div>

      {/* CTA banner skeleton */}
      <div className="flex items-center gap-4 p-6 rounded-xl border border-white/10 bg-white/[0.03]">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40 bg-white/10" />
          <Skeleton className="h-3 w-72 bg-white/[0.06]" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg bg-white/10 shrink-0" />
      </div>
    </div>
  )
}

export { Skeleton, SourceCardSkeleton, FileListSkeleton, DashboardSkeleton }
