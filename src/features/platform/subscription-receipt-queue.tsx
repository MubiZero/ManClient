import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { DEFAULT_TIME_ZONE } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import { pluralRu } from "@/core/formatting/plural";
import { formatTimeAgo } from "@/core/formatting/relative-time";
import { PERIOD_LABELS, PLAN_LABELS } from "@/core/platform/plan-labels";
import type { BillingPeriod, SubscriptionPlan } from "@/generated/prisma/client";
import { ReceiptComparison, type ComparisonRow } from "@/features/receipt-review/receipt-comparison";
import { ReceiptDecisionDialog } from "@/features/receipt-review/receipt-decision-dialog";
import { ReceiptLightbox } from "@/features/receipt-review/receipt-lightbox";
import { Badge } from "@/features/ui-kit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";

export type SubscriptionReviewReceipt = {
  id: string;
  createdAt: Date;
  attentionReason: string | null;
  parsedAmountDiram: number | null;
  parsedCardSuffix: string | null;
  parsedOperationAt: Date | null;
  business: { id: string; name: string };
  invoice: { reference: string; amountDiram: number; plan: SubscriptionPlan; period: BillingPeriod };
};

type ReviewAction = (formData: FormData) => void | Promise<void>;

/**
 * The platform's own revenue is reviewed with the same tool a salon gets for a customer's receipt: the
 * image next to the numbers it was read as. The card layout is on purpose — a table row cannot hold a
 * photo, and an operator who has to switch browser tabs to compare stops comparing.
 */
export function SubscriptionReceiptQueue({
  receipts,
  platformCardSuffix,
  approveAction,
  rejectAction,
}: {
  receipts: SubscriptionReviewReceipt[];
  /** Absent while no platform card is configured — then no transfer can be matched automatically. */
  platformCardSuffix: string | null;
  approveAction: ReviewAction;
  rejectAction: ReviewAction;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {receipts.length} {receiptCountLabel(receipts.length)} в очереди · сначала давние
      </p>
      {receipts.map((receipt) => (
        <SubscriptionReceiptCard
          key={receipt.id}
          receipt={receipt}
          platformCardSuffix={platformCardSuffix}
          approveAction={approveAction}
          rejectAction={rejectAction}
        />
      ))}
    </div>
  );
}

function SubscriptionReceiptCard({
  receipt,
  platformCardSuffix,
  approveAction,
  rejectAction,
}: {
  receipt: SubscriptionReviewReceipt;
  platformCardSuffix: string | null;
  approveAction: ReviewAction;
  rejectAction: ReviewAction;
}) {
  const receiptSrc = `/api/platform/subscriptions/${receipt.id}/receipt`;
  const planLine = `${PLAN_LABELS[receipt.invoice.plan]} · ${PERIOD_LABELS[receipt.invoice.period].toLowerCase()}`;
  const decisionSummary = [
    { label: "Бизнес", value: receipt.business.name },
    { label: "Счёт", value: `${receipt.invoice.reference} · ${planLine}` },
    { label: "Сумма по счёту", value: formatSomoni(receipt.invoice.amountDiram) },
  ];

  const rows: ComparisonRow[] = [
    {
      label: "Сумма",
      expected: formatSomoni(receipt.invoice.amountDiram),
      actual: receipt.parsedAmountDiram === null ? "Не распознана" : formatSomoni(receipt.parsedAmountDiram),
      mismatch: receipt.parsedAmountDiram !== receipt.invoice.amountDiram,
    },
    {
      label: "Карта",
      expected: platformCardSuffix ? `•••• ${platformCardSuffix}` : "Карта платформы не настроена",
      actual: receipt.parsedCardSuffix ? `•••• ${receipt.parsedCardSuffix}` : "Не распознана",
      mismatch: !platformCardSuffix || receipt.parsedCardSuffix !== platformCardSuffix,
    },
    {
      label: "Время перевода",
      expected: "После выставления счёта",
      actual: receipt.parsedOperationAt ? formatDateTime(receipt.parsedOperationAt) : "Не распознано",
      mismatch: receipt.attentionReason === "OPERATION_TIME_MISMATCH",
    },
  ];
  if (receipt.attentionReason === "RECEIPT_NOT_SUCCESSFUL") {
    rows.push({ label: "Статус перевода", expected: "Успешно", actual: "В чеке нет отметки об успехе", mismatch: true });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Счёт <span className="font-mono normal-case">{receipt.invoice.reference}</span> · {planLine}
          </p>
          <CardTitle className="text-lg">
            <Link href={`/platform/businesses/${receipt.business.id}`} className="hover:underline">
              {receipt.business.name}
            </Link>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Чек прислан <time dateTime={receipt.createdAt.toISOString()}>{formatTimeAgo(receipt.createdAt)}</time> · {formatDateTime(receipt.createdAt)}
          </p>
        </div>
        <Badge variant="danger">{reasonLabel(receipt.attentionReason)}</Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Сверка перевода</h3>
            <ReceiptComparison rows={rows} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ReceiptDecisionDialog
              action={approveAction}
              idField="receiptId"
              idValues={[receipt.id]}
              variant="primary"
              triggerLabel="Подтвердить оплату"
              title="Подтвердить оплату и продлить подписку?"
              description="Счёт станет оплаченным, а период подписки продлится сразу. Отменить это решение нельзя."
              summary={decisionSummary}
              confirmLabel="Да, продлить подписку"
              pendingLabel="Подтверждаем…"
            />
            <ReceiptDecisionDialog
              action={rejectAction}
              idField="receiptId"
              idValues={[receipt.id]}
              variant="destructive"
              triggerLabel="Отклонить чек"
              title="Отклонить чек?"
              description="Счёт останется неоплаченным — бизнес сможет прислать другой чек по тому же счёту."
              summary={decisionSummary}
              note={{
                label: "Причина отказа",
                placeholder: "Например, перевод пришёл не на карту платформы",
                hint: "От 3 до 300 символов. Останется в журнале и поможет объяснить бизнесу отказ.",
                required: true,
              }}
              confirmLabel="Да, отклонить"
              pendingLabel="Отклоняем…"
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Изображение чека</h3>
          <ReceiptLightbox src={receiptSrc} alt={`Чек об оплате подписки, ${receipt.business.name}`} />
          <a href={receiptSrc} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <ExternalLink className="size-3.5" /> Открыть в новой вкладке
          </a>
        </div>
      </CardContent>
    </Card>
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

// The platform operator works from Dushanbe, and a subscription transfer belongs to no branch.
function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-TJ", { timeZone: DEFAULT_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(value);
}

function receiptCountLabel(value: number) {
  return pluralRu(value, { one: "чек", few: "чека", many: "чеков" });
}
