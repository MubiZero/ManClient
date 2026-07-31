import { Skeleton, TableRowsSkeleton } from "@/features/ui-kit/skeleton";

export default function SettingsLoading() {
  return (
    <section role="status" aria-label="Загружаем настройки" className="flex flex-col gap-6">
      <span className="sr-only">Загружаем настройки</span>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
      <TableRowsSkeleton rows={5} columns={5} />
    </section>
  );
}
