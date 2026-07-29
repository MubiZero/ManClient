import Link from "next/link";

import { BookingStatus } from "@/features/dashboard/bookings/booking-status";

type AgendaItem = { id: string; startsAt: Date; status: string; customer: { name: string }; service: { name: string }; staff: { displayName: string }; branch: { timeZone: string } };

export function TodayAgenda({ items }: { items: AgendaItem[] }) {
  return <section className="today-agenda"><div className="today-agenda-heading"><div><p className="context-label">Ближайшее сегодня</p><h2>Рабочий день</h2></div><Link href="/dashboard/bookings?view=day">Все записи</Link></div>
    {items.length ? <div>{items.map((item) => <Link href={`/dashboard/bookings/${item.id}`} key={item.id}><time>{new Intl.DateTimeFormat("ru-TJ", { timeZone: item.branch.timeZone, hour: "2-digit", minute: "2-digit" }).format(item.startsAt)}</time><span><strong>{item.customer.name}</strong><small>{item.service.name} · {item.staff.displayName}</small></span><BookingStatus status={item.status} /></Link>)}</div> : <div className="today-agenda-empty"><p>На сегодня активных записей нет.</p><Link className="ui-button ui-button-secondary" href="/dashboard/bookings/new">Создать запись</Link></div>}
  </section>;
}
