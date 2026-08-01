import { redirect } from "next/navigation";
import Link from "next/link";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { formatSomoni } from "@/core/formatting/money";
import { listAttentionPaymentsAcrossBusinesses } from "@/core/platform/platform-payments";
import { approvePaymentAsPlatformAdmin, PaymentReviewError, rejectPaymentAsPlatformAdmin } from "@/core/payments/payment-review-service";
import { Button } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Input } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ notice?: string; error?: string; cursor?: string }> };

export default async function PlatformPaymentsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const { items: payments, nextCursor } = await listAttentionPaymentsAcrossBusinesses({ cursor: query.cursor });

  async function approve(formData: FormData) {
    "use server";
    const admin = await requirePlatformAdmin();
    const paymentId = String(formData.get("paymentId") ?? "");
    try {
      await approvePaymentAsPlatformAdmin({ paymentId, actorUserId: admin.userId });
    } catch (error) {
      redirect(`/platform/payments?error=${errorCode(error)}`);
    }
    redirect("/platform/payments?notice=approved");
  }

  async function reject(formData: FormData) {
    "use server";
    const admin = await requirePlatformAdmin();
    const paymentId = String(formData.get("paymentId") ?? "");
    try {
      await rejectPaymentAsPlatformAdmin({ paymentId, actorUserId: admin.userId, reason: String(formData.get("reason") ?? "") });
    } catch (error) {
      redirect(`/platform/payments?error=${errorCode(error)}`);
    }
    redirect("/platform/payments?notice=rejected");
  }

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice)} error={errorMessage(query.error)} />
      <PageHeader eyebrow="Платформа" title="Оплаты, требующие внимания" description={`Показано ${payments.length} по всем бизнесам`} />

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
              <TableHead>Решение</TableHead>
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
                <TableCell>
                  <form className="flex items-center gap-2">
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <Input name="reason" placeholder="Причина отклонения" className="h-8 w-40 text-[13px]" />
                    <Button type="submit" formAction={approve} size="sm" variant="secondary">
                      Подтвердить
                    </Button>
                    <Button type="submit" formAction={reject} size="sm" variant="destructive">
                      Отклонить
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {nextCursor ? (
        <Link href={`/platform/payments?cursor=${nextCursor}`} className="text-sm font-medium text-foreground hover:underline">
          Следующая страница →
        </Link>
      ) : null}
    </>
  );
}

function errorCode(error: unknown) {
  return error instanceof PaymentReviewError ? error.code : "INVALID_INPUT";
}
function noticeMessage(code?: string) {
  return ({ approved: "Оплата подтверждена, запись сохранена.", rejected: "Чек отклонён." } as Record<string, string>)[code ?? ""];
}
function errorMessage(code?: string) {
  return ({
    INVALID_INPUT: "Укажите причину отклонения длиной от 3 до 300 символов.",
    INVALID_STATUS: "Этот чек уже обработан или запись больше нельзя подтвердить.",
    NOT_FOUND: "Чек не найден или уже обработан.",
  } as Record<string, string>)[code ?? ""];
}
