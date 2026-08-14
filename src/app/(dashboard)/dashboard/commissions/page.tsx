import { Wallet } from "lucide-react";
import Link from "next/link";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { listCommissionEntries, sumCommissionsDiram } from "@/core/dashboard/commission-report";
import { prisma } from "@/core/database/prisma";
import { formatSomoni } from "@/core/formatting/money";
import { businessHasFeature, PLAN_LABELS } from "@/core/platform/subscription-plans";
import { CommissionFilters } from "@/features/dashboard/commission-filters";
import { CursorPager, currentCursor, filterQuery, readPageTrail } from "@/features/ui-kit/cursor-pager";
import { ButtonLink } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { StatCard } from "@/features/ui-kit/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CommissionsPage({ searchParams }: PageProps) {
  const membership = await requireBusinessAdmin();
  const rawQuery = await searchParams;
  const trail = readPageTrail(rawQuery.trail);
  const query = compactQuery(rawQuery);

  if (!businessHasFeature(membership.business, "STAFF_COMMISSIONS")) {
    return (
      <>
        <PageHeader eyebrow="Персонал" title="Комиссии" description="Учёт комиссионных начислений специалистам." />
        <EmptyState
          icon={Wallet}
          title="Учёт комиссий доступен на тарифе Премиум"
          description={`Сейчас у вас тариф «${PLAN_LABELS[membership.business.subscriptionPlan]}». Перейдите на «${PLAN_LABELS.PREMIUM}», чтобы начислять и отслеживать комиссии специалистов за принятые оплаты.`}
          // Naming the plan is only half the offer: without a way there the owner has to guess that the
          // switch lives in the last item of the settings list.
          action={<ButtonLink href="/dashboard/settings/plan">Подключить «{PLAN_LABELS.PREMIUM}»</ButtonLink>}
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
  const filtered = Boolean(query.staffId || query.from || query.to);

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
        // An empty report reads very differently depending on why it is empty: a narrow filter is the
        // reader's own doing and has an undo, an empty ledger is just how a business starts.
        <EmptyState
          title={filtered ? "Ничего не найдено" : "Начислений пока нет"}
          description={filtered
            ? "За выбранный период и специалиста комиссии не начислялись. Расширьте период или сбросьте фильтры."
            : "Комиссия начисляется сама, когда оплата за визит принята, а у специалиста задан процент."}
          action={filtered ? <ButtonLink href="/dashboard/commissions" variant="secondary" size="sm">Сбросить фильтры</ButtonLink> : undefined}
        />
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

      <CursorPager basePath="/dashboard/commissions" query={filterQuery(query)} trail={trail} nextCursor={result.nextCursor} label="Страницы начислений" />
    </>
  );
}

function compactQuery(query: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
}
