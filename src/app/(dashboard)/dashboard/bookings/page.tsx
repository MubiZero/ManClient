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
  const filters = parseBookingFilters(compactQuery(query), baseTimeZone);
  const calendarInput = { businessId: membership.businessId, actorUserId: membership.userId, branchId: filters.branchId, staffId: filters.staffId, date: filters.date };
  const [result, staff, day, week] = await Promise.all([
    listBusinessBookings({ businessId: membership.businessId, actorUserId: membership.userId, filters }),
    prisma.staffMember.findMany({ where: { businessId: membership.businessId, archivedAt: null, ...(membership.role === "STAFF" ? { id: membership.staff?.id ?? "__none__" } : {}) }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    filters.view === "day" ? getDaySchedule(calendarInput) : null,
    filters.view === "week" ? getWeekSchedule(calendarInput) : null,
  ]);
  const calendar = day ?? week;

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
        today={todayInTimeZone(result.timeZone)}
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
          {branches.length > 1 && !filters.branchId ? (
            <p className="text-sm text-muted-foreground">
              Календарь показывает филиал «{calendar.branchName}». Чтобы увидеть другой, выберите его в фильтре.
            </p>
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
