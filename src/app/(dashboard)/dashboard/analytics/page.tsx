import { CalendarCheck, TrendingDown, Wallet } from "lucide-react";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { loadBusinessAnalytics } from "@/core/dashboard/business-analytics";
import { formatSomoni } from "@/core/formatting/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { MultiLineChart } from "@/features/ui-kit/chart";
import { PageHeader } from "@/features/ui-kit/page-header";
import { StatCard } from "@/features/ui-kit/stat-card";

export default async function AnalyticsPage() {
  const membership = await requireBusinessAdmin();
  const analytics = await loadBusinessAnalytics(membership.businessId);

  const chartData = analytics.bookingsTrend.map((point, index) => ({
    label: point.label,
    bookings: point.value,
    revenue: Math.round(analytics.revenueTrend[index]?.value ?? 0),
  }));

  return (
    <>
      <PageHeader eyebrow="Бизнес" title="Аналитика" description="Динамика записей и выручки за последние 30 дней." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Выручка за месяц" value={formatSomoni(analytics.revenueThisMonthDiram)} icon={Wallet} />
        <StatCard label="Записей за месяц" value={String(analytics.bookingsThisMonth)} icon={CalendarCheck} />
        <StatCard label="Выручка за 30 дней" value={formatSomoni(analytics.revenueLast30DaysDiram)} icon={Wallet} />
        <StatCard
          label="Отмены и неявки"
          value={`${analytics.cancellationRate.toFixed(1)}%`}
          icon={TrendingDown}
          trend={{ direction: analytics.cancelledOrExpiredThisMonth > 0 ? "down" : "flat", label: `${analytics.cancelledOrExpiredThisMonth} за месяц` }}
        />
      </div>

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
    </>
  );
}
