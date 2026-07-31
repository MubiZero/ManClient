import { CalendarCheck, CalendarPlus, TriangleAlert, Wallet } from "lucide-react";

import { requireBusinessSession } from "@/core/auth/business-session";
import { loadOverviewAnalytics, loadRecentActivity } from "@/core/dashboard/overview-analytics";
import { prisma } from "@/core/database/prisma";
import { localDateTimeToUtc, todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import { TodayAgenda } from "@/features/dashboard/bookings/today-agenda";
import { ButtonLink } from "@/features/ui-kit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { MultiLineChart } from "@/features/ui-kit/chart";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { StatCard } from "@/features/ui-kit/stat-card";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type DashboardProps = { searchParams: Promise<{ notice?: string }> };

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const { notice } = await searchParams;
  const membership = await requireBusinessSession();
  const isStaff = membership.role === "STAFF";
  const branches = await prisma.branch.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, timeZone: true } });
  const dayScopes = branches.map((branch) => { const date = todayInTimeZone(branch.timeZone); return { branchId: branch.id, startsAt: { gte: localDateTimeToUtc(date, "00:00", branch.timeZone), lt: localDateTimeToUtc(nextDate(date), "00:00", branch.timeZone) } }; });
  const bookingScope = { businessId: membership.businessId, ...(isStaff ? { staffId: membership.staff?.id ?? "__none__" } : {}), ...(dayScopes.length ? { OR: dayScopes } : { id: "__none__" }) };

  const [todayCount, attentionCount, agenda, analytics, activity] = await Promise.all([
    prisma.booking.count({ where: bookingScope }),
    isStaff ? Promise.resolve(0) : prisma.payment.count({ where: { businessId: membership.businessId, status: "NEEDS_ATTENTION" } }),
    prisma.booking.findMany({ where: { ...bookingScope, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } }, include: { customer: true, service: true, staff: true, branch: true }, orderBy: { startsAt: "asc" }, take: 6 }),
    loadOverviewAnalytics(membership.businessId, isStaff ? membership.staff?.id : undefined),
    loadRecentActivity(membership.businessId),
  ]);

  const chartData = analytics.bookingsTrend.map((point, index) => ({
    label: point.label,
    bookings: point.value,
    revenue: Math.round(analytics.revenueTrend[index]?.value ?? 0),
  }));

  return (
    <>
      <ToastEmitter notice={notice === "settings" ? "Настройки доступны владельцу и администратору" : undefined} />
      <PageHeader
        eyebrow="Рабочий день"
        title="Обзор"
        description="Сегодняшние записи и задачи, которые требуют внимания."
        action={<ButtonLink href="/dashboard/bookings/new">Создать запись</ButtonLink>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Записей сегодня" value={String(todayCount)} icon={CalendarPlus} />
        {isStaff ? null : (
          <>
            <StatCard label="Выручка за 7 дней" value={formatSomoni(analytics.revenueLast7DaysDiram)} icon={Wallet} />
            <StatCard label="Записей за 30 дней" value={String(analytics.bookingsTrend.reduce((sum, point) => sum + point.value, 0))} icon={CalendarCheck} />
            <StatCard
              label="Чеков требуют внимания"
              value={String(attentionCount)}
              icon={TriangleAlert}
              trend={attentionCount > 0 ? { direction: "down", label: "нужна проверка" } : undefined}
            />
          </>
        )}
      </div>

      {isStaff ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Записи и выручка за 30 дней</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              data={chartData}
              lines={[
                { key: "bookings", color: "var(--color-primary)", name: "Записи" },
                { key: "revenue", color: "var(--color-info-500)", name: "Выручка, с." },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <TodayAgenda items={agenda} />

      <Card>
        <CardHeader>
          <CardTitle>Недавняя активность</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <EmptyState title="Пока нет событий" description="Здесь появятся отмены, переносы и отклонённые чеки." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {activity.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-foreground">{item.label}</span>
                  <span className="text-muted-foreground">{item.createdAt.toLocaleString("ru-RU")}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function nextDate(value: string) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
