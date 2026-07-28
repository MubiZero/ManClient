import Link from "next/link";

import { requireBusinessSession } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";

type DashboardProps = { searchParams: Promise<{ notice?: string }> };

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const membership = await requireBusinessSession();
  const { notice } = await searchParams;
  const bookingWhere = {
    businessId: membership.businessId,
    ...(membership.role === "STAFF" && membership.staff ? { staffId: membership.staff.id } : {}),
  };
  const [todayCount, attentionCount] = await Promise.all([
    prisma.booking.count({ where: bookingWhere }),
    membership.role === "STAFF" ? 0 : prisma.payment.count({ where: { businessId: membership.businessId, status: "NEEDS_ATTENTION" } }),
  ]);

  return <section className="dashboard-content">
    {notice === "settings" && <p className="notice" role="status">Настройки доступны владельцу и администратору</p>}
    <div className="page-heading"><div><p className="context-label">Рабочий день</p><h1>Обзор</h1></div><Link className="primary-link" href="/dashboard/bookings">Открыть записи</Link></div>
    <div className="metric-row"><article><span>Записей в вашем календаре</span><strong>{todayCount}</strong></article><article><span>Чеков требуют внимания</span><strong>{attentionCount}</strong></article></div>
  </section>;
}
