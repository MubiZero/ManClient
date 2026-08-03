import { Wallet } from "lucide-react";
import Link from "next/link";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { listCommissionEntries, sumCommissionsDiram } from "@/core/dashboard/commission-report";
import { prisma } from "@/core/database/prisma";
import { formatSomoni } from "@/core/formatting/money";
import { businessHasFeature, PLAN_LABELS } from "@/core/platform/subscription-plans";
import { CommissionFilters } from "@/features/dashboard/commission-filters";
import { ButtonLink } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { StatCard } from "@/features/ui-kit/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CommissionsPage({ searchParams }: PageProps) {
  const membership = await requireBusinessAdmin();
  const query = compactQuery(await searchParams);

  if (!businessHasFeature(membership.business.subscriptionPlan, "STAFF_COMMISSIONS")) {
    return (
      <>
        <PageHeader eyebrow="Персонал" title="Комиссии" description="Учёт комиссионных начислений специалистам." />
        <EmptyState
          icon={Wallet}
          title="Учёт комиссий доступен на тарифе Премиум"
          description={`Сейчас у вас тариф «${PLAN_LABELS[membership.business.subscriptionPlan]}». Перейдите на «${PLAN_LABELS.PREMIUM}», чтобы начислять и отслеживать комиссии специалистов за принятые оплаты.`}
        />
      </>
    );
  }

  const filters = {
    staffId: query.staffId || undefined,
    from: query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
    to: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
  };

  const [staff, result, totalDiram] = await Promise.all([
    prisma.staffMember.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    listCommissionEntries(membership.businessId, filters),
    sumCommissionsDiram(membership.businessId, filters),
  ]);

  const exportQuery = new URLSearchParams(query as Record<string, string>).toString();

  return (
    <>
      <PageHeader
        eyebrow="Персонал"
        title="Комиссии"
        description="Комиссионные начисления специалистам за принятые оплаты."
        action={
          <ButtonLink href={`/api/dashboard/export/commissions${exportQuery ? `?${exportQuery}` : ""}`} variant="secondary">
            Экспорт CSV
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Начислено комиссий" value={formatSomoni(totalDiram)} icon={Wallet} />
      </div>

      <CommissionFilters staffId={query.staffId} from={query.from} to={query.to} staff={staff} />

      {result.items.length === 0 ? (
        <EmptyState title="Нет начислений" description="За выбранный период комиссии не начислялись." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Специалист</TableHead>
              <TableHead>Услуга</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>%</TableHead>
              <TableHead>Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-muted-foreground">{item.booking.startsAt.toLocaleDateString("ru-RU")}</TableCell>
                <TableCell className="font-medium text-foreground">{item.staff.displayName}</TableCell>
                <TableCell className="text-muted-foreground">{item.booking.service.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.booking.customer.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.percent}%</TableCell>
                <TableCell className="font-medium text-foreground">{formatSomoni(item.amountDiram)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {result.nextCursor ? (
        <Link
          href={`/dashboard/commissions?${new URLSearchParams({ ...query, cursor: result.nextCursor }).toString()}`}
          className="w-fit rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Показать ещё
        </Link>
      ) : null}
    </>
  );
}

function compactQuery(query: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
}
