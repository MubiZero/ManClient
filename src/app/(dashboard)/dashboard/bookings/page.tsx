import Link from "next/link";

import { requireBusinessSession } from "@/core/auth/business-session";
import { rescheduleBusinessBooking } from "@/core/booking-operations/booking-command-service";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { parseBookingFilters } from "@/core/booking-operations/booking-operation-schemas";
import { listBusinessBookings } from "@/core/booking-operations/booking-query-service";
import { getDaySchedule, getWeekSchedule } from "@/core/booking-operations/day-schedule-service";
import { prisma } from "@/core/database/prisma";
import { todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { pluralRu } from "@/core/formatting/plural";
import { BookingFilters } from "@/features/dashboard/bookings/booking-filters";
import { BookingList } from "@/features/dashboard/bookings/booking-list";
import { DayGrid } from "@/features/dashboard/bookings/day-grid";
import { WeekGrid } from "@/features/dashboard/bookings/week-grid";
import { ButtonLink } from "@/features/ui-kit/button";
import { CursorPager, currentCursor, filterQuery, readPageTrail } from "@/features/ui-kit/cursor-pager";
import { PageHeader } from "@/features/ui-kit/page-header";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BookingsPage({ searchParams }: PageProps) {
  const membership = await requireBusinessSession();
  const query = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, name: true, timeZone: true }, orderBy: { name: "asc" } });
  const baseTimeZone = branches.find((item) => item.id === query.branchId)?.timeZone ?? branches[0]?.timeZone ?? "Asia/Dushanbe";
  const listQuery = filterQuery(query);
  const trail = readPageTrail(query.trail);
  const filters = parseBookingFilters({ ...listQuery, ...(currentCursor(trail) ? { cursor: currentCursor(trail) } : {}) }, baseTimeZone);
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
        description={result.items.length ? `${result.items.length} ${pluralRu(result.items.length, { one: "запись", few: "записи", many: "записей" })} в выборке` : "Управляйте визитами клиентов и загрузкой команды."}
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
      <CursorPager
        basePath="/dashboard/bookings"
        query={listQuery}
        trail={trail}
        nextCursor={result.nextCursor}
        label="Страницы записей"
      />
    </>
  );
}



