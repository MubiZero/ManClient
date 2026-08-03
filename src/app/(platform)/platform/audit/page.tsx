import Link from "next/link";

import { listAuditEventTypes, listAuditEvents } from "@/core/platform/audit-log";
import { listBusinessOptions } from "@/core/platform/business-directory";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Select } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ businessId?: string; type?: string; cursor?: string }> }) {
  const { businessId, type, cursor } = await searchParams;
  const [{ items: events, nextCursor }, businesses, types] = await Promise.all([
    listAuditEvents({ businessId, type }, { cursor }),
    listBusinessOptions(),
    listAuditEventTypes(),
  ]);

  return (
    <>
      <PageHeader eyebrow="Платформа" title="Журнал событий" description="По 50 событий на страницу, отфильтруйте по бизнесу или типу." />

      <form className="flex flex-wrap items-center gap-3">
        <Select name="businessId" defaultValue={businessId ?? ""} className="w-auto">
          <option value="">Все бизнесы</option>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={type ?? ""} className="w-auto">
          <option value="">Все типы событий</option>
          {types.map((eventType) => (
            <option key={eventType} value={eventType}>
              {eventType}
            </option>
          ))}
        </Select>
        <button type="submit" className="rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-secondary">
          Применить
        </button>
        <a
          href={`/api/platform/audit/export?${new URLSearchParams({ ...(businessId ? { businessId } : {}), ...(type ? { type } : {}) }).toString()}`}
          className="ml-auto rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Экспорт CSV
        </a>
      </form>

      {events.length === 0 ? (
        <EmptyState title="Событий нет" description="Измените фильтры." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Бизнес</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Актор</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="text-muted-foreground">{event.createdAt.toLocaleString("ru-RU")}</TableCell>
                <TableCell>{event.business.name}</TableCell>
                <TableCell className="font-mono text-xs">{event.type}</TableCell>
                <TableCell className="text-muted-foreground">{event.actorType}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {nextCursor ? (
        <Link
          href={`/platform/audit?${new URLSearchParams({
            ...(businessId ? { businessId } : {}),
            ...(type ? { type } : {}),
            cursor: nextCursor,
          }).toString()}`}
          className="text-sm font-medium text-foreground hover:underline"
        >
          Следующая страница →
        </Link>
      ) : null}
    </>
  );
}
