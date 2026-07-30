import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireBusinessSession } from "@/core/auth/business-session";
import { cancelBusinessBooking, confirmBusinessBooking, rescheduleBusinessBooking } from "@/core/booking-operations/booking-command-service";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { getBusinessBooking } from "@/core/booking-operations/booking-query-service";
import { formatSomoni } from "@/core/formatting/money";
import { BookingActionsPanel } from "@/features/dashboard/bookings/booking-actions-panel";
import { BookingStatus, PaymentStatus } from "@/features/dashboard/bookings/booking-status";

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
  async function reschedule(formData: FormData) { "use server"; const current = await requireBusinessSession(); try { const startsAt = new Date(String(formData.get("startsAt") ?? "")); if (Number.isNaN(startsAt.getTime())) throw new BookingOperationError("INVALID_INPUT"); await rescheduleBusinessBooking({ businessId: current.businessId, actorUserId: current.userId, bookingId, startsAt }); } catch (error) { redirect(`/dashboard/bookings/${bookingId}?error=${errorCode(error)}`); } redirect(`/dashboard/bookings/${bookingId}?notice=rescheduled`); }

  const active = booking.status === "PENDING_PAYMENT" || booking.status === "CONFIRMED";
  return <section className="dashboard-content booking-detail-page">
    <Link className="ui-button ui-button-quiet booking-back" href="/dashboard/bookings">← Все записи</Link>
    {noticeMessage(query.notice) ? <p className="entity-notice" role="status">{noticeMessage(query.notice)}</p> : null}{errorMessage(query.error) ? <p className="entity-error" role="alert">{errorMessage(query.error)}</p> : null}
    <div className="booking-detail-heading"><div><p className="context-label">Карточка записи</p><h1>{booking.customer.name}</h1><p>{booking.service.name} · {formatLocal(booking.startsAt, booking.branch.timeZone)}</p></div><div><BookingStatus status={booking.status} /><PaymentStatus status={booking.payment?.status} /></div></div>
    <div className="booking-detail-grid">
      <article><h2>Визит</h2><dl><dt>Дата и время</dt><dd>{formatLocal(booking.startsAt, booking.branch.timeZone)}</dd><dt>Филиал</dt><dd>{booking.branch.name}</dd><dt>Специалист</dt><dd>{booking.staff.displayName}</dd><dt>Ресурсы</dt><dd>{booking.resources.length ? booking.resources.map(({ resource }) => resource.name).join(", ") : "Не требуются"}</dd><dt>Источник</dt><dd>{sourceLabel(booking.source)}</dd></dl></article>
      <article><h2>Клиент и оплата</h2><dl><dt>Телефон</dt><dd><a href={`tel:${booking.customer.phone}`}>{booking.customer.phone}</a></dd><dt>Стоимость</dt><dd>{formatSomoni(booking.payment?.amountDiram ?? booking.service.amountDiram)}</dd><dt>Статус оплаты</dt><dd><PaymentStatus status={booking.payment?.status} /></dd>{booking.cancellationReason ? <><dt>Причина отмены</dt><dd>{booking.cancellationReason}</dd></> : null}</dl></article>
    </div>
    {active ? <BookingActionsPanel canConfirm={booking.status === "PENDING_PAYMENT"} branchId={booking.branchId} serviceId={booking.serviceId} staffId={booking.staffId} timeZone={booking.branch.timeZone} bookingLabel={`${booking.customer.name} · ${formatLocal(booking.startsAt, booking.branch.timeZone)}`} confirmAction={confirm} rescheduleAction={reschedule} cancelAction={cancel} /> : null}
    <section className="booking-history"><h2>История</h2>{booking.auditEvents.length ? <ol>{booking.auditEvents.map((event) => <li key={event.id}><span>{auditLabel(event.type)}</span><time>{formatLocal(event.createdAt, booking.branch.timeZone)}</time></li>)}</ol> : <p>Событий пока нет.</p>}</section>
  </section>;
}

function formatLocal(value: Date, timeZone: string) { return new Intl.DateTimeFormat("ru-TJ", { timeZone, dateStyle: "long", timeStyle: "short" }).format(value); }
function sourceLabel(source: string) { return ({ WEB: "Сайт", TELEGRAM: "Telegram", DASHBOARD: "Создана в кабинете" } as Record<string, string>)[source] ?? "Другой канал"; }
function auditLabel(type: string) { return ({ "booking.created": "Запись создана", "booking.confirmed": "Чек принят, запись подтверждена", "booking.confirmed_manually": "Запись подтверждена вручную", "booking.rescheduled": "Время записи изменено", "booking.cancelled": "Запись отменена" } as Record<string, string>)[type] ?? "Запись обновлена"; }
function errorCode(error: unknown) { return error instanceof BookingOperationError ? error.code : "INVALID_INPUT"; }
function noticeMessage(code?: string) { return ({ created: "Запись создана", confirmed: "Запись подтверждена вручную", rescheduled: "Запись перенесена", cancelled: "Запись отменена" } as Record<string, string>)[code ?? ""]; }
function errorMessage(code?: string) { return ({ INVALID_INPUT: "Проверьте введённые данные.", SLOT_UNAVAILABLE: "Новое время уже занято или находится вне рабочего графика.", INVALID_STATUS: "Это действие больше недоступно для текущего статуса.", NOT_FOUND: "Запись не найдена или у вас нет к ней доступа." } as Record<string, string>)[code ?? ""]; }
