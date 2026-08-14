import Link from "next/link";

import { requireBusinessSession } from "@/core/auth/business-session";
import { rescheduleBusinessBooking } from "@/core/booking-operations/booking-command-service";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { parseBookingFilters } from "@/core/booking-operations/booking-operation-schemas";
import { listBusinessBookings } from "@/core/booking-operations/booking-query-service";
import { getDaySchedule, getWeekSchedule } from "@/core/booking-operations/day-schedule-service";
import { prisma } from "@/core/database/prisma";
import { todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { BookingFilters } from "@/features/dashboard/bookings/booking-filters";
import { BookingList } from "@/features/dashboard/bookings/booking-list";
import { DayGrid } from "@/features/dashboard/bookings/day-grid";
import { WeekGrid } from "@/features/dashboard/bookings/week-grid";
import { ButtonLink } from "@/features/ui-kit/button";
import { PageHeader } from "@/features/ui-kit/page-header";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BookingsPage({ searchParams }: PageProps) {
  const membership = await requireBusinessSession();
  const query = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, name: true, timeZone: true }, orderBy: { name: "asc" } });
  const baseTimeZone = branches.find((item) => item.id === query.branchId)?.timeZone ?? branches[0]?.timeZone ?? "Asia/Dushanbe";
  const listQuery = compactQuery(query);
  const trail = readPageTrail(query.trail);
  const filters = parseBookingFilters({ ...listQuery, ...(trail.length ? { cursor: trail[trail.length - 1] } : {}) }, baseTimeZone);
  const calendarInput = { businessId: membership.businessId, actorUserId: membership.userId, branchId: filters.branchId, staffId: filters.staffId, date: filters.date };
  const [day, week] = await Promise.all([
    filters.view === "day" ? getDaySchedule(calendarInput) : null,
    filters.view === "week" ? getWeekSchedule(calendarInput) : null,
  ]);
  const calendar = day ?? week;
  // The list sits under the calendar and describes the same period, so it describes the same branch too —
  // including the one the calendar chose when the URL named none. Two sections disagreeing about which
  // floor they are talking about is worse than either of them being narrow.
  const [result, staff] = await Promise.all([
    listBusinessBookings({
      businessId: membership.businessId,
      actorUserId: membership.userId,
      filters: calendar ? { ...filters, branchId: calendar.branchId } : filters,
    }),
    prisma.staffMember.findMany({ where: { businessId: membership.businessId, archivedAt: null, ...(membership.role === "STAFF" ? { id: membership.staff?.id ?? "__none__" } : {}) }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
  ]);

  /**
   * Dragging a visit in the grid. Returns the failure instead of throwing so the calendar can say why a
   * move was refused — "the specialist is already busy then" is the whole point of the gesture — and only
   * reloads on success, which keeps the block where the receptionist dropped it while the answer arrives.
   */
  async function moveBooking(input: { bookingId: string; startsAt: string; staffId?: string }) {
    "use server";
    const current = await requireBusinessSession();
    try {
      const startsAt = new Date(input.startsAt);
      if (Number.isNaN(startsAt.getTime())) throw new BookingOperationError("INVALID_INPUT");
      await rescheduleBusinessBooking({
        businessId: current.businessId,
        actorUserId: current.userId,
        bookingId: input.bookingId,
        startsAt,
        staffId: input.staffId,
      });
      return {};
    } catch (error) {
      return { error: error instanceof BookingOperationError ? error.code : "UNKNOWN" };
    }
  }
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
        today={todayInTimeZone(calendar?.timeZone ?? result.timeZone)}
        view={filters.view}
        search={filters.search}
        status={filters.status}
        branchId={filters.branchId}
        staffId={filters.staffId}
        branches={branches}
        staff={staff}
      />
      {calendar ? (
        <section className="flex flex-col gap-2">
          {branches.length > 1 ? (
            // A calendar draws one branch. Saying which one in a sentence left the reader to work out that
            // the filter was where they change it; tabs say it and change it in the same place.
            <nav className="flex flex-wrap items-center gap-1 rounded-md bg-secondary p-1 w-fit" aria-label="Филиал календаря">
              {branches.map((branch) => (
                <Link
                  key={branch.id}
                  href={`/dashboard/bookings?${new URLSearchParams({ view: filters.view, date: filters.date, branchId: branch.id, ...(filters.staffId ? { staffId: filters.staffId } : {}) }).toString()}`}
                  aria-current={branch.id === calendar.branchId ? "page" : undefined}
                  className={branch.id === calendar.branchId
                    ? "rounded-sm bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
                    : "rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"}
                >
                  {branch.name}
                </Link>
              ))}
            </nav>
          ) : null}
          {week && !week.staffId ? (
            <p className="text-sm text-muted-foreground">
              В неделе показаны все специалисты. Выберите одного в фильтре, чтобы записывать клиентов прямо из сетки.
            </p>
          ) : null}
          {day ? <DayGrid schedule={day} now={new Date()} moveAction={moveBooking} /> : null}
          {week ? <WeekGrid schedule={week} today={todayInTimeZone(week.timeZone)} moveAction={moveBooking} /> : null}
        </section>
      ) : null}
      {calendar ? <h2 className="text-sm font-semibold text-foreground">{day ? "Записи за день" : "Записи за неделю"}</h2> : null}
      <BookingList items={result.items} filtered={filtered} />
      {trail.length || result.nextCursor ? (
        <nav aria-label="Страницы записей" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Страница {trail.length + 1}</span>
          <div className="flex gap-2">
            {trail.length ? (
              <ButtonLink href={pageHref(listQuery, trail.slice(0, -1))} variant="secondary" size="sm">
                Назад
              </ButtonLink>
            ) : null}
            {result.nextCursor ? (
              <ButtonLink href={pageHref(listQuery, [...trail, result.nextCursor])} variant="secondary" size="sm">
                Далее
              </ButtonLink>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}

/** Paging keys are how the list walks, not what it selects, so the filter schema never sees them. */
const PAGING_KEYS = new Set(["cursor", "trail"]);

function compactQuery(query: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "" && !PAGING_KEYS.has(entry[0])));
}

/**
 * The cursor query can only walk forward, which is why the button used to replace the list while calling
 * itself "Показать ещё". Keeping the cursors already used turns that one-way walk into pages: the last one
 * is the page on screen, dropping it goes back. Bounded so a hand-written URL cannot grow without end.
 */
function readPageTrail(value: string | string[] | undefined) {
  if (typeof value !== "string") return [];
  return value.split(",").filter((cursor) => cursor.length > 0 && cursor.length <= 128).slice(-50);
}

function pageHref(listQuery: Record<string, string>, trail: string[]) {
  const params = new URLSearchParams(listQuery);
  if (trail.length) params.set("trail", trail.join(","));
  return `/dashboard/bookings?${params.toString()}`;
}
