import Link from "next/link";

import { requireBusinessSession } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { localDateTimeToUtc, todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { TodayAgenda } from "@/features/dashboard/bookings/today-agenda";

type DashboardProps = { searchParams: Promise<{ notice?: string }> };

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const membership = await requireBusinessSession();
  const { notice } = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, timeZone: true } });
  const dayScopes = branches.map((branch) => { const date = todayInTimeZone(branch.timeZone); return { branchId: branch.id, startsAt: { gte: localDateTimeToUtc(date, "00:00", branch.timeZone), lt: localDateTimeToUtc(nextDate(date), "00:00", branch.timeZone) } }; });
  const bookingScope = { businessId: membership.businessId, ...(membership.role === "STAFF" ? { staffId: membership.staff?.id ?? "__none__" } : {}), ...(dayScopes.length ? { OR: dayScopes } : { id: "__none__" }) };
  const [todayCount, attentionCount, agenda] = await Promise.all([
    prisma.booking.count({ where: bookingScope }),
    membership.role === "STAFF" ? 0 : prisma.payment.count({ where: { businessId: membership.businessId, status: "NEEDS_ATTENTION" } }),
    prisma.booking.findMany({ where: { ...bookingScope, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } }, include: { customer: true, service: true, staff: true, branch: true }, orderBy: { startsAt: "asc" }, take: 6 }),
  ]);

  return <section className="dashboard-content">
    {notice === "settings" && <p className="notice" role="status">Настройки доступны владельцу и администратору</p>}
    <div className="page-heading"><div><p className="context-label">Рабочий день</p><h1>Обзор</h1><p>Сегодняшние записи и задачи, которые требуют внимания.</p></div><Link className="primary-link" href="/dashboard/bookings/new">Создать запись</Link></div>
    <div className="metric-row"><article><span>Записей сегодня</span><strong>{todayCount}</strong><Link href="/dashboard/bookings?view=day">Открыть день</Link></article><article><span>Чеков требуют внимания</span><strong>{attentionCount}</strong><Link href="/dashboard/bookings?view=list&status=PENDING_PAYMENT">К ожидающим оплаты</Link></article></div>
    <TodayAgenda items={agenda} />
  </section>;
}

function nextDate(value: string) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
