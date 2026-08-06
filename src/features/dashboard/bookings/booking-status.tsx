import { Badge } from "@/features/ui-kit/badge";

export function BookingStatus({ status }: { status: string }) {
  const value = ({ CONFIRMED: ["Подтверждена", "success"], PENDING_PAYMENT: ["Ждёт оплаты", "warning"], CANCELLED: ["Отменена", "neutral"], EXPIRED: ["Истекла", "neutral"], NO_SHOW: ["Неявка", "danger"] } as const)[status as "CONFIRMED"] ?? [status, "neutral"];
  return <Badge variant={value[1]}>{value[0]}</Badge>;
}

export function PaymentStatus({ status }: { status?: string }) {
  if (!status) return <Badge variant="neutral">Без оплаты</Badge>;
  const value = ({ PENDING: ["Не оплачено", "warning"], RECEIPT_ACCEPTED: ["Чек принят", "success"], NEEDS_ATTENTION: ["Проверить чек", "danger"], NOT_REQUIRED: ["Оплата на месте", "neutral"] } as const)[status as "PENDING"] ?? [status, "neutral"];
  return <Badge variant={value[1]}>{value[0]}</Badge>;
}
