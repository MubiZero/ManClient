import Link from "next/link";

import { formatSomoni } from "@/core/formatting/money";
import { listAttentionPaymentsAcrossBusinesses } from "@/core/platform/platform-payments";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

export default async function PlatformPaymentsPage() {
  const payments = await listAttentionPaymentsAcrossBusinesses();

  return (
    <>
      <PageHeader eyebrow="Платформа" title="Оплаты, требующие внимания" description={`${payments.length} по всем бизнесам`} />

      {payments.length === 0 ? (
        <EmptyState title="Нет проблемных оплат" description="Все чеки по всем бизнесам обработаны." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Бизнес</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Услуга</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Обновлено</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <Link href={`/platform/businesses/${payment.business.id}`} className="font-medium text-foreground hover:underline">
                    {payment.business.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {payment.booking.customer.name}
                  <p className="text-xs text-muted-foreground">{payment.booking.customer.phone}</p>
                </TableCell>
                <TableCell>{payment.booking.service.name}</TableCell>
                <TableCell>{formatSomoni(payment.amountDiram)}</TableCell>
                <TableCell className="text-muted-foreground">{payment.attentionReason ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{payment.updatedAt.toLocaleString("ru-RU")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
