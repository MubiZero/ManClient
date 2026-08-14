"use client";

import Link from "next/link";
import { useState } from "react";

import { DEFAULT_TIME_ZONE } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import { pluralRu } from "@/core/formatting/plural";
import { formatTimeAgo } from "@/core/formatting/relative-time";
import { attentionReasonLabel } from "@/features/receipt-review/attention-reason";
import { ReceiptDecisionDialog } from "@/features/receipt-review/receipt-decision-dialog";
import { Badge } from "@/features/ui-kit/badge";
import { Checkbox } from "@/features/ui-kit/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

export type AttentionPayment = {
  id: string;
  amountDiram: number;
  attentionReason: string | null;
  updatedAt: Date;
  business: { id: string; name: string };
  booking: { customer: { name: string; phone: string }; service: { name: string } };
};

type ReviewAction = (formData: FormData) => void | Promise<void>;

/** How many salons a bulk decision names before the dialog stops listing and starts counting. */
const NAMED_IN_BULK = 4;

/**
 * Every receipt on the platform that a salon could not settle itself. One decision here confirms a
 * booking and takes money as received for a business that is not in the room, and the bulk buttons do
 * it to several customers of several salons at once — so the selection is React state rather than
 * loose checkboxes, and the confirmation can say exactly how large the decision is.
 */
