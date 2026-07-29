import Link from "next/link";

import { formatSomoni } from "@/core/formatting/money";
import { EmptyState } from "@/features/ui/empty-state";
import { StatusBadge } from "@/features/ui/status-badge";
import { SubmitButton } from "@/features/ui/submit-button";

type ReviewPayment = {
  id: string;
  amountDiram: number;
  receiptAmountDiram: number | null;
  recipientCardSuffix: string | null;
  operationAt: Date | null;
  updatedAt: Date;
  attentionReason: string | null;
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
    return <EmptyState title="Все чеки проверены" description="Новые спорные чеки появятся здесь, если данные оплаты потребуют ручной проверки." />;
  }

  return (
    <div className="payment-review-layout">
      <section className="payment-review-list" aria-label="Чеки, ожидающие проверки">
        <header><strong>{payments.length} {reviewCountLabel(payments.length)}</strong><span>Сначала самые давние</span></header>
        {payments.map(payment => {
          const active = payment.id === selected?.id;
          return <Link key={payment.id} href={`/dashboard/payments/review?paymentId=${encodeURIComponent(payment.id)}`} aria-current={active ? "page" : undefined}>
            <div><strong>{payment.booking.customer.name}</strong><span>{payment.booking.service.name} · {payment.booking.branch.name}</span></div>
            <div><StatusBadge tone="danger">{attentionReasonLabel(payment.attentionReason)}</StatusBadge><time dateTime={payment.updatedAt.toISOString()}>{formatRelativeAge(payment.updatedAt)}</time></div>
          </Link>;
        })}
      </section>

      {selected ? <PaymentReviewCard payment={selected} approveAction={approveAction} rejectAction={rejectAction} /> : null}
    </div>
  );
}

function PaymentReviewCard({ payment, approveAction, rejectAction }: { payment: ReviewPayment; approveAction: ReviewAction; rejectAction: ReviewAction }) {
  const timeZone = payment.booking.branch.timeZone;
  return (
    <article className="payment-review-card" aria-labelledby="payment-review-title">
      <header>
        <div><p className="context-label">Ручная проверка</p><h2 id="payment-review-title">{payment.booking.customer.name}</h2><p>{payment.booking.service.name} · {formatDateTime(payment.booking.startsAt, timeZone)}</p></div>
        <StatusBadge tone="danger">{attentionReasonLabel(payment.attentionReason)}</StatusBadge>
      </header>

      <section className="payment-review-summary" aria-label="Данные записи">
        <div><span>Клиент</span><strong><a href={`tel:${payment.booking.customer.phone}`}>{payment.booking.customer.phone}</a></strong></div>
        <div><span>Специалист</span><strong>{payment.booking.staff.displayName}</strong></div>
        <div><span>Филиал</span><strong>{payment.booking.branch.name}</strong></div>
      </section>

      <section className="payment-review-comparison" aria-labelledby="comparison-title">
        <h3 id="comparison-title">Сверка оплаты</h3>
        <div className="payment-review-comparison-heading"><span>Поле</span><span>Ожидалось</span><span>В чеке</span></div>
        <ComparisonRow label="Сумма" expected={formatSomoni(payment.amountDiram)} actual={payment.receiptAmountDiram === null ? "Не распознана" : formatSomoni(payment.receiptAmountDiram)} mismatch={payment.receiptAmountDiram !== payment.amountDiram} />
        <ComparisonRow label="Карта" expected={cardSuffix(payment.booking.branch.recipientCardLast4)} actual={cardSuffix(payment.recipientCardSuffix)} mismatch={payment.recipientCardSuffix !== payment.booking.branch.recipientCardLast4} />
        <ComparisonRow label="Время операции" expected="До окончания брони" actual={payment.operationAt ? formatDateTime(payment.operationAt, timeZone) : "Не распознано"} mismatch={payment.attentionReason === "OPERATION_TIME_MISMATCH"} />
      </section>

      <section className="payment-review-actions" aria-labelledby="review-actions-title">
        <div><h3 id="review-actions-title">Решение</h3><p>Подтверждайте оплату только после сверки данных. Действие сохранится в истории записи.</p></div>
        <form action={approveAction}>
          <input type="hidden" name="paymentId" value={payment.id} />
          <label className="ui-field"><span className="ui-field-label">Комментарий к подтверждению</span><input className="ui-input" name="reason" maxLength={300} placeholder="Например, сумма подтверждена по чеку" /></label>
          <SubmitButton idle="Подтвердить оплату" pending="Подтверждаем" />
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="paymentId" value={payment.id} />
          <label className="ui-field"><span className="ui-field-label">Причина отклонения</span><input className="ui-input" name="reason" minLength={3} maxLength={300} required placeholder="Например, сумма в чеке не совпадает" /></label>
          <SubmitButton variant="danger" idle="Отклонить чек" pending="Отклоняем" />
        </form>
      </section>
    </article>
  );
}

function ComparisonRow({ label, expected, actual, mismatch }: { label: string; expected: string; actual: string; mismatch: boolean }) {
  return <div className={mismatch ? "is-mismatch" : undefined}><strong>{label}</strong><span>{expected}</span><span>{actual}</span></div>;
}

function attentionReasonLabel(reason: string | null) {
  return ({ AMOUNT_MISMATCH: "Сумма не совпадает", RECIPIENT_MISMATCH: "Карта не совпадает", OPERATION_TIME_MISMATCH: "Время операции не совпадает", RECEIPT_NOT_SUCCESSFUL: "Оплата неуспешна", BOOKING_NOT_PENDING: "Статус записи изменился", OCR_FAILED: "Чек не распознан", RECEIPT_MISMATCH: "Данные не совпадают" } as Record<string, string>)[reason ?? ""] ?? "Нужна проверка";
}

function cardSuffix(value: string | null) { return value ? `•••• ${value}` : "Не распознана"; }
function formatDateTime(value: Date, timeZone: string) { return new Intl.DateTimeFormat("ru-TJ", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(value); }
function formatRelativeAge(value: Date) { return new Intl.DateTimeFormat("ru-TJ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dushanbe" }).format(value); }
function reviewCountLabel(value: number) { const mod10 = value % 10; const mod100 = value % 100; return mod10 === 1 && mod100 !== 11 ? "чек" : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? "чека" : "чеков"; }
