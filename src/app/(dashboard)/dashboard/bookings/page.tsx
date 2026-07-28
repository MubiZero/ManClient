import { requireBusinessSession } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";

export default async function BookingsPage() {
  const membership = await requireBusinessSession();
  const bookings = await prisma.booking.findMany({
    where: {
      businessId: membership.businessId,
      ...(membership.role === "STAFF" && membership.staff ? { staffId: membership.staff.id } : {}),
    },
    include: { customer: true, service: true, staff: true, resources: { include: { resource: true } } },
    orderBy: { startsAt: "asc" },
    take: 100,
  });

  return <section className="dashboard-content"><div className="page-heading"><div><p className="context-label">Календарь</p><h1>Записи</h1></div></div>
    {bookings.length === 0 ? <div className="dashboard-empty"><h2>Начните с первой записи</h2><p>Новые записи появятся здесь после выбора времени клиентом.</p></div> : <div className="booking-list">{bookings.map((booking) => <article key={booking.id}><time>{formatDate(booking.startsAt)}</time><div><strong>{booking.customer.name}</strong><span>{booking.service.name} · {booking.staff.displayName}{booking.resources.length ? ` · ${booking.resources.map(({ resource }) => resource.name).join(", ")}` : ""}</span></div><span className={`status status-${booking.status.toLowerCase()}`}>{statusLabel(booking.status)}</span></article>)}</div>}
  </section>;
}

function formatDate(value: Date) { return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dushanbe", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value); }
function statusLabel(status: string) { return status === "CONFIRMED" ? "Подтверждена" : status === "PENDING_PAYMENT" ? "Ждёт оплаты" : status === "EXPIRED" ? "Истекла" : "Отменена"; }
