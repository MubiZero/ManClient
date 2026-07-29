import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireBusinessSession } from "@/core/auth/business-session";
import { cancelBusinessBooking, confirmBusinessBooking, rescheduleBusinessBooking } from "@/core/booking-operations/booking-command-service";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { getBusinessBooking } from "@/core/booking-operations/booking-query-service";
import { localDateTimeToUtc } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import { BookingStatus, PaymentStatus } from "@/features/dashboard/bookings/booking-status";
import { SubmitButton } from "@/features/ui/submit-button";

type PageProps = { params: Promise<{ bookingId: string }>; searchParams: Promise<{ notice?: string; error?: string }> };

export default async function BookingDetailsPage({ params, searchParams }: PageProps) {
  const membership = await requireBusinessSession();
  const { bookingId } = await params;
  const query = await searchParams;
  let booking;
  try { booking = await getBusinessBooking({ businessId: membership.businessId, actorUserId: membership.userId, bookingId }); }
  catch (error) { if (error instanceof BookingOperationError && error.code === "NOT_FOUND") notFound(); throw error; }

  async function confirm() { "use server"; const current = await requireBusinessSession(); try { await confirmBusinessBooking({ businessId: current.businessId, actorUserId: current.userId, bookingId }); } catch (error) { redirect(`/dashboard/bookings/${bookingId}?error=${errorCode(error)}`); } redirect(`/dashboard/bookings/${bookingId}?notice=confirmed`); }
  async function cancel(formData: FormData) { "use server"; const current = await requireBusinessSession(); try { await cancelBusinessBooking({ businessId: current.businessId, actorUserId: current.userId, bookingId, reason: String(formData.get("reason") ?? "") }); } catch (error) { redirect(`/dashboard/bookings/${bookingId}?error=${errorCode(error)}`); } redirect(`/dashboard/bookings/${bookingId}?notice=cancelled`); }
  async function reschedule(formData: FormData) { "use server"; const current = await requireBusinessSession(); try { const actual = await getBusinessBooking({ businessId: current.businessId, actorUserId: current.userId, bookingId }); const local = String(formData.get("startsAtLocal") ?? ""); const [date, time] = local.split("T"); await rescheduleBusinessBooking({ businessId: current.businessId, actorUserId: current.userId, bookingId, startsAt: localDateTimeToUtc(date, time, actual.branch.timeZone) }); } catch (error) { redirect(`/dashboard/bookings/${bookingId}?error=${errorCode(error)}`); } redirect(`/dashboard/bookings/${bookingId}?notice=rescheduled`); }

  const active = booking.status === "PENDING_PAYMENT" || booking.status === "CONFIRMED";
  return <section className="dashboard-content booking-detail-page">
    <Link className="ui-button ui-button-quiet booking-back" href="/dashboard/bookings">← Все записи</Link>
    {noticeMessage(query.notice) ? <p className="entity-notice" role="status">{noticeMessage(query.notice)}</p> : null}{errorMessage(query.error) ? <p className="entity-error" role="alert">{errorMessage(query.error)}</p> : null}
    <div className="booking-detail-heading"><div><p className="context-label">Карточка записи</p><h1>{booking.customer.name}</h1><p>{booking.service.name} · {formatLocal(booking.startsAt, booking.branch.timeZone)}</p></div><div><BookingStatus status={booking.status} /><PaymentStatus status={booking.payment?.status} /></div></div>
    <div className="booking-detail-grid">
      <article><h2>Визит</h2><dl><dt>Дата и время</dt><dd>{formatLocal(booking.startsAt, booking.branch.timeZone)}</dd><dt>Филиал</dt><dd>{booking.branch.name}</dd><dt>Специалист</dt><dd>{booking.staff.displayName}</dd><dt>Ресурсы</dt><dd>{booking.resources.length ? booking.resources.map(({ resource }) => resource.name).join(", ") : "Не требуются"}</dd><dt>Источник</dt><dd>{sourceLabel(booking.source)}</dd></dl></article>
      <article><h2>Клиент и оплата</h2><dl><dt>Телефон</dt><dd><a href={`tel:${booking.customer.phone}`}>{booking.customer.phone}</a></dd><dt>Стоимость</dt><dd>{formatSomoni(booking.payment?.amountDiram ?? booking.service.amountDiram)}</dd><dt>Статус оплаты</dt><dd><PaymentStatus status={booking.payment?.status} /></dd>{booking.cancellationReason ? <><dt>Причина отмены</dt><dd>{booking.cancellationReason}</dd></> : null}</dl></article>
    </div>
    {active ? <section className="booking-actions-panel"><div><h2>Действия</h2><p>Изменения сохраняются в истории записи.</p></div>{booking.status === "PENDING_PAYMENT" ? <form action={confirm}><p>Подтверждение вручную не означает, что банк проверил оплату.</p><SubmitButton idle="Подтвердить вручную" pending="Подтверждаем" /></form> : null}<form action={reschedule}><label className="ui-field"><span className="ui-field-label">Новое время</span><input className="ui-input" type="datetime-local" name="startsAtLocal" required /></label><SubmitButton variant="secondary" idle="Перенести запись" pending="Переносим" /></form><form action={cancel}><label className="ui-field"><span className="ui-field-label">Причина отмены</span><input className="ui-input" name="reason" minLength={3} maxLength={300} required placeholder="Например, клиент попросил отменить" /></label><SubmitButton variant="danger" idle="Отменить запись" pending="Отменяем" /></form></section> : null}
    <section className="booking-history"><h2>История</h2>{booking.auditEvents.length ? <ol>{booking.auditEvents.map((event) => <li key={event.id}><span>{auditLabel(event.type)}</span><time>{formatLocal(event.createdAt, booking.branch.timeZone)}</time></li>)}</ol> : <p>Событий пока нет.</p>}</section>
  </section>;
}

function formatLocal(value: Date, timeZone: string) { return new Intl.DateTimeFormat("ru-TJ", { timeZone, dateStyle: "long", timeStyle: "short" }).format(value); }
function sourceLabel(source: string) { return ({ WEB: "Сайт", TELEGRAM: "Telegram", DASHBOARD: "Создана в кабинете" } as Record<string, string>)[source] ?? "Другой канал"; }
function auditLabel(type: string) { return ({ "booking.created": "Запись создана", "booking.confirmed": "Чек принят, запись подтверждена", "booking.confirmed_manually": "Запись подтверждена вручную", "booking.rescheduled": "Время записи изменено", "booking.cancelled": "Запись отменена" } as Record<string, string>)[type] ?? "Запись обновлена"; }
function errorCode(error: unknown) { return error instanceof BookingOperationError ? error.code : "INVALID_INPUT"; }
function noticeMessage(code?: string) { return ({ created: "Запись создана", confirmed: "Запись подтверждена вручную", rescheduled: "Запись перенесена", cancelled: "Запись отменена" } as Record<string, string>)[code ?? ""]; }
function errorMessage(code?: string) { return ({ INVALID_INPUT: "Проверьте введённые данные.", SLOT_UNAVAILABLE: "Новое время уже занято или находится вне рабочего графика.", INVALID_STATUS: "Это действие больше недоступно для текущего статуса.", NOT_FOUND: "Запись не найдена или у вас нет к ней доступа." } as Record<string, string>)[code ?? ""]; }
