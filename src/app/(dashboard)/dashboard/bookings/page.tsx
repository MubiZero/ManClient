import Link from "next/link";

import { requireBusinessSession } from "@/core/auth/business-session";
import { parseBookingFilters } from "@/core/booking-operations/booking-operation-schemas";
import { listBusinessBookings } from "@/core/booking-operations/booking-query-service";
import { prisma } from "@/core/database/prisma";
import { todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { BookingFilters } from "@/features/dashboard/bookings/booking-filters";
import { BookingList } from "@/features/dashboard/bookings/booking-list";
import { LinkButton } from "@/features/ui/button";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BookingsPage({ searchParams }: PageProps) {
  const membership = await requireBusinessSession();
  const query = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, name: true, timeZone: true }, orderBy: { name: "asc" } });
  const baseTimeZone = branches.find((item) => item.id === query.branchId)?.timeZone ?? branches[0]?.timeZone ?? "Asia/Dushanbe";
  const filters = parseBookingFilters(compactQuery(query), baseTimeZone);
  const [result, staff] = await Promise.all([
    listBusinessBookings({ businessId: membership.businessId, actorUserId: membership.userId, filters }),
    prisma.staffMember.findMany({ where: { businessId: membership.businessId, archivedAt: null, ...(membership.role === "STAFF" ? { id: membership.staff?.id ?? "__none__" } : {}) }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
  ]);
  const filtered = Boolean(filters.search || filters.status || filters.branchId || filters.staffId);

  return <section className="dashboard-content entity-page">
    <div className="page-heading"><div><p className="context-label">Рабочий календарь</p><h1>Записи</h1><p>{result.items.length ? `${result.items.length} записей в выборке` : "Управляйте визитами клиентов и загрузкой команды."}</p></div><LinkButton href="/dashboard/bookings/new">Создать запись</LinkButton></div>
    {filters.view === "day" ? <nav className="booking-day-nav" aria-label="Навигация по дням"><Link href={dayHref(addDays(filters.date, -1))}>Предыдущий день</Link><Link href={dayHref(todayInTimeZone(result.timeZone))}>Сегодня</Link><Link href={dayHref(addDays(filters.date, 1))}>Следующий день</Link></nav> : null}
    <BookingFilters date={filters.date} view={filters.view} search={filters.search} status={filters.status} branchId={filters.branchId} staffId={filters.staffId} branches={branches} staff={staff} />
    <BookingList items={result.items} filtered={filtered} />
    {result.nextCursor ? <Link className="ui-button ui-button-secondary booking-load-more" href={`/dashboard/bookings?${new URLSearchParams({ ...Object.fromEntries(Object.entries(compactQuery(query)).map(([key, value]) => [key, String(value)])), cursor: result.nextCursor }).toString()}`}>Показать ещё</Link> : null}
  </section>;
}

function compactQuery(query: Record<string, string | string[] | undefined>) { return Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")); }
function addDays(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function dayHref(date: string) { return `/dashboard/bookings?view=day&date=${date}`; }
