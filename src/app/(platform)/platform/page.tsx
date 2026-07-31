import { Building2, CalendarCheck, TriangleAlert, Wallet } from "lucide-react";

import { formatSomoni } from "@/core/formatting/money";
import { loadPlatformOverview } from "@/core/platform/platform-analytics";
import { MultiLineChart } from "@/features/ui-kit/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { PageHeader } from "@/features/ui-kit/page-header";
import { StatCard } from "@/features/ui-kit/stat-card";

export default async function PlatformOverviewPage() {
  const overview = await loadPlatformOverview();

  const chartData = overview.bookingsTrend.map((point, index) => ({
    label: point.label,
    bookings: point.value,
    revenue: Math.round(overview.revenueTrend[index]?.value ?? 0),
  }));

  return (
    <>
      <PageHeader eyebrow="Платформа" title="Обзор" description="Сводка по всем бизнесам ManClient." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Всего бизнесов" value={String(overview.totalBusinesses)} icon={Building2} trend={{ direction: "flat", label: `${overview.suspendedBusinesses} приостановлено` }} />
        <StatCard label="Записей за 30 дней" value={overview.bookingsLast30Days.toLocaleString("ru-RU")} icon={CalendarCheck} />
        <StatCard label="Выручка за 30 дней" value={formatSomoni(overview.revenueLast30DaysDiram)} icon={Wallet} />
        <StatCard
          label="Чеки требуют внимания"
          value={String(overview.attentionPayments)}
          icon={TriangleAlert}
          trend={overview.attentionPayments > 0 ? { direction: "down", label: "по всем бизнесам" } : undefined}
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
