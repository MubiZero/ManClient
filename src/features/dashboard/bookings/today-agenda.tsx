import { CalendarPlus } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/features/ui-kit/badge";
import { ButtonLink } from "@/features/ui-kit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { EmptyState } from "@/features/ui-kit/empty-state";

type AgendaItem = {
  id: string;
  startsAt: Date;
  status: string;
  customer: { name: string };
  service: { name: string };
  staff: { displayName: string };
  branch: { timeZone: string };
};

const statusVariant = { CONFIRMED: "success", PENDING_PAYMENT: "warning", CANCELLED: "neutral", EXPIRED: "neutral" } as const;
const statusLabel = { CONFIRMED: "Подтверждена", PENDING_PAYMENT: "Ждёт оплаты", CANCELLED: "Отменена", EXPIRED: "Истекла" } as const;

export function TodayAgenda({ items }: { items: AgendaItem[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Рабочий день · ближайшее сегодня</CardTitle>
        <Link href="/dashboard/bookings?view=day" className="text-sm font-medium text-primary hover:underline">
          Все записи
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="На сегодня активных записей нет"
            action={<ButtonLink href="/dashboard/bookings/new" variant="secondary" size="sm">Создать запись</ButtonLink>}
          />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/bookings/${item.id}`}
                className="flex items-center gap-4 py-3 text-sm transition-colors hover:bg-secondary/40"
              >
                <time className="w-14 shrink-0 font-medium text-foreground">
                  {new Intl.DateTimeFormat("ru-TJ", { timeZone: item.branch.timeZone, hour: "2-digit", minute: "2-digit" }).format(item.startsAt)}
                </time>
                <div className="flex flex-1 flex-col">
                  <strong className="text-foreground">{item.customer.name}</strong>
                  <span className="text-muted-foreground">
                    {item.service.name} · {item.staff.displayName}
                  </span>
                </div>
                <Badge variant={statusVariant[item.status as keyof typeof statusVariant] ?? "neutral"}>
                  {statusLabel[item.status as keyof typeof statusLabel] ?? item.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
