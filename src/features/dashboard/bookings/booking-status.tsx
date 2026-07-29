import { StatusBadge } from "@/features/ui/status-badge";

export function BookingStatus({ status }: { status: string }) {
  const value = ({ CONFIRMED: ["Подтверждена", "success"], PENDING_PAYMENT: ["Ждёт оплаты", "warning"], CANCELLED: ["Отменена", "neutral"], EXPIRED: ["Истекла", "neutral"] } as const)[status as "CONFIRMED"] ?? [status, "neutral"];
  return <StatusBadge tone={value[1]}>{value[0]}</StatusBadge>;
}

export function PaymentStatus({ status }: { status?: string }) {
  if (!status) return <StatusBadge tone="neutral">Без оплаты</StatusBadge>;
  const value = ({ PENDING: ["Не оплачено", "warning"], RECEIPT_ACCEPTED: ["Чек принят", "success"], NEEDS_ATTENTION: ["Проверить чек", "danger"] } as const)[status as "PENDING"] ?? [status, "neutral"];
  return <StatusBadge tone={value[1]}>{value[0]}</StatusBadge>;
}
