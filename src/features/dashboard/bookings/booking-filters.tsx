import { Search } from "lucide-react";
import Link from "next/link";

import { BookingDatePicker } from "@/features/dashboard/bookings/booking-date-picker";
import { cn } from "@/features/ui-kit/cn";
import { Input, Select } from "@/features/ui-kit/field";

type Option = { id: string; name: string };

export function BookingFilters({
  date,
  today,
  view,
  search,
  status,
  branchId,
  staffId,
  branches,
  staff,
}: {
  date: string;
  today: string;
  view: string;
  search: string;
  status?: string;
  branchId?: string;
  staffId?: string;
  branches: Option[];
  staff: Array<{ id: string; displayName: string }>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 rounded-md bg-secondary p-1 w-fit">
        <Link
          href={`/dashboard/bookings?view=day&date=${date}`}
          className={cn("rounded-sm px-3 py-1.5 text-sm font-medium", view === "day" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          День
        </Link>
        <Link
          href="/dashboard/bookings?view=list"
          className={cn("rounded-sm px-3 py-1.5 text-sm font-medium", view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          Список
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <input type="hidden" name="view" value={view} />
        {view === "day" ? (
          <input type="hidden" name="date" value={date} />
        ) : null}
        <div className="relative">
          <label htmlFor="booking-search" className="sr-only">
            Поиск
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="booking-search" name="search" defaultValue={search} placeholder="Имя, телефон или услуга" className="w-56 pl-9" />
        </div>
        <label htmlFor="booking-status" className="sr-only">
          Статус
        </label>
        <Select id="booking-status" name="status" defaultValue={status ?? ""} className="w-auto">
          <option value="">Все статусы</option>
          <option value="CONFIRMED">Подтверждённые</option>
          <option value="PENDING_PAYMENT">Ждут оплаты</option>
          <option value="CANCELLED">Отменённые</option>
          <option value="EXPIRED">Истёкшие</option>
          <option value="NO_SHOW">Неявки</option>
        </Select>
        <label htmlFor="booking-branch" className="sr-only">
          Филиал
        </label>
        <Select id="booking-branch" name="branchId" defaultValue={branchId ?? ""} className="w-auto">
          <option value="">Все филиалы</option>
          {branches.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <label htmlFor="booking-staff" className="sr-only">
          Специалист
        </label>
        <Select id="booking-staff" name="staffId" defaultValue={staffId ?? ""} className="w-auto">
          <option value="">Все специалисты</option>
          {staff.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName}
            </option>
          ))}
        </Select>
        <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
          Показать
        </button>
        <Link href="/dashboard/bookings" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Сбросить
        </Link>
      </form>

      {view === "day" ? (
        <div className="flex items-center gap-2">
          <BookingDatePicker date={date} hrefPattern="/dashboard/bookings?view=day&date={date}" />
          <Link href={`/dashboard/bookings?view=day&date=${addDays(date, -1)}`} className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
            ← Пред. день
          </Link>
          <Link href={`/dashboard/bookings?view=day&date=${today}`} className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
            Сегодня
          </Link>
          <Link href={`/dashboard/bookings?view=day&date=${addDays(date, 1)}`} className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
            След. день →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
