const ATTENTION_REASON_LABELS: Record<string, string> = {
  AMOUNT_MISMATCH: "Сумма не совпадает",
  RECIPIENT_MISMATCH: "Карта не совпадает",
  OPERATION_TIME_MISMATCH: "Время операции не совпадает",
  RECEIPT_NOT_SUCCESSFUL: "Оплата неуспешна",
  BOOKING_NOT_PENDING: "Статус записи изменился",
  OCR_FAILED: "Чек не распознан",
  OCR_UNRELIABLE: "Чек не распознан",
  RECEIPT_MISMATCH: "Данные не совпадают",
};

/** Why a customer's receipt stopped at a human, in that human's words. */
export function attentionReasonLabel(reason: string | null): string {
  return ATTENTION_REASON_LABELS[reason ?? ""] ?? "Нужна проверка";
}
