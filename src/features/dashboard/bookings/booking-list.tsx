import Link from "next/link";

import { formatSomoni } from "@/core/formatting/money";
import { BookingStatus, PaymentStatus } from "@/features/dashboard/bookings/booking-status";
import { EmptyState } from "@/features/ui/empty-state";
import { LinkButton } from "@/features/ui/button";

type BookingItem = {
  id: string; startsAt: Date; status: string;
  branch: { name: string; timeZone: string };
  customer: { name: string; phone: string };
  service: { name: string; amountDiram: number };
  staff: { displayName: string };
  payment: { status: string; amountDiram: number } | null;
};

export function BookingList({ items, filtered }: { items: BookingItem[]; filtered: boolean }) {
  if (!items.length) return <EmptyState title={filtered ? "Ничего не найдено" : "На выбранный день записей нет"} description={filtered ? "Измените условия поиска или сбросьте фильтры." : "Можно создать запись вручную или поделиться клиентской ссылкой."} action={<LinkButton href={filtered ? "/dashboard/bookings" : "/dashboard/bookings/new"}>{filtered ? "Сбросить фильтры" : "Создать запись"}</LinkButton>} />;
  return <div className="booking-operations-list">{items.map((booking) => <Link href={`/dashboard/bookings/${booking.id}`} key={booking.id} className="booking-operation-card">
    <time dateTime={booking.startsAt.toISOString()}><strong>{formatLocal(booking.startsAt, booking.branch.timeZone, "time")}</strong><span>{formatLocal(booking.startsAt, booking.branch.timeZone, "date")}</span></time>
    <div className="booking-operation-main"><strong>{booking.customer.name}</strong><span>{booking.customer.phone}</span><small>{booking.service.name} · {booking.staff.displayName} · {booking.branch.name}</small></div>
    <div className="booking-operation-payment"><strong>{formatSomoni(booking.payment?.amountDiram ?? booking.service.amountDiram)}</strong><PaymentStatus status={booking.payment?.status} /></div>
    <BookingStatus status={booking.status} />
  </Link>)}</div>;
}

function formatLocal(value: Date, timeZone: string, part: "date" | "time") { return new Intl.DateTimeFormat("ru-TJ", { timeZone, ...(part === "date" ? { day: "numeric", month: "long" } : { hour: "2-digit", minute: "2-digit" }) }).format(value); }
