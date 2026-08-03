import { notFound, redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { approvePaymentReview, getPaymentForReview, listPaymentsForReview, PaymentReviewError, rejectPaymentReview } from "@/core/payments/payment-review-service";
import { PaymentReviewQueue } from "@/features/dashboard/payments/payment-review-queue";
import { ButtonLink } from "@/features/ui-kit/button";
import { PageHeader } from "@/features/ui-kit/page-header";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ paymentId?: string; notice?: string; error?: string }> };

export default async function PaymentReviewPage({ searchParams }: PageProps) {
  const membership = await requireBusinessAdmin();
  const query = await searchParams;
  const payments = await listPaymentsForReview({ businessId: membership.businessId, actorUserId: membership.userId });
  const selectedId = query.paymentId ?? payments[0]?.id;
  let selected = null;
  if (selectedId) {
    try { selected = await getPaymentForReview({ businessId: membership.businessId, actorUserId: membership.userId, paymentId: selectedId }); }
    catch (error) { if (error instanceof PaymentReviewError && error.code === "NOT_FOUND") notFound(); throw error; }
  }

  async function approve(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const paymentId = String(formData.get("paymentId") ?? "");
    try { await approvePaymentReview({ businessId: current.businessId, actorUserId: current.userId, paymentId, reason: String(formData.get("reason") ?? "") }); }
    catch (error) { redirect(`/dashboard/payments/review?paymentId=${encodeURIComponent(paymentId)}&error=${errorCode(error)}`); }
    redirect("/dashboard/payments/review?notice=approved");
  }

  async function reject(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const paymentId = String(formData.get("paymentId") ?? "");
    try { await rejectPaymentReview({ businessId: current.businessId, actorUserId: current.userId, paymentId, reason: String(formData.get("reason") ?? "") }); }
    catch (error) { redirect(`/dashboard/payments/review?paymentId=${encodeURIComponent(paymentId)}&error=${errorCode(error)}`); }
    redirect("/dashboard/payments/review?notice=rejected");
  }

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice)} error={errorMessage(query.error)} />
      <PageHeader
        eyebrow="Оплата"
        title="Проверка чеков"
        description="Сверьте спорные данные с записью и примите решение. Сначала показаны самые давние чеки."
        action={
          <ButtonLink href="/api/dashboard/export/payments" variant="secondary">
            Экспорт CSV
          </ButtonLink>
        }
      />
      <PaymentReviewQueue payments={payments} selected={selected} approveAction={approve} rejectAction={reject} />
    </>
  );
}

function errorCode(error: unknown) { return error instanceof PaymentReviewError ? error.code : "INVALID_INPUT"; }
function noticeMessage(code?: string) { return ({ approved: "Оплата подтверждена, запись сохранена.", rejected: "Чек отклонён. Решение сохранено в истории записи." } as Record<string, string>)[code ?? ""]; }
function errorMessage(code?: string) { return ({ INVALID_INPUT: "Укажите понятную причину длиной от 3 до 300 символов.", INVALID_STATUS: "Этот чек уже обработан или запись больше нельзя подтвердить.", FORBIDDEN: "У вас нет доступа к проверке чеков.", NOT_FOUND: "Чек не найден или уже обработан." } as Record<string, string>)[code ?? ""]; }
