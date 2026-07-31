import { ExternalLink, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { formatSomoni } from "@/core/formatting/money";
import { ReceiptLightbox } from "@/features/dashboard/payments/receipt-lightbox";
import { Badge } from "@/features/ui-kit/badge";
import { Button } from "@/features/ui-kit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { cn } from "@/features/ui-kit/cn";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Field, Input } from "@/features/ui-kit/field";

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
                  <time dateTime={payment.updatedAt.toISOString()} className="text-xs text-muted-foreground">
                    {formatRelativeAge(payment.updatedAt)}
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
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Сверка оплаты</h3>
          <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
            <span className="text-xs font-medium uppercase text-muted-foreground">Поле</span>
            <span className="text-xs font-medium uppercase text-muted-foreground">Ожидалось</span>
            <span className="text-xs font-medium uppercase text-muted-foreground">В чеке</span>
            <ComparisonRow label="Сумма" expected={formatSomoni(payment.amountDiram)} actual={payment.receiptAmountDiram === null ? "Не распознана" : formatSomoni(payment.receiptAmountDiram)} mismatch={payment.receiptAmountDiram !== payment.amountDiram} />
            <ComparisonRow label="Карта" expected={cardSuffix(payment.booking.branch.recipientCardLast4)} actual={cardSuffix(payment.recipientCardSuffix)} mismatch={payment.recipientCardSuffix !== payment.booking.branch.recipientCardLast4} />
            <ComparisonRow label="Время операции" expected="До окончания брони" actual={payment.operationAt ? formatDateTime(payment.operationAt, timeZone) : "Не распознано"} mismatch={payment.attentionReason === "OPERATION_TIME_MISMATCH"} />
          </div>
        </div>

        {receiptSrc ? (
          <div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Изображение чека</h3>
            <p className="mb-2 text-sm text-muted-foreground">Нажмите на изображение, чтобы увеличить и визуально сверить данные.</p>
            <ReceiptLightbox src={receiptSrc} />
            <a href={receiptSrc} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <ExternalLink className="size-3.5" /> Открыть в новой вкладке
            </a>
          </div>
        ) : (
          <p className="text-sm text-destructive" role="alert">
            Изображение чека недоступно. Не подтверждайте оплату без сверки.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <form action={approveAction} className="flex flex-col gap-2">
            <input type="hidden" name="paymentId" value={payment.id} />
            <Field label="Комментарий к подтверждению">
              <Input name="reason" maxLength={300} placeholder="Например, сумма подтверждена по чеку" />
            </Field>
            <Button type="submit">Подтвердить оплату</Button>
          </form>
          <form action={rejectAction} className="flex flex-col gap-2">
            <input type="hidden" name="paymentId" value={payment.id} />
            <Field label="Причина отклонения">
              <Input name="reason" minLength={3} maxLength={300} required placeholder="Например, сумма в чеке не совпадает" />
            </Field>
            <Button type="submit" variant="destructive">
              Отклонить чек
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonRow({ label, expected, actual, mismatch }: { label: string; expected: string; actual: string; mismatch: boolean }) {
  return (
    <>
      <strong className={cn("text-foreground", mismatch && "text-destructive")}>{label}</strong>
      <span className={cn(mismatch && "text-destructive")}>{expected}</span>
      <span className={cn(mismatch && "font-medium text-destructive")}>{actual}</span>
    </>
  );
}

function attentionReasonLabel(reason: string | null) {
  return ({ AMOUNT_MISMATCH: "Сумма не совпадает", RECIPIENT_MISMATCH: "Карта не совпадает", OPERATION_TIME_MISMATCH: "Время операции не совпадает", RECEIPT_NOT_SUCCESSFUL: "Оплата неуспешна", BOOKING_NOT_PENDING: "Статус записи изменился", OCR_FAILED: "Чек не распознан", OCR_UNRELIABLE: "Чек не распознан", RECEIPT_MISMATCH: "Данные не совпадают" } as Record<string, string>)[reason ?? ""] ?? "Нужна проверка";
}

function cardSuffix(value: string | null) {
  return value ? `•••• ${value}` : "Не распознана";
}
function formatDateTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-TJ", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(value);
}
function formatRelativeAge(value: Date) {
  return new Intl.DateTimeFormat("ru-TJ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dushanbe" }).format(value);
}
function reviewCountLabel(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  return mod10 === 1 && mod100 !== 11 ? "чек" : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? "чека" : "чеков";
}
