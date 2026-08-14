import Link from "next/link";

import { DEFAULT_TIME_ZONE } from "@/core/formatting/dushanbe-date";
import { auditActorLabel, auditEventLabel } from "@/core/platform/audit-labels";
import { PLATFORM_SCOPE, listAuditEventTypes, listAuditEvents } from "@/core/platform/audit-log";
import { listBusinessOptions } from "@/core/platform/business-directory";
import { CursorPager, currentCursor, filterQuery, readPageTrail } from "@/features/ui-kit/cursor-pager";
import { Button, ButtonLink } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Select } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

// The journal belongs to the platform, not to a branch, and the operator reading it works in Dushanbe.
const eventTimeFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: DEFAULT_TIME_ZONE, dateStyle: "short", timeStyle: "medium" });

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ businessId?: string; type?: string; trail?: string }> }) {
  const { businessId, type, trail: rawTrail } = await searchParams;
  const trail = readPageTrail(rawTrail);
  const [{ items: events, nextCursor }, businesses, types] = await Promise.all([
    listAuditEvents({ businessId, type }, { cursor: currentCursor(trail) }),
    listBusinessOptions(),
    listAuditEventTypes(),
  ]);
  const filtered = Boolean(businessId || type);
  const typeOptions = types
    .map((eventType) => ({ value: eventType, label: auditEventLabel(eventType) }))
    .sort((left, right) => left.label.localeCompare(right.label, "ru"));

  return (
    <>
      <PageHeader eyebrow="Платформа" title="Журнал событий" description="По 50 событий на страницу, отфильтруйте по бизнесу или типу." />

      <form className="flex flex-wrap items-center gap-3">
        <label htmlFor="audit-business" className="sr-only">
          Бизнес
        </label>
        <Select id="audit-business" name="businessId" defaultValue={businessId ?? ""} className="w-auto">
          <option value="">Все бизнесы</option>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </Select>
        <label htmlFor="audit-type" className="sr-only">
          Тип события
        </label>
        <Select id="audit-type" name="type" defaultValue={type ?? ""} className="w-auto">
          <option value="">Все типы событий</option>
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Применить
        </Button>
        <ButtonLink
          variant="secondary"
          className="ml-auto"
          href={`/api/platform/audit/export?${new URLSearchParams({ ...(businessId ? { businessId } : {}), ...(type ? { type } : {}) }).toString()}`}
        >
          Экспорт CSV
        </ButtonLink>
      </form>

      {events.length === 0 ? (
        <EmptyState
          title={filtered ? "Под фильтры ничего не подошло" : "Событий пока нет"}
          description={filtered ? "Попробуйте выбрать другой бизнес или тип события." : "Здесь появятся действия бизнесов и администраторов платформы."}
          action={
            filtered ? (
              <ButtonLink variant="secondary" href="/platform/audit">
                Сбросить фильтры
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Бизнес</TableHead>
              <TableHead>Событие</TableHead>
              <TableHead>Кто</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="text-muted-foreground">{eventTimeFormatter.format(event.createdAt)}</TableCell>
                <TableCell>{event.business?.name ?? PLATFORM_SCOPE}</TableCell>
                {/* The raw code stays within reach for support tickets and grep, without shouting from the table. */}
                <TableCell title={event.type}>{auditEventLabel(event.type)}</TableCell>
                <TableCell className="text-muted-foreground">{auditActorLabel(event.actorType)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CursorPager basePath="/platform/audit" query={filterQuery({ ...(businessId ? { businessId } : {}), ...(type ? { type } : {}) })} trail={trail} nextCursor={nextCursor} label="Страницы журнала" />
    </>
  );
}
