import { Skeleton, StatCardSkeleton, TableRowsSkeleton } from "@/features/ui-kit/skeleton";

export default function PlatformLoading() {
  return (
    <section role="status" aria-label="Загружаем платформу" className="flex flex-col gap-6">
      <span className="sr-only">Загружаем платформу</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <TableRowsSkeleton rows={6} columns={5} />
    </section>
  );
}
