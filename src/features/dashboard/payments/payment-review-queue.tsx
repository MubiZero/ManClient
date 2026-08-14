import { ExternalLink, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { formatSomoni } from "@/core/formatting/money";
import { pluralRu } from "@/core/formatting/plural";
import { formatTimeAgo } from "@/core/formatting/relative-time";
import { attentionReasonLabel } from "@/features/receipt-review/attention-reason";
import { ReceiptComparison } from "@/features/receipt-review/receipt-comparison";
import { ReceiptDecisionDialog } from "@/features/receipt-review/receipt-decision-dialog";
import { ReceiptLightbox } from "@/features/receipt-review/receipt-lightbox";
import { Badge } from "@/features/ui-kit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { cn } from "@/features/ui-kit/cn";
import { EmptyState } from "@/features/ui-kit/empty-state";

type ReviewPayment = {
  id: string;
  amountDiram: number;
  receiptAmountDiram: number | null;
  recipientCardSuffix: string | null;
  operationAt: Date | null;
  updatedAt: Date;
  attentionReason: string | null;
  submissions?: Array<{ id: string; status: string; createdAt: Date }>;
  booking: {
    id: string;
    startsAt: Date;
    customer: { name: string; phone: string };
    service: { name: string };
    branch: { name: string; timeZone: string; recipientCardLast4: string | null };
    staff: { displayName: string };
  };
};

type ReviewAction = (formData: FormData) => void | Promise<void>;

export function PaymentReviewQueue({
  payments,
  selected,
  approveAction,
  rejectAction,
}: {
  payments: ReviewPayment[];
  selected: ReviewPayment | null;
  approveAction: ReviewAction;
  rejectAction: ReviewAction;
}) {
  if (!payments.length) {
    return <EmptyState icon={ShieldAlert} title="Все чеки проверены" description="Новые спорные чеки появятся здесь, если данные оплаты потребуют ручной проверки." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
      <Card aria-label="Чеки, ожидающие проверки">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            {payments.length} {reviewCountLabel(payments.length)}
          </CardTitle>
          <span className="text-xs text-muted-foreground">Сначала давние</span>
        </CardHeader>
        <CardContent className="flex max-h-[70vh] flex-col divide-y divide-border overflow-y-auto p-0">
          {payments.map((payment) => {
            const active = payment.id === selected?.id;
            return (
              <Link
                key={payment.id}
                href={`/dashboard/payments/review?paymentId=${encodeURIComponent(payment.id)}`}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col gap-1 px-5 py-3 text-sm transition-colors", active ? "bg-secondary" : "hover:bg-secondary/50")}
              >
                <strong className="text-foreground">{payment.booking.customer.name}</strong>
                <span className="text-muted-foreground">
                  {payment.booking.service.name} · {payment.booking.branch.name}
                </span>
                <div className="flex items-center justify-between pt-1">
                  <Badge variant="danger">{attentionReasonLabel(payment.attentionReason)}</Badge>
                  <time
                    dateTime={payment.updatedAt.toISOString()}
                    title={formatDateTime(payment.updatedAt, payment.booking.branch.timeZone)}
                    className="text-xs text-muted-foreground"
                  >
                    {formatTimeAgo(payment.updatedAt)}
                  </time>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      {selected ? <PaymentReviewCard payment={selected} approveAction={approveAction} rejectAction={rejectAction} /> : null}
    </div>
  );
}

function PaymentReviewCard({ payment, approveAction, rejectAction }: { payment: ReviewPayment; approveAction: ReviewAction; rejectAction: ReviewAction }) {
  const timeZone = payment.booking.branch.timeZone;
  const receipt = payment.submissions?.[0];
  const receiptSrc = receipt ? `/api/dashboard/payments/submissions/${receipt.id}/receipt` : null;
  const decisionSummary = [
    { label: "Клиент", value: payment.booking.customer.name },
    { label: "Услуга", value: `${payment.booking.service.name}, ${formatDateTime(payment.booking.startsAt, timeZone)}` },
    { label: "Сумма к оплате", value: formatSomoni(payment.amountDiram) },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ручная проверка</p>
          <CardTitle className="text-lg">{payment.booking.customer.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {payment.booking.service.name} · {formatDateTime(payment.booking.startsAt, timeZone)}
          </p>
        </div>
        <Badge variant="danger">{attentionReasonLabel(payment.attentionReason)}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Клиент</span>
            <a href={`tel:${payment.booking.customer.phone}`} className="font-medium text-primary hover:underline">
              {payment.booking.customer.phone}
            </a>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Специалист</span>
            <strong className="text-foreground">{payment.booking.staff.displayName}</strong>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Филиал</span>
            <strong className="text-foreground">{payment.booking.branch.name}</strong>
          </div>
          <div className="flex flex-col sm:col-span-3">
            <span className="text-muted-foreground">Ждёт проверки</span>
            <strong className="text-foreground">
              {formatTimeAgo(payment.updatedAt)}
              <span className="font-normal text-muted-foreground"> · {formatDateTime(payment.updatedAt, timeZone)} по времени филиала</span>
            </strong>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Сверка оплаты</h3>
          <ReceiptComparison
            rows={[
              {
                label: "Сумма",
                expected: formatSomoni(payment.amountDiram),
                actual: payment.receiptAmountDiram === null ? "Не распознана" : formatSomoni(payment.receiptAmountDiram),
                mismatch: payment.receiptAmountDiram !== payment.amountDiram,
              },
              {
                label: "Карта",
                expected: cardSuffix(payment.booking.branch.recipientCardLast4),
                actual: cardSuffix(payment.recipientCardSuffix),
                mismatch: payment.recipientCardSuffix !== payment.booking.branch.recipientCardLast4,
              },
              {
                label: "Время операции",
                expected: "До окончания брони",
                actual: payment.operationAt ? formatDateTime(payment.operationAt, timeZone) : "Не распознано",
                mismatch: payment.attentionReason === "OPERATION_TIME_MISMATCH",
              },
            ]}
          />
        </div>

        {receiptSrc ? (
          <div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Изображение чека</h3>
            <p className="mb-2 text-sm text-muted-foreground">Нажмите на изображение, чтобы увеличить и визуально сверить данные.</p>
            <ReceiptLightbox src={receiptSrc} alt="Чек, отправленный клиентом" />
            <a href={receiptSrc} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <ExternalLink className="size-3.5" /> Открыть в новой вкладке
            </a>
          </div>
        ) : (
          <p className="text-sm text-destructive" role="alert">
            Изображение чека недоступно. Не подтверждайте оплату без сверки.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <ReceiptDecisionDialog
            action={approveAction}
            idField="paymentId"
            idValues={[payment.id]}
            variant="primary"
            triggerLabel="Подтвердить оплату"
            title="Подтвердить оплату?"
            description="Подтверждайте только после сверки чека: запись станет подтверждённой, а отменить это решение нельзя."
            summary={decisionSummary}
            note={{
              label: "Комментарий к подтверждению",
              placeholder: "Например, сумма подтверждена по чеку",
              hint: "Необязательно. Останется в истории записи.",
            }}
            confirmLabel="Да, подтвердить"
            pendingLabel="Подтверждаем…"
          />
          <ReceiptDecisionDialog
            action={rejectAction}
            idField="paymentId"
            idValues={[payment.id]}
            variant="destructive"
            triggerLabel="Отклонить чек"
            title="Отклонить чек?"
            description="Клиент получит уведомление об отказе и сможет прислать другой чек. Запись останется неподтверждённой."
            summary={decisionSummary}
            note={{
              label: "Причина отклонения",
              placeholder: "Например, сумма в чеке не совпадает",
              hint: "От 3 до 300 символов. Причина сохранится в истории записи.",
              required: true,
            }}
            confirmLabel="Да, отклонить"
            pendingLabel="Отклоняем…"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function cardSuffix(value: string | null) {
  return value ? `•••• ${value}` : "Не распознана";
}
function formatDateTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-TJ", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(value);
}
function reviewCountLabel(value: number) {
  return pluralRu(value, { one: "чек", few: "чека", many: "чеков" });
}
