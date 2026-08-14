import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { PlatformError } from "@/core/platform/platform-error";
import { platformPaymentCard } from "@/core/platform/platform-payment-card";
import {
  approveSubscriptionReceipt,
  listSubscriptionReceiptsForReview,
  rejectSubscriptionReceipt,
} from "@/core/platform/subscription-receipt-service";
import { SubscriptionReceiptQueue } from "@/features/platform/subscription-receipt-queue";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
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
        <SubscriptionReceiptQueue
          receipts={receipts}
          platformCardSuffix={platformPaymentCard()?.slice(-4) ?? null}
          approveAction={approve}
          rejectAction={reject}
        />
      )}
    </>
  );
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
