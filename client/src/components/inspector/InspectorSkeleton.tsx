import { Skeleton } from '@/components/ui/skeleton';

export function InspectorSkeleton() {
  return (
    <div className="flex h-full flex-col p-2 gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-4 border-b pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>

      {/* Table content */}
      <div className="flex-1 space-y-2">
        {/* Table header */}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 flex-1" />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-6 flex-1" style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
