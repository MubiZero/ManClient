import { Search } from "lucide-react";
import Link from "next/link";

import { listBusinesses } from "@/core/platform/business-directory";
import { Badge } from "@/features/ui-kit/badge";
import { Button } from "@/features/ui-kit/button";
import { Input } from "@/features/ui-kit/field";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

export default async function PlatformBusinessesPage({ searchParams }: { searchParams: Promise<{ q?: string; cursor?: string }> }) {
  const { q, cursor } = await searchParams;
  const { items: businesses, nextCursor } = await listBusinesses(q, { cursor });

  return (
    <>
      <PageHeader
        eyebrow="Платформа"
        title="Бизнесы"
        description={cursor ? "Следующая страница" : `Показаны первые ${businesses.length}`}
        action={
          <Link href="/platform/businesses/new">
            <Button type="button">Создать бизнес</Button>
          </Link>
        }
      />

      <form className="max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Поиск по названию или slug" className="pl-9" />
        </div>
      </form>

      {businesses.length === 0 ? (
        <EmptyState title="Бизнесы не найдены" description="Измените запрос поиска." />
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

      {nextCursor ? (
        <Link
          href={`/platform/businesses?${new URLSearchParams({ ...(q ? { q } : {}), cursor: nextCursor }).toString()}`}
          className="text-sm font-medium text-foreground hover:underline"
        >
          Следующая страница →
        </Link>
      ) : null}
    </>
  );
}
