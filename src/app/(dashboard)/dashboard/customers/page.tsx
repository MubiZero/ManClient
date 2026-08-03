import { Users } from "lucide-react";
import Link from "next/link";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { listCustomers } from "@/core/dashboard/customer-directory";
import { formatSomoni } from "@/core/formatting/money";
import { Badge } from "@/features/ui-kit/badge";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Input } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

type PageProps = { searchParams: Promise<{ search?: string; cursor?: string }> };

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export default async function CustomersPage({ searchParams }: PageProps) {
  const membership = await requireBusinessAdmin();
  const query = await searchParams;
  const search = query.search?.trim() || undefined;
  const result = await listCustomers({ businessId: membership.businessId, search, cursor: query.cursor });

  return (
    <>
      <PageHeader eyebrow="Бизнес" title="Клиенты" description="База клиентов бизнеса и история их визитов." />

      <form className="flex flex-wrap items-center gap-3" method="get">
        <label htmlFor="customer-search" className="sr-only">
          Поиск
        </label>
        <Input id="customer-search" name="search" defaultValue={search ?? ""} placeholder="Имя или телефон" className="w-64" />
        <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
          Найти
        </button>
        {search ? (
          <Link href="/dashboard/customers" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Сбросить
          </Link>
        ) : null}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "Ничего не найдено" : "Клиентов пока нет"}
          description={search ? "Попробуйте изменить запрос поиска." : "Как только появятся первые записи, здесь будет видна база клиентов."}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Клиент</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Записей</TableHead>
              <TableHead>Потрачено</TableHead>
              <TableHead>Последний визит</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium text-foreground">{customer.name}</TableCell>
                <TableCell className="text-muted-foreground">{customer.phone}</TableCell>
                <TableCell>
                  <Badge variant={customer.telegramLinked ? "success" : "neutral"}>{customer.telegramLinked ? "Подключён" : "Не подключён"}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{customer.totalBookings}</TableCell>
                <TableCell className="text-muted-foreground">{formatSomoni(customer.totalSpentDiram)}</TableCell>
                <TableCell className="text-muted-foreground">{customer.lastVisit ? dateFormatter.format(customer.lastVisit) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {result.nextCursor ? (
        <Link
          href={`/dashboard/customers?${new URLSearchParams({ ...(search ? { search } : {}), cursor: result.nextCursor }).toString()}`}
          className="w-fit rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Показать ещё
        </Link>
      ) : null}
    </>
  );
}
