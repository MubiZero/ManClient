import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { formatSomoni } from "@/core/formatting/money";
import { PERIOD_LABELS } from "@/core/platform/plan-pricing";
import { PlatformError } from "@/core/platform/platform-error";
import { PLAN_LABELS } from "@/core/platform/subscription-plans";
import {
  approveSubscriptionReceipt,
  listSubscriptionReceiptsForReview,
  rejectSubscriptionReceipt,
} from "@/core/platform/subscription-receipt-service";
import { Button } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Input } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ notice?: string; error?: string }> };

export default async function PlatformSubscriptionsPage({ searchParams }: PageProps) {
  const admin = await requirePlatformAdmin();
  const query = await searchParams;
  const receipts = await listSubscriptionReceiptsForReview({ actorUserId: admin.userId });

  async function approve(formData: FormData) {
    "use server";
    const actor = await requirePlatformAdmin();
    try {
      await approveSubscriptionReceipt({ receiptId: String(formData.get("receiptId") ?? ""), actorUserId: actor.userId });
    } catch (error) {
      redirect(`/platform/subscriptions?error=${errorCode(error)}`);
    }
    redirect("/platform/subscriptions?notice=approved");
  }

  async function reject(formData: FormData) {
    "use server";
    const actor = await requirePlatformAdmin();
    try {
      await rejectSubscriptionReceipt({
        receiptId: String(formData.get("receiptId") ?? ""),
        actorUserId: actor.userId,
        reason: String(formData.get("reason") ?? ""),
      });
    } catch (error) {
      redirect(`/platform/subscriptions?error=${errorCode(error)}`);
    }
    redirect("/platform/subscriptions?notice=rejected");
  }

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice)} error={errorMessage(query.error)} />
      <PageHeader
        eyebrow="Платформа"
        title="Оплата подписок"
        description="Переводы, которые не удалось сверить автоматически. Подтверждение продлевает период, отказ оставляет счёт неоплаченным — бизнес может прислать другой чек."
      />

      {receipts.length === 0 ? (
        <EmptyState title="Очередь пуста" description="Все присланные переводы сошлись со счетами автоматически." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Бизнес</TableHead>
              <TableHead>Счёт</TableHead>
              <TableHead>Ожидалось</TableHead>
              <TableHead>В чеке</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Чек</TableHead>
              <TableHead>Решение</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.map((receipt) => (
              <TableRow key={receipt.id}>
                <TableCell>
                  <Link href={`/platform/businesses/${receipt.business.id}`} className="font-medium text-foreground hover:underline">
                    {receipt.business.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {receipt.invoice.reference}
                  <span className="block text-muted-foreground">
                    {PLAN_LABELS[receipt.invoice.plan]} · {PERIOD_LABELS[receipt.invoice.period]}
                  </span>
                </TableCell>
                <TableCell>{formatSomoni(receipt.invoice.amountDiram)}</TableCell>
                <TableCell>
                  {receipt.parsedAmountDiram === null ? "—" : formatSomoni(receipt.parsedAmountDiram)}
                  <span className="block text-muted-foreground">
                    {receipt.parsedCardSuffix ? `карта …${receipt.parsedCardSuffix}` : "карта не распознана"}
                  </span>
                </TableCell>
                <TableCell>{reasonLabel(receipt.attentionReason)}</TableCell>
                <TableCell>
                  <Link href={`/api/platform/subscriptions/${receipt.id}/receipt`} target="_blank" className="text-sm font-medium hover:underline">
                    Открыть
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <form action={approve}>
                      <input type="hidden" name="receiptId" value={receipt.id} />
                      <Button type="submit" variant="secondary">Подтвердить оплату</Button>
                    </form>
                    <form action={reject} className="flex flex-col gap-1.5">
                      <input type="hidden" name="receiptId" value={receipt.id} />
                      <Input name="reason" placeholder="Причина отказа" required />
                      <Button type="submit" variant="quiet">Отклонить</Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

function reasonLabel(code: string | null) {
  return ({
    AMOUNT_MISMATCH: "Сумма не совпала со счётом",
    RECIPIENT_MISMATCH: "Перевод не на карту платформы",
    OPERATION_TIME_MISMATCH: "Дата перевода вне срока счёта",
    RECEIPT_NOT_SUCCESSFUL: "В чеке не написано «успешно»",
    OCR_UNRELIABLE: "Чек не удалось прочитать",
  } as Record<string, string>)[code ?? ""] ?? "Требует проверки";
}

function errorCode(error: unknown) {
  return error instanceof PlatformError ? error.code : "PROCESSING_FAILED";
}
function noticeMessage(code?: string) {
  return ({ approved: "Оплата подтверждена, период продлён.", rejected: "Чек отклонён, счёт остался неоплаченным." } as Record<string, string>)[code ?? ""];
}
function errorMessage(code?: string) {
  return ({
    NOT_FOUND: "Этот чек уже обработан кем-то другим.",
    INVALID_INPUT: "Укажите причину отказа — её увидит бизнес в переписке с оператором.",
    FORBIDDEN: "Решение по оплате принимает только администратор платформы.",
    PROCESSING_FAILED: "Не удалось сохранить решение. Попробуйте ещё раз.",
  } as Record<string, string>)[code ?? ""];
}
