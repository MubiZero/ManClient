import { CalendarX } from "lucide-react";
import Link from "next/link";

import { formatSomoni } from "@/core/formatting/money";
import { BookingStatus, PaymentStatus } from "@/features/dashboard/bookings/booking-status";
import { ButtonLink } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

type BookingItem = {
  id: string;
  startsAt: Date;
  status: string;
  branch: { name: string; timeZone: string };
  customer: { name: string; phone: string };
  service: { name: string; amountDiram: number };
  staff: { displayName: string };
  payment: { status: string; amountDiram: number } | null;
  resources?: Array<{ resource: { name: string } }>;
};

export function BookingList({ items, filtered }: { items: BookingItem[]; filtered: boolean }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={CalendarX}
        title={filtered ? "Ничего не найдено" : "На выбранный день записей нет"}
        description={filtered ? "Измените условия поиска или сбросьте фильтры." : "Можно создать запись вручную или поделиться клиентской ссылкой."}
        action={<ButtonLink href={filtered ? "/dashboard/bookings" : "/dashboard/bookings/new"} variant="secondary" size="sm">{filtered ? "Сбросить фильтры" : "Создать запись"}</ButtonLink>}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Время</TableHead>
          <TableHead>Клиент</TableHead>
          <TableHead>Услуга</TableHead>
          <TableHead>Оплата</TableHead>
          <TableHead>Статус</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((booking) => (
          <TableRow key={booking.id} className="cursor-pointer">
            <TableCell className="p-0">
              <Link href={`/dashboard/bookings/${booking.id}`} className="flex flex-col px-4 py-3">
                <strong className="text-foreground">{formatLocal(booking.startsAt, booking.branch.timeZone, "time")}</strong>
                <span className="text-xs text-muted-foreground">{formatLocal(booking.startsAt, booking.branch.timeZone, "date")}</span>
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/dashboard/bookings/${booking.id}`} className="flex flex-col">
                <strong className="text-foreground">{booking.customer.name}</strong>
                <span className="text-xs text-muted-foreground">{booking.customer.phone}</span>
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {booking.service.name} · {booking.staff.displayName} · {booking.branch.name}
              {booking.resources?.length ? ` · ${booking.resources.map((item) => item.resource.name).join(", ")}` : ""}
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <strong className="text-foreground">{formatSomoni(booking.payment?.amountDiram ?? booking.service.amountDiram)}</strong>
                <PaymentStatus status={booking.payment?.status} />
              </div>
            </TableCell>
            <TableCell>
              <BookingStatus status={booking.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatLocal(value: Date, timeZone: string, part: "date" | "time") {
  return new Intl.DateTimeFormat("ru-TJ", { timeZone, ...(part === "date" ? { day: "numeric", month: "long" } : { hour: "2-digit", minute: "2-digit" }) }).format(value);
}
