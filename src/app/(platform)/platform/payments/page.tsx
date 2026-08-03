import { redirect } from "next/navigation";
import Link from "next/link";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { formatSomoni } from "@/core/formatting/money";
import { listAttentionPaymentsAcrossBusinesses } from "@/core/platform/platform-payments";
import {
  approvePaymentAsPlatformAdmin,
  bulkApprovePaymentsAsPlatformAdmin,
  bulkRejectPaymentsAsPlatformAdmin,
  PaymentReviewError,
  rejectPaymentAsPlatformAdmin,
} from "@/core/payments/payment-review-service";
import { Button } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Input } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ notice?: string; error?: string; cursor?: string; approved?: string; skipped?: string }> };

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

  async function bulkApprove(formData: FormData) {
    "use server";
    const admin = await requirePlatformAdmin();
    const paymentIds = formData.getAll("paymentIds").map(String).filter(Boolean);
    if (paymentIds.length === 0) redirect("/platform/payments?error=INVALID_INPUT");
    const { approved, skipped } = await bulkApprovePaymentsAsPlatformAdmin({ paymentIds, actorUserId: admin.userId });
    redirect(`/platform/payments?notice=bulk_approved&approved=${approved}&skipped=${skipped}`);
  }

  async function bulkReject(formData: FormData) {
    "use server";
    const admin = await requirePlatformAdmin();
    const paymentIds = formData.getAll("paymentIds").map(String).filter(Boolean);
    const reason = String(formData.get("bulkReason") ?? "");
    if (paymentIds.length === 0 || reason.trim().length < 3) redirect("/platform/payments?error=INVALID_INPUT");
    const { rejected, skipped } = await bulkRejectPaymentsAsPlatformAdmin({ paymentIds, actorUserId: admin.userId, reason });
    redirect(`/platform/payments?notice=bulk_rejected&approved=${rejected}&skipped=${skipped}`);
  }

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice, query.approved, query.skipped)} error={errorMessage(query.error)} />
      <PageHeader eyebrow="Платформа" title="Оплаты, требующие внимания" description={`Показано ${payments.length} по всем бизнесам`} />

      {payments.length === 0 ? (
        <EmptyState title="Нет проблемных оплат" description="Все чеки по всем бизнесам обработаны." />
      ) : (
        <div className="flex flex-col gap-3">
          <form id="bulk-payments-form" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">Массовое решение по отмеченным строкам:</span>
            <Input name="bulkReason" placeholder="Причина отклонения (для отмены)" className="h-8 w-56 text-[13px]" />
            <Button type="submit" formAction={bulkApprove} size="sm" variant="secondary">
              Подтвердить отмеченные
            </Button>
            <Button type="submit" formAction={bulkReject} size="sm" variant="destructive">
              Отклонить отмеченные
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
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
                    <input
                      type="checkbox"
                      form="bulk-payments-form"
                      name="paymentIds"
                      value={payment.id}
                      className="size-4"
                      aria-label="Выбрать оплату"
                    />
                  </TableCell>
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
        </div>
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
function noticeMessage(code?: string, approved?: string, skipped?: string) {
  if (code === "bulk_approved") return `Подтверждено: ${approved ?? 0}, пропущено: ${skipped ?? 0}.`;
  if (code === "bulk_rejected") return `Отклонено: ${approved ?? 0}, пропущено: ${skipped ?? 0}.`;
  return ({ approved: "Оплата подтверждена, запись сохранена.", rejected: "Чек отклонён." } as Record<string, string>)[code ?? ""];
}
function errorMessage(code?: string) {
  return ({
    INVALID_INPUT: "Укажите причину отклонения длиной от 3 до 300 символов.",
    INVALID_STATUS: "Этот чек уже обработан или запись больше нельзя подтвердить.",
    NOT_FOUND: "Чек не найден или уже обработан.",
  } as Record<string, string>)[code ?? ""];
}
