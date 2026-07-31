import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireBusinessSession } from "@/core/auth/business-session";
import { cancelBusinessBooking, confirmBusinessBooking, rescheduleBusinessBooking } from "@/core/booking-operations/booking-command-service";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { getBusinessBooking } from "@/core/booking-operations/booking-query-service";
import { formatSomoni } from "@/core/formatting/money";
import { BookingActionsPanel } from "@/features/dashboard/bookings/booking-actions-panel";
import { BookingStatus, PaymentStatus } from "@/features/dashboard/bookings/booking-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { PageHeader } from "@/features/ui-kit/page-header";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { params: Promise<{ bookingId: string }>; searchParams: Promise<{ notice?: string; error?: string }> };

export default async function BookingDetailsPage({ params, searchParams }: PageProps) {
  const membership = await requireBusinessSession();
  const { bookingId } = await params;
  const query = await searchParams;
  let booking;
  try {
    booking = await getBusinessBooking({ businessId: membership.businessId, actorUserId: membership.userId, bookingId });
  } catch (error) {
    if (error instanceof BookingOperationError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  async function confirm() {
    "use server";
    const current = await requireBusinessSession();
    try {
      await confirmBusinessBooking({ businessId: current.businessId, actorUserId: current.userId, bookingId });
    } catch (error) {
      redirect(`/dashboard/bookings/${bookingId}?error=${errorCode(error)}`);
    }
    redirect(`/dashboard/bookings/${bookingId}?notice=confirmed`);
  }
  async function cancel(formData: FormData) {
    "use server";
    const current = await requireBusinessSession();
    try {
      await cancelBusinessBooking({ businessId: current.businessId, actorUserId: current.userId, bookingId, reason: String(formData.get("reason") ?? "") });
    } catch (error) {
      redirect(`/dashboard/bookings/${bookingId}?error=${errorCode(error)}`);
    }
    redirect(`/dashboard/bookings/${bookingId}?notice=cancelled`);
  }
  async function reschedule(formData: FormData) {
    "use server";
    const current = await requireBusinessSession();
    try {
      const startsAt = new Date(String(formData.get("startsAt") ?? ""));
      if (Number.isNaN(startsAt.getTime())) throw new BookingOperationError("INVALID_INPUT");
      await rescheduleBusinessBooking({ businessId: current.businessId, actorUserId: current.userId, bookingId, startsAt });
    } catch (error) {
      redirect(`/dashboard/bookings/${bookingId}?error=${errorCode(error)}`);
    }
    redirect(`/dashboard/bookings/${bookingId}?notice=rescheduled`);
  }

  const active = booking.status === "PENDING_PAYMENT" || booking.status === "CONFIRMED";

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice)} error={errorMessage(query.error)} />
      <Link href="/dashboard/bookings" className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Все записи
      </Link>
      <PageHeader
        eyebrow="Карточка записи"
        title={booking.customer.name}
        description={`${booking.service.name} · ${formatLocal(booking.startsAt, booking.branch.timeZone)}`}
        action={
          <div className="flex items-center gap-2">
            <BookingStatus status={booking.status} />
            <PaymentStatus status={booking.payment?.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Визит</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Дата и время</dt>
              <dd className="text-foreground">{formatLocal(booking.startsAt, booking.branch.timeZone)}</dd>
              <dt className="text-muted-foreground">Филиал</dt>
              <dd className="text-foreground">{booking.branch.name}</dd>
              <dt className="text-muted-foreground">Специалист</dt>
              <dd className="text-foreground">{booking.staff.displayName}</dd>
              <dt className="text-muted-foreground">Ресурсы</dt>
              <dd className="text-foreground">{booking.resources.length ? booking.resources.map(({ resource }) => resource.name).join(", ") : "Не требуются"}</dd>
              <dt className="text-muted-foreground">Источник</dt>
              <dd className="text-foreground">{sourceLabel(booking.source)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Клиент и оплата</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Телефон</dt>
              <dd>
                <a href={`tel:${booking.customer.phone}`} className="text-primary hover:underline">
                  {booking.customer.phone}
                </a>
              </dd>
              <dt className="text-muted-foreground">Стоимость</dt>
              <dd className="text-foreground">{formatSomoni(booking.payment?.amountDiram ?? booking.service.amountDiram)}</dd>
              <dt className="text-muted-foreground">Статус оплаты</dt>
              <dd>
                <PaymentStatus status={booking.payment?.status} />
              </dd>
              {booking.cancellationReason ? (
                <>
                  <dt className="text-muted-foreground">Причина отмены</dt>
                  <dd className="text-foreground">{booking.cancellationReason}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      {active ? (
        <BookingActionsPanel
          canConfirm={booking.status === "PENDING_PAYMENT"}
          branchId={booking.branchId}
          serviceId={booking.serviceId}
          staffId={booking.staffId}
          timeZone={booking.branch.timeZone}
          bookingLabel={`${booking.customer.name} · ${formatLocal(booking.startsAt, booking.branch.timeZone)}`}
          confirmAction={confirm}
          rescheduleAction={reschedule}
          cancelAction={cancel}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>История</CardTitle>
        </CardHeader>
        <CardContent>
          {booking.auditEvents.length ? (
            <ol className="flex flex-col divide-y divide-border">
              {booking.auditEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-foreground">{auditLabel(event.type)}</span>
                  <time className="text-muted-foreground">{formatLocal(event.createdAt, booking.branch.timeZone)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Событий пока нет.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function formatLocal(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-TJ", { timeZone, dateStyle: "long", timeStyle: "short" }).format(value);
}
function sourceLabel(source: string) {
  return ({ WEB: "Сайт", TELEGRAM: "Telegram", DASHBOARD: "Создана в кабинете" } as Record<string, string>)[source] ?? "Другой канал";
}
function auditLabel(type: string) {
  return (
    ({
      "booking.created": "Запись создана",
      "booking.confirmed": "Чек принят, запись подтверждена",
      "booking.confirmed_manually": "Запись подтверждена вручную",
      "booking.rescheduled": "Время записи изменено",
      "booking.cancelled": "Запись отменена",
    } as Record<string, string>)[type] ?? "Запись обновлена"
  );
}
function errorCode(error: unknown) {
  return error instanceof BookingOperationError ? error.code : "INVALID_INPUT";
}
function noticeMessage(code?: string) {
  return ({ created: "Запись создана", confirmed: "Запись подтверждена вручную", rescheduled: "Запись перенесена", cancelled: "Запись отменена" } as Record<string, string>)[code ?? ""];
}
function errorMessage(code?: string) {
  return (
    ({
      INVALID_INPUT: "Проверьте введённые данные.",
      SLOT_UNAVAILABLE: "Новое время уже занято или находится вне рабочего графика.",
      INVALID_STATUS: "Это действие больше недоступно для текущего статуса.",
      NOT_FOUND: "Запись не найдена или у вас нет к ней доступа.",
    } as Record<string, string>)[code ?? ""]
  );
}
