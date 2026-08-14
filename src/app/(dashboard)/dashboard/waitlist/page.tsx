import { Hourglass } from "lucide-react";
import Link from "next/link";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { cancelWaitlistEntry, listWaitlistEntries } from "@/core/bookings/waitlist-service";
import { businessHasFeature, PLAN_LABELS } from "@/core/platform/subscription-plans";
import { Badge } from "@/features/ui-kit/badge";
import { Button, ButtonLink } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

type PageProps = { searchParams: Promise<{ cursor?: string }> };

const STATUS_LABELS = {
  WAITING: "Ожидает",
  NOTIFIED: "Уведомлён",
  CONVERTED: "Записан",
  CANCELLED: "Отменён",
} as const;

const STATUS_VARIANTS = {
  WAITING: "warning",
  NOTIFIED: "neutral",
  CONVERTED: "success",
  CANCELLED: "danger",
} as const;

function formatRange(from: Date, to: Date) {
  const format = (value: Date) => value.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return `${format(from)} — ${format(to)}`;
}

export default async function WaitlistPage({ searchParams }: PageProps) {
  const membership = await requireBusinessAdmin();

  if (!businessHasFeature(membership.business, "WAITLIST")) {
    return (
      <>
        <PageHeader eyebrow="Клиенты" title="Лист ожидания" description="Клиенты, которые ждут освободившийся слот." />
        <EmptyState
          icon={Hourglass}
          title="Лист ожидания доступен на тарифе Стандарт"
          description={`Сейчас у вас тариф «${PLAN_LABELS[membership.business.subscriptionPlan]}». Перейдите на «${PLAN_LABELS.STANDARD}» или выше, чтобы собирать заявки на освободившиеся слоты.`}
          // Naming the plan is only half the offer: without a way there the owner has to guess that the
          // switch lives in the last item of the settings list.
          action={<ButtonLink href="/dashboard/settings/plan">Подключить «{PLAN_LABELS.STANDARD}»</ButtonLink>}
        />
      </>
    );
  }

  const { cursor } = await searchParams;
  const { items, nextCursor } = await listWaitlistEntries(membership.businessId, cursor);

  async function cancelEntry(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    await cancelWaitlistEntry({ businessId: current.businessId, waitlistEntryId: String(formData.get("waitlistEntryId") ?? "") });
  }

  return (
    <>
      <PageHeader eyebrow="Клиенты" title="Лист ожидания" description="Клиенты, которые ждут освободившийся слот." />

      {items.length === 0 ? (
        <EmptyState title="Лист ожидания пуст" description="Заявки появятся, когда клиент не найдёт свободного времени и оставит заявку на публичной странице." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Добавлен</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Услуга</TableHead>
              <TableHead>Филиал</TableHead>
              <TableHead>Желаемый период</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground">{entry.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                <TableCell>
                  <span className="font-medium text-foreground">{entry.customerName}</span>
                  <p className="text-xs text-muted-foreground">{entry.customerPhone}</p>
                </TableCell>
                <TableCell>{entry.serviceName}</TableCell>
                <TableCell className="text-muted-foreground">{entry.branchName}</TableCell>
                <TableCell className="text-muted-foreground">{formatRange(entry.desiredFrom, entry.desiredTo)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[entry.status]}>{STATUS_LABELS[entry.status]}</Badge>
                </TableCell>
                <TableCell>
                  {entry.status === "WAITING" || entry.status === "NOTIFIED" ? (
                    <form action={cancelEntry}>
                      <input type="hidden" name="waitlistEntryId" value={entry.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Убрать
                      </Button>
                    </form>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {nextCursor ? (
        <Link href={`/dashboard/waitlist?cursor=${nextCursor}`} className="text-sm font-medium text-foreground hover:underline">
          Следующая страница →
        </Link>
      ) : null}
    </>
  );
}
