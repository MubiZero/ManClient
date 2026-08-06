import Link from "next/link";

import { requireBusinessSession } from "@/core/auth/business-session";
import { parseBookingFilters } from "@/core/booking-operations/booking-operation-schemas";
import { listBusinessBookings } from "@/core/booking-operations/booking-query-service";
import { getDaySchedule } from "@/core/booking-operations/day-schedule-service";
import { prisma } from "@/core/database/prisma";
import { todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { BookingFilters } from "@/features/dashboard/bookings/booking-filters";
import { BookingList } from "@/features/dashboard/bookings/booking-list";
import { DayGrid } from "@/features/dashboard/bookings/day-grid";
import { ButtonLink } from "@/features/ui-kit/button";
import { PageHeader } from "@/features/ui-kit/page-header";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BookingsPage({ searchParams }: PageProps) {
  const membership = await requireBusinessSession();
  const query = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, name: true, timeZone: true }, orderBy: { name: "asc" } });
  const baseTimeZone = branches.find((item) => item.id === query.branchId)?.timeZone ?? branches[0]?.timeZone ?? "Asia/Dushanbe";
  const filters = parseBookingFilters(compactQuery(query), baseTimeZone);
  const [result, staff, schedule] = await Promise.all([
    listBusinessBookings({ businessId: membership.businessId, actorUserId: membership.userId, filters }),
    prisma.staffMember.findMany({ where: { businessId: membership.businessId, archivedAt: null, ...(membership.role === "STAFF" ? { id: membership.staff?.id ?? "__none__" } : {}) }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    filters.view === "day"
      ? getDaySchedule({ businessId: membership.businessId, actorUserId: membership.userId, branchId: filters.branchId, staffId: filters.staffId, date: filters.date })
      : null,
  ]);
  const filtered = Boolean(filters.search || filters.status || filters.branchId || filters.staffId);

  return (
    <>
      <PageHeader
        eyebrow="Рабочий календарь"
        title="Записи"
        description={result.items.length ? `${result.items.length} записей в выборке` : "Управляйте визитами клиентов и загрузкой команды."}
        action={
          <div className="flex gap-2">
            <ButtonLink href="/api/dashboard/export/bookings" variant="secondary">
              Экспорт CSV
            </ButtonLink>
            <ButtonLink href="/dashboard/bookings/new">Создать запись</ButtonLink>
          </div>
        }
      />
      <BookingFilters
        date={filters.date}
        today={todayInTimeZone(result.timeZone)}
        view={filters.view}
        search={filters.search}
        status={filters.status}
        branchId={filters.branchId}
        staffId={filters.staffId}
        branches={branches}
        staff={staff}
      />
      {schedule ? (
        <section className="flex flex-col gap-2">
          {branches.length > 1 && !filters.branchId ? (
            <p className="text-sm text-muted-foreground">
              Календарь показывает филиал «{schedule.branchName}». Чтобы увидеть другой, выберите его в фильтре.
            </p>
          ) : null}
          <DayGrid schedule={schedule} now={new Date()} />
        </section>
      ) : null}
      {schedule ? <h2 className="text-sm font-semibold text-foreground">Записи за день</h2> : null}
      <BookingList items={result.items} filtered={filtered} />
      {result.nextCursor ? (
        <Link
          href={`/dashboard/bookings?${new URLSearchParams({ ...Object.fromEntries(Object.entries(compactQuery(query)).map(([key, value]) => [key, String(value)])), cursor: result.nextCursor }).toString()}`}
          className="w-fit rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Показать ещё
        </Link>
      ) : null}
    </>
  );
}

function compactQuery(query: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
}