export function AttentionPaymentsQueue({
  payments,
  now,
  approveAction,
  rejectAction,
  bulkApproveAction,
  bulkRejectAction,
}: {
  payments: AttentionPayment[];
  /**
   * The moment the ages are measured from, decided on the server. Reading the clock here instead would
   * have the server and the browser render different words either side of a minute boundary, and React
   * throws the whole subtree away to fix it.
   */
  now: Date;
  approveAction: ReviewAction;
  rejectAction: ReviewAction;
  bulkApproveAction: ReviewAction;
  bulkRejectAction: ReviewAction;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Derived from the current page, so a receipt decided a moment ago cannot ride along in the next
  // bulk decision just because its checkbox state outlived it.
  const selected = payments.filter((payment) => selectedIds.includes(payment.id));
  const selectedPaymentIds = selected.map((payment) => payment.id);
  const selectedTotalDiram = selected.reduce((total, payment) => total + payment.amountDiram, 0);
  const allSelected = selected.length === payments.length && payments.length > 0;
  const countLabel = `${selected.length} ${pluralRu(selected.length, { one: "чек", few: "чека", many: "чеков" })}`;
  const bulkSummary = [
    { label: "Чеков", value: String(selected.length) },
    { label: "Общая сумма", value: formatSomoni(selectedTotalDiram) },
    { label: "Бизнесов", value: String(new Set(selected.map((payment) => payment.business.id)).size) },
  ];
  const bulkDetails = [
    ...selected.slice(0, NAMED_IN_BULK).map((payment) => `${payment.business.name} — ${payment.booking.customer.name}, ${formatSomoni(payment.amountDiram)}`),
    ...(selected.length > NAMED_IN_BULK
      ? [`и ещё ${selected.length - NAMED_IN_BULK} ${pluralRu(selected.length - NAMED_IN_BULK, { one: "чек", few: "чека", many: "чеков" })}`]
      : []),
  ];

  function toggle(paymentId: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, paymentId] : current.filter((id) => id !== paymentId)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2">
        <span className="text-sm text-muted-foreground">
          {selected.length === 0 ? "Отметьте чеки для массового решения" : `Выбрано ${countLabel} на ${formatSomoni(selectedTotalDiram)}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ReceiptDecisionDialog
            action={bulkApproveAction}
            idField="paymentIds"
            idValues={selectedPaymentIds}
            disabled={selected.length === 0}
            triggerSize="sm"
            variant="primary"
            triggerLabel="Подтвердить отмеченные"
            title={`Подтвердить ${countLabel} на ${formatSomoni(selectedTotalDiram)}?`}
            description="Все отмеченные записи станут подтверждёнными, а переводы — принятыми. Отменить это решение нельзя."
            summary={bulkSummary}
            details={bulkDetails}
            confirmLabel={`Да, подтвердить ${countLabel}`}
            pendingLabel="Подтверждаем…"
          />
          <ReceiptDecisionDialog
            action={bulkRejectAction}
            idField="paymentIds"
            idValues={selectedPaymentIds}
            disabled={selected.length === 0}
            triggerSize="sm"
            variant="destructive"
            triggerLabel="Отклонить отмеченные"
            title={`Отклонить ${countLabel}?`}
            description="Каждый клиент получит уведомление об отказе и сможет прислать другой чек. Записи останутся неподтверждёнными."
            summary={bulkSummary}
            details={bulkDetails}
            note={{
              label: "Причина отказа",
              placeholder: "Например, сумма в чеке не совпадает",
              hint: "От 3 до 300 символов. Одна причина на все отмеченные чеки.",
              required: true,
            }}
            confirmLabel={`Да, отклонить ${countLabel}`}
            pendingLabel="Отклоняем…"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              {/*
                The box itself stays 16px so it sits right beside the text, but the label around it is a
                thumb's worth of target: these choose which receipts a bulk decision acts on, and a miss
                on "select all" is the most expensive miss on this screen.
              */}
              <label className="-m-3 flex cursor-pointer items-center justify-center p-3">
              <Checkbox
                aria-label="Выбрать все чеки на странице"
                checked={allSelected}
                ref={(node) => {
                  // Partly selected is its own state, and the browser only shows it if we say so.
                  if (node) node.indeterminate = selected.length > 0 && !allSelected;
                }}
                onChange={(event) => setSelectedIds(event.target.checked ? payments.map((payment) => payment.id) : [])}
              />
              </label>
            </TableHead>
            <TableHead>Бизнес</TableHead>
            <TableHead>Клиент</TableHead>
            <TableHead>Услуга</TableHead>
            <TableHead>Сумма</TableHead>
            <TableHead>Причина</TableHead>
            <TableHead>Ждёт</TableHead>
            <TableHead>Решение</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => {
            const decisionSummary = [
              { label: "Бизнес", value: payment.business.name },
              { label: "Клиент", value: payment.booking.customer.name },
              { label: "Услуга", value: payment.booking.service.name },
              { label: "Сумма", value: formatSomoni(payment.amountDiram) },
            ];
            return (
              <TableRow key={payment.id}>
                <TableCell>
                  <label className="-m-3 flex cursor-pointer items-center justify-center p-3">
                    <Checkbox
                      aria-label={`Выбрать чек: ${payment.business.name}, ${payment.booking.customer.name}`}
                      checked={selectedIds.includes(payment.id)}
                      onChange={(event) => toggle(payment.id, event.target.checked)}
                    />
                  </label>
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
                <TableCell>
                  <Badge variant="danger">{attentionReasonLabel(payment.attentionReason)}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <time dateTime={payment.updatedAt.toISOString()} title={formatDateTime(payment.updatedAt)}>
                    {formatTimeAgo(payment.updatedAt, now)}
                  </time>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ReceiptDecisionDialog
                      action={approveAction}
                      idField="paymentId"
                      idValues={[payment.id]}
                      triggerSize="sm"
                      variant="primary"
                      triggerLabel="Подтвердить"
                      title="Подтвердить оплату?"
                      description="Запись станет подтверждённой, а перевод — принятым. Отменить это решение нельзя."
                      summary={decisionSummary}
                      confirmLabel="Да, подтвердить"
                      pendingLabel="Подтверждаем…"
                    />
                    <ReceiptDecisionDialog
                      action={rejectAction}
                      idField="paymentId"
                      idValues={[payment.id]}
                      triggerSize="sm"
                      variant="destructive"
                      triggerLabel="Отклонить"
                      title="Отклонить чек?"
                      description="Клиент получит уведомление об отказе и сможет прислать другой чек. Запись останется неподтверждённой."
                      summary={decisionSummary}
                      note={{
                        label: "Причина отклонения",
                        placeholder: "Например, сумма в чеке не совпадает",
                        hint: "От 3 до 300 символов. Клиент увидит эту причину на странице оплаты, поэтому напишите, что именно исправить.",
                        required: true,
                      }}
                      confirmLabel="Да, отклонить"
                      pendingLabel="Отклоняем…"
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// The queue spans every branch on the platform, so it is shown in the operator's own time.
function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-TJ", { timeZone: DEFAULT_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(value);
}
