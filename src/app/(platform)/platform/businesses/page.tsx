import { Search } from "lucide-react";
import Link from "next/link";

import { listBusinesses } from "@/core/platform/business-directory";
import { CursorPager, currentCursor, filterQuery, readPageTrail } from "@/features/ui-kit/cursor-pager";
import { Badge } from "@/features/ui-kit/badge";
import { Button, ButtonLink } from "@/features/ui-kit/button";
import { Input } from "@/features/ui-kit/field";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

export default async function PlatformBusinessesPage({ searchParams }: { searchParams: Promise<{ q?: string; trail?: string }> }) {
  const { q, trail: rawTrail } = await searchParams;
  const trail = readPageTrail(rawTrail);
  const { items: businesses, nextCursor } = await listBusinesses(q, { cursor: currentCursor(trail) });

  return (
    <>
      <PageHeader
        eyebrow="Платформа"
        title="Бизнесы"
        description={trail.length ? `Страница ${trail.length + 1}` : businesses.length ? `Показаны первые ${businesses.length}` : "Все бизнесы платформы"}
        action={
          <ButtonLink href="/platform/businesses/new">Создать бизнес</ButtonLink>
        }
      />

      <form className="max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Поиск по названию или slug" className="pl-9" />
        </div>
      </form>

      {businesses.length === 0 ? (
        <EmptyState
          title={q ? "Бизнесы не найдены" : "Бизнесов пока нет"}
          description={q ? "Попробуйте изменить запрос поиска." : "Здесь появятся компании, как только они зарегистрируются."}
          action={q ? <ButtonLink href="/platform/businesses" variant="secondary" size="sm">Сбросить поиск</ButtonLink> : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Бизнес</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Telegram-бот</TableHead>
              <TableHead>Филиалов</TableHead>
              <TableHead>Сотрудников</TableHead>
              <TableHead>Записей</TableHead>
              <TableHead>Создан</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.map((business) => {
              const integration = business.telegramIntegrations[0];
              return (
                <TableRow key={business.id}>
                  <TableCell>
                    <Link href={`/platform/businesses/${business.id}`} className="font-medium text-foreground hover:underline">
                      {business.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">/{business.slug}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={business.status === "ACTIVE" ? "success" : "danger"} dot>
                      {business.status === "ACTIVE" ? "Активен" : "Приостановлен"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {integration ? (
                      <Badge variant={integration.status === "ACTIVE" ? "success" : "warning"}>@{integration.botUsername}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Не подключён</span>
                    )}
                  </TableCell>
                  <TableCell>{business._count.branches}</TableCell>
                  <TableCell>{business._count.staffMembers}</TableCell>
                  <TableCell>{business._count.bookings}</TableCell>
                  <TableCell className="text-muted-foreground">{business.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <CursorPager basePath="/platform/businesses" query={filterQuery({ ...(q ? { q } : {}) })} trail={trail} nextCursor={nextCursor} label="Страницы бизнесов" />
    </>
  );
}
