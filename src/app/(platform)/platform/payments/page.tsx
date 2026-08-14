import { redirect } from "next/navigation";
import Link from "next/link";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { listAttentionPaymentsAcrossBusinesses } from "@/core/platform/platform-payments";
import {
  approvePaymentAsPlatformAdmin,
  bulkApprovePaymentsAsPlatformAdmin,
  bulkRejectPaymentsAsPlatformAdmin,
  PaymentReviewError,
  rejectPaymentAsPlatformAdmin,
} from "@/core/payments/payment-review-service";
import { AttentionPaymentsQueue } from "@/features/platform/attention-payments-queue";
import { CursorPager, currentCursor, filterQuery, readPageTrail } from "@/features/ui-kit/cursor-pager";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ notice?: string; error?: string; cursor?: string; approved?: string; skipped?: string; trail?: string }> };

export default async function PlatformPaymentsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const trail = readPageTrail(query.trail);
  const { items: payments, nextCursor } = await listAttentionPaymentsAcrossBusinesses({ cursor: currentCursor(trail) });

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
    const reason = String(formData.get("reason") ?? "");
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
        <AttentionPaymentsQueue
          payments={payments}
          approveAction={approve}
          rejectAction={reject}
          bulkApproveAction={bulkApprove}
          bulkRejectAction={bulkReject}
        />
      )}

      <CursorPager basePath="/platform/payments" query={filterQuery(query)} trail={trail} nextCursor={nextCursor} label="Страницы чеков" />
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
