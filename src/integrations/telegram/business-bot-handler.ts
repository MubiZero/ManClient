import type { BusinessRole, Prisma } from "@/generated/prisma/client";

import {
  consumeBusinessBotAction,
  createBusinessBotAction,
  type BusinessBotActionActor,
  type BusinessBotActionKind,
} from "@/core/integrations/business-bot-actions";
import {
  cancelBusinessBooking,
  confirmBusinessBooking,
  getBusinessBookingAvailableStarts,
  remindBusinessBookingPayment,
  rescheduleBusinessBooking,
} from "@/core/booking-operations/booking-command-service";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import {
  getBusinessBotBooking,
  getBusinessBotPaymentReview,
  getBusinessBotSummary,
  listBusinessBotBookings,
  listBusinessBotPaymentReviews,
  type BusinessBotBookingFilter,
} from "@/core/integrations/business-bot-query-service";
import { formatTajikPhoneInput } from "@/core/formatting/tajik-phone";
import { todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import {
  approvePaymentReview,
  getPaymentReceiptForReview,
  PaymentReviewError,
  rejectPaymentReview,
} from "@/core/payments/payment-review-service";
import {
  bookingCardView,
  bookingListView,
  mainMenuView,
  paymentReviewView,
  type BusinessBotAction,
  type BusinessBotView,
} from "@/integrations/telegram/business-bot-renderer";
import type { TelegramMessageRef, TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

export type BusinessBotPlatformActor = BusinessBotActionActor & {
  role: BusinessRole;
  business: { id: string; name: string; slug?: string };
  destination: { chatId: string; chatType: string };
};

export type BusinessBotUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number };
    chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
    text?: string;
  };
  callback_query?: {
    id?: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number; type: "private" | "group" | "supergroup" | "channel" } };
    data?: string;
  };
};

export type BusinessBotHandlerDependencies = {
  now: () => Date;
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) => Promise<void>;
  answerCallbackQuery: (callbackQueryId: string, text?: string) => Promise<void>;
  editMessageText: (message: TelegramMessageRef, text: string, replyMarkup?: TelegramReplyMarkup) => Promise<TelegramMessageRef>;
  sendPhoto?: (chatId: string, photo: Uint8Array, caption?: string, replyMarkup?: TelegramReplyMarkup) => Promise<TelegramMessageRef>;
  loadPaymentReceipt?: typeof getPaymentReceiptForReview;
};

const actionLifetimeMs = 15 * 60_000;

export async function handleBusinessBotUpdate(
  actor: BusinessBotPlatformActor,
  update: BusinessBotUpdate,
  dependencies: BusinessBotHandlerDependencies,
) {
  const callback = update.callback_query;
  if (callback) {
    if (callback.id) await dependencies.answerCallbackQuery(callback.id);
    if (!callback.data) return;
    await handleCallback(actor, callback, dependencies);
    return;
  }

  const text = update.message?.text?.trim();
  if (!text) return;
  switch (text) {
    case "/start":
    case "/menu":
    case "Главное меню":
      await showMainMenu(actor, dependencies);
      return;
    case "Сегодня":
      await showBookingList(actor, { kind: "today" }, null, dependencies);
      return;
    case "Записи":
      await showBookingFilters(actor, dependencies);
      return;
    case "Проверить чеки":
      await showChecks(actor, dependencies);
      return;
    case "Ссылка для клиентов":
      await showCustomerLink(actor, dependencies);
      return;
    case "/help":
    case "Ещё":
    case "Помощь":
      await showHelp(actor, dependencies);
      return;
    default:
      await showHelp(actor, dependencies);
  }
}

async function handleCallback(
  actor: BusinessBotPlatformActor,
  callback: NonNullable<BusinessBotUpdate["callback_query"]>,
  dependencies: BusinessBotHandlerDependencies,
) {
  let action: Awaited<ReturnType<typeof consumeBusinessBotAction>>;
  try {
    action = await consumeBusinessBotAction(actor, callback.data!, dependencies.now());
  } catch {
    await showStaleAction(actor, callback.message, dependencies);
    return;
  }

  switch (action.kind) {
    case "menu.open":
      await showMainMenu(actor, dependencies);
      return;
    case "bookings.list": {
      const filter = bookingFilter(action.payload);
      if (!filter) {
        await showStaleAction(actor, callback.message, dependencies);
        return;
      }
      await showBookingList(actor, filter, stringValue(action.payload.cursor), dependencies, callback.message);
      return;
    }
    case "booking.open": {
      const bookingId = stringValue(action.payload.bookingId);
      if (!bookingId) {
        await showStaleAction(actor, callback.message, dependencies);
        return;
      }
      await showBookingCard(actor, bookingId, dependencies, callback.message);
      return;
    }
    case "payments.list":
      await showPaymentReviewList(actor, stringValue(action.payload.cursor), dependencies, callback.message);
      return;
    case "payment.open":
    case "PAYMENT_REFRESH": {
      const paymentId = stringValue(action.payload.paymentId);
      if (!paymentId) return showStaleAction(actor, callback.message, dependencies);
      await showPaymentReviewCard(actor, paymentId, dependencies, callback.message);
      return;
    }
    case "PAYMENT_RECEIPT": {
      const paymentId = stringValue(action.payload.paymentId);
      const submissionId = stringValue(action.payload.submissionId);
      if (!paymentId || !submissionId) return showStaleAction(actor, callback.message, dependencies);
      await showPaymentReceipt(actor, paymentId, submissionId, dependencies, callback.message);
      return;
    }
    case "PAYMENT_APPROVE_BEGIN": {
      const paymentId = stringValue(action.payload.paymentId);
      const submissionId = stringValue(action.payload.submissionId);
      if (!paymentId || !submissionId) return showStaleAction(actor, callback.message, dependencies);
      await showPaymentApprovalConfirmation(actor, paymentId, submissionId, dependencies, callback.message);
      return;
    }
    case "PAYMENT_APPROVE_CONFIRM": {
      const paymentId = stringValue(action.payload.paymentId);
      const submissionId = stringValue(action.payload.submissionId);
      if (!paymentId || !submissionId) return showStaleAction(actor, callback.message, dependencies);
      try {
        const result = await approvePaymentReview({ businessId: actor.businessId, actorUserId: actor.userId, paymentId, submissionId }, dependencies.now());
        await showPaymentReviewCard(
          actor,
          paymentId,
          dependencies,
          callback.message,
          result.changed ? "Оплата подтверждена. Запись подтверждена." : "Оплата уже подтверждена. Показано текущее состояние.",
        );
      } catch (error) {
        await showPaymentReviewError(actor, paymentId, error, callback.message, dependencies);
      }
      return;
    }
    case "PAYMENT_REJECT_BEGIN": {
      const paymentId = stringValue(action.payload.paymentId);
      const submissionId = stringValue(action.payload.submissionId);
      if (!paymentId || !submissionId) return showStaleAction(actor, callback.message, dependencies);
      await showPaymentRejectionReasons(actor, paymentId, submissionId, dependencies, callback.message);
      return;
    }
    case "PAYMENT_REJECT_REASON": {
      const paymentId = stringValue(action.payload.paymentId);
      const submissionId = stringValue(action.payload.submissionId);
      const reason = stringValue(action.payload.reason);
      if (!paymentId || !submissionId || !reason) return showStaleAction(actor, callback.message, dependencies);
      try {
        const result = await rejectPaymentReview({ businessId: actor.businessId, actorUserId: actor.userId, paymentId, submissionId, reason }, dependencies.now());
        await showPaymentReviewCard(
          actor,
          paymentId,
          dependencies,
          callback.message,
          result.changed ? "Чек отклонён. Причина сохранена." : "Чек уже отклонён. Показано текущее состояние.",
        );
      } catch (error) {
        await showPaymentReviewError(actor, paymentId, error, callback.message, dependencies);
      }
      return;
    }
    case "BOOKING_REFRESH": {
      const bookingId = stringValue(action.payload.bookingId);
      if (!bookingId) return showStaleAction(actor, callback.message, dependencies);
      await showBookingCard(actor, bookingId, dependencies, callback.message);
      return;
    }
    case "BOOKING_CONFIRM": {
      const bookingId = stringValue(action.payload.bookingId);
      if (!bookingId) return showStaleAction(actor, callback.message, dependencies);
      try {
        await confirmBusinessBooking({ businessId: actor.businessId, actorUserId: actor.userId, bookingId }, dependencies.now());
        await showBookingCard(actor, bookingId, dependencies, callback.message, "Запись подтверждена вручную. Банковская проверка оплаты не выполнялась.");
      } catch (error) {
        await showBookingOperationError(actor, bookingId, error, callback.message, dependencies);
      }
      return;
    }
    case "BOOKING_REMIND_PAYMENT": {
      const bookingId = stringValue(action.payload.bookingId);
      if (!bookingId) return showStaleAction(actor, callback.message, dependencies);
      try {
        const result = await remindBusinessBookingPayment({ businessId: actor.businessId, actorUserId: actor.userId, bookingId }, dependencies.now());
        await showBookingCard(
          actor,
          bookingId,
          dependencies,
          callback.message,
          result.scheduled ? "Напоминание об оплате запланировано." : "Напоминание об оплате уже запланировано.",
        );
      } catch (error) {
        await showBookingOperationError(actor, bookingId, error, callback.message, dependencies);
      }
      return;
    }
    case "BOOKING_RESCHEDULE_DATE": {
      const bookingId = stringValue(action.payload.bookingId);
      if (!bookingId) return showStaleAction(actor, callback.message, dependencies);
      await showRescheduleDates(actor, bookingId, callback.message, dependencies);
      return;
    }
    case "BOOKING_RESCHEDULE_SLOT": {
      const bookingId = stringValue(action.payload.bookingId);
      const startsAt = stringValue(action.payload.startsAt);
      const date = stringValue(action.payload.date);
      if (!bookingId || (!startsAt && !date)) return showStaleAction(actor, callback.message, dependencies);
      if (startsAt) {
        const value = new Date(startsAt);
        if (Number.isNaN(value.getTime())) return showStaleAction(actor, callback.message, dependencies);
        try {
          await rescheduleBusinessBooking({ businessId: actor.businessId, actorUserId: actor.userId, bookingId, startsAt: value }, dependencies.now());
          await showBookingCard(actor, bookingId, dependencies, callback.message, "Запись перенесена.");
        } catch (error) {
          await showBookingOperationError(actor, bookingId, error, callback.message, dependencies);
        }
        return;
      }
      await showRescheduleSlots(actor, bookingId, date!, callback.message, dependencies);
      return;
    }
    case "BOOKING_CANCEL_BEGIN": {
      const bookingId = stringValue(action.payload.bookingId);
      if (!bookingId) return showStaleAction(actor, callback.message, dependencies);
      await showCancellationConfirmation(actor, bookingId, callback.message, dependencies);
      return;
    }
    case "BOOKING_CANCEL_REASON": {
      const bookingId = stringValue(action.payload.bookingId);
      const reason = stringValue(action.payload.reason);
      if (!bookingId || !reason) return showStaleAction(actor, callback.message, dependencies);
      try {
        await cancelBusinessBooking({ businessId: actor.businessId, actorUserId: actor.userId, bookingId, reason }, dependencies.now());
        await showBookingCard(actor, bookingId, dependencies, callback.message, "Запись отменена. Причина сохранена.");
      } catch (error) {
        await showBookingOperationError(actor, bookingId, error, callback.message, dependencies);
      }
      return;
    }
    default:
      await showStaleAction(actor, callback.message, dependencies);
  }
}

async function showMainMenu(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  const summary = await getBusinessBotSummary(actor, dependencies.now());
  const base = mainMenuView({ role: actor.role });
  const keyboard = base.replyMarkup && "keyboard" in base.replyMarkup
    ? base.replyMarkup.keyboard
      .map(row => row.filter(button => button.text !== "Настройки"))
      .filter(row => row.length > 0)
    : [];
  const customerBot = summary.customerBotStatus === "ACTIVE"
    ? `подключён${summary.customerBotUsername ? ` (@${summary.customerBotUsername})` : ""}`
    : "не подключён";
  const text = [
    `ManClient · ${actor.business.name}`,
    `Сегодня: ${summary.todayCount}`,
    `Ожидают оплату: ${summary.pendingPaymentCount}`,
    ...(actor.role === "STAFF" ? [] : [`Чеки на проверке: ${summary.needsAttentionCount}`]),
    `Клиентский бот: ${customerBot}`,
  ].join("\n");
  await dependencies.sendMessage(actor.destination.chatId, text, {
    keyboard: [
      ...keyboard,
      ...(actor.role !== "STAFF" && actor.destination.chatType === "private" && summary.customerBotStatus !== "ACTIVE"
        ? [[{ text: "Создать клиентского бота" }]]
        : []),
      [{ text: "Ссылка для клиентов" }, { text: "Ещё" }],
    ],
    resize_keyboard: true,
  });
}

async function showBookingFilters(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  const [today, upcoming, pending, menu] = await Promise.all([
    navigationAction(actor, "bookings.list", { filter: "today" }, "Сегодня", dependencies.now()),
    navigationAction(actor, "bookings.list", { filter: "upcoming" }, "Ближайшие", dependencies.now()),
    navigationAction(actor, "bookings.list", { filter: "pending" }, "Ожидают оплату", dependencies.now()),
    navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now()),
  ]);
  await dependencies.sendMessage(actor.destination.chatId, "Какие записи показать?", inlineView([[today, upcoming], [pending], [menu]]));
}

async function showBookingList(
  actor: BusinessBotPlatformActor,
  filter: BusinessBotBookingFilter,
  cursor: string | null,
  dependencies: BusinessBotHandlerDependencies,
  message?: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
) {
  const result = await listBusinessBotBookings(actor, filter, cursor, dependencies.now());
  const actions = await Promise.all(result.items.map((booking) => navigationAction(
    actor,
    "booking.open",
    { bookingId: booking.id },
    "Открыть",
    dependencies.now(),
  )));
  const view = bookingListView({
    title: titleForFilter(filter.kind),
    items: result.items.map((booking, index) => ({
      customerName: booking.customer.name,
      serviceName: booking.service.name,
      startsAt: booking.startsAt,
      timeZone: booking.branch.timeZone,
      paymentStatus: booking.payment?.status ?? "PENDING",
      openAction: actions[index],
    })),
  });
  const navigation: BusinessBotAction[] = [];
  if (result.nextCursor) {
    navigation.push(await navigationAction(
      actor,
      "bookings.list",
      { filter: filter.kind, cursor: result.nextCursor },
      "Показать ещё",
      dependencies.now(),
    ));
  }
  navigation.push(
    await navigationAction(actor, "bookings.list", { filter: filter.kind }, "Обновить", dependencies.now()),
    await navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now()),
  );
  await deliver(viewWithActions(view, navigation), actor, dependencies, message);
}

async function showBookingCard(
  actor: BusinessBotPlatformActor,
  bookingId: string,
  dependencies: BusinessBotHandlerDependencies,
  message?: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  notice?: string,
) {
  try {
    const booking = await getBusinessBotBooking(actor, bookingId);
    const actions = await Promise.all([
      ...(booking.status === "PENDING_PAYMENT" ? [
        mutationAction(actor, "BOOKING_CONFIRM", { bookingId }, "Подтвердить запись", dependencies.now()),
      ] : []),
      ...(booking.status === "PENDING_PAYMENT" && booking.payment?.status === "PENDING" && booking.customer.telegramChatId ? [
        mutationAction(actor, "BOOKING_REMIND_PAYMENT", { bookingId }, "Напомнить об оплате", dependencies.now()),
      ] : []),
      ...(["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status) ? [
        navigationAction(actor, "BOOKING_RESCHEDULE_DATE", { bookingId }, "Перенести", dependencies.now()),
        navigationAction(actor, "BOOKING_CANCEL_BEGIN", { bookingId }, "Отменить запись", dependencies.now()),
      ] : []),
      navigationAction(actor, "BOOKING_REFRESH", { bookingId }, "Обновить", dependencies.now()),
      navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now()),
    ]);
    const view = bookingCardView({
      customerName: booking.customer.name,
      customerPhone: formatTajikPhoneInput(booking.customer.phone),
      serviceName: booking.service.name,
      staffName: booking.staff.displayName,
      branchName: booking.branch.name,
      startsAt: booking.startsAt,
      timeZone: booking.branch.timeZone,
      bookingStatus: booking.status,
      paymentStatus: booking.payment?.status ?? "PENDING",
      amountDiram: booking.payment?.amountDiram ?? booking.service.amountDiram,
      actions,
    });
    await deliver(notice ? { ...view, text: `${notice}\n\n${view.text}` } : view, actor, dependencies, message);
  } catch {
    await showStaleAction(actor, message, dependencies);
  }
}

async function showRescheduleDates(
  actor: BusinessBotPlatformActor,
  bookingId: string,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  dependencies: BusinessBotHandlerDependencies,
) {
  try {
    const booking = await getBusinessBotBooking(actor, bookingId);
    const firstDate = todayInTimeZone(booking.branch.timeZone, dependencies.now());
    const candidates = Array.from({ length: 7 }, (_, index) => addDays(firstDate, index));
    const available = (await Promise.all(candidates.map(async date => ({
      date,
      options: await getBusinessBookingAvailableStarts({
        businessId: actor.businessId,
        actorUserId: actor.userId,
        bookingId,
        date,
      }),
    })))).filter(item => item.options.starts.some(startsAt => startsAt > dependencies.now()));
    const actions = await Promise.all(available.map(item => navigationAction(
      actor,
      "BOOKING_RESCHEDULE_SLOT",
      { bookingId, date: item.date },
      formatDate(item.date, booking.branch.timeZone),
      dependencies.now(),
    )));
    const back = await navigationAction(actor, "BOOKING_REFRESH", { bookingId }, "Назад", dependencies.now());
    await deliver({
      text: actions.length
        ? "Выберите новую дату. Старое время сохранится до успешного переноса."
        : "На ближайшие 7 дней свободных дат нет. Старое время записи сохранено.",
      replyMarkup: inlineView(actions.length ? [...pairRows(actions), [back]] : [[back]]),
    }, actor, dependencies, message);
  } catch (error) {
    await showBookingOperationError(actor, bookingId, error, message, dependencies);
  }
}

async function showRescheduleSlots(
  actor: BusinessBotPlatformActor,
  bookingId: string,
  date: string,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  dependencies: BusinessBotHandlerDependencies,
) {
  try {
    const options = await getBusinessBookingAvailableStarts({
      businessId: actor.businessId,
      actorUserId: actor.userId,
      bookingId,
      date,
    });
    const actions = await Promise.all(options.starts.filter(startsAt => startsAt > dependencies.now()).map(startsAt => mutationAction(
      actor,
      "BOOKING_RESCHEDULE_SLOT",
      { bookingId, startsAt: startsAt.toISOString() },
      formatTime(startsAt, options.timeZone),
      dependencies.now(),
    )));
    const back = await navigationAction(actor, "BOOKING_RESCHEDULE_DATE", { bookingId }, "К датам", dependencies.now());
    await deliver({
      text: actions.length
        ? "Выберите новое время. Доступность будет проверена ещё раз перед переносом."
        : "На эту дату свободного времени уже нет. Выберите другую дату.",
      replyMarkup: inlineView(actions.length ? [...pairRows(actions), [back]] : [[back]]),
    }, actor, dependencies, message);
  } catch (error) {
    await showBookingOperationError(actor, bookingId, error, message, dependencies);
  }
}

async function showCancellationConfirmation(
  actor: BusinessBotPlatformActor,
  bookingId: string,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  dependencies: BusinessBotHandlerDependencies,
) {
  try {
    await getBusinessBotBooking(actor, bookingId);
    const reasons = ["Клиент попросил отменить", "Не удалось связаться с клиентом"];
    const actions = await Promise.all(reasons.map(reason => mutationAction(
      actor,
      "BOOKING_CANCEL_REASON",
      { bookingId, reason },
      reason,
      dependencies.now(),
    )));
    const back = await navigationAction(actor, "BOOKING_REFRESH", { bookingId }, "Назад", dependencies.now());
    await deliver({
      text: "Отменить запись? Выберите причину для подтверждения отмены.",
      replyMarkup: inlineView(actions.map(action => [action]).concat([[back]])),
    }, actor, dependencies, message);
  } catch (error) {
    await showBookingOperationError(actor, bookingId, error, message, dependencies);
  }
}

async function showBookingOperationError(
  actor: BusinessBotPlatformActor,
  bookingId: string,
  error: unknown,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  dependencies: BusinessBotHandlerDependencies,
) {
  if (!(error instanceof BookingOperationError)) {
    await showStaleAction(actor, message, dependencies);
    return;
  }
  const refresh = await navigationAction(actor, "BOOKING_REFRESH", { bookingId }, "Обновить", dependencies.now());
  const menu = await navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now());
  const text = {
    FORBIDDEN: "У вас нет доступа к этой записи.",
    NOT_FOUND: "Запись не найдена или у вас нет доступа к ней.",
    INVALID_STATUS: "Действие недоступно в текущем состоянии записи. Обновите карточку.",
    SLOT_UNAVAILABLE: "Это время уже занято. Старое время записи сохранено. Выберите другой слот.",
    INVALID_INPUT: "Данные действия устарели или заполнены неверно. Обновите карточку.",
    CUSTOMER_TELEGRAM_UNAVAILABLE: "Клиент не привязал Telegram, поэтому напоминание отправить нельзя.",
  }[error.code];
  await deliver({ text, replyMarkup: inlineView([[refresh, menu]]) }, actor, dependencies, message);
}

async function showStaleAction(
  actor: BusinessBotPlatformActor,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  dependencies: BusinessBotHandlerDependencies,
) {
  const [refresh, menu] = await Promise.all([
    navigationAction(actor, "menu.open", {}, "Обновить", dependencies.now()),
    navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now()),
  ]);
  await deliver({
    text: "Это действие уже недействительно. Обновите данные или откройте актуальное меню.",
    replyMarkup: inlineView([[refresh, menu]]),
  }, actor, dependencies, message);
}

async function showPaymentReviewList(
  actor: BusinessBotPlatformActor,
  cursor: string | null,
  dependencies: BusinessBotHandlerDependencies,
  message?: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
) {
  try {
    const result = await listBusinessBotPaymentReviews(actor, cursor);
    const openActions = await Promise.all(result.items.map(payment => navigationAction(
      actor,
      "payment.open",
      { paymentId: payment.id },
      `Открыть · ${payment.booking.customer.name}`,
      dependencies.now(),
    )));
    const navigation: BusinessBotAction[] = [];
    if (result.nextCursor) {
      navigation.push(await navigationAction(
        actor,
        "payments.list",
        { cursor: result.nextCursor },
        "Показать ещё",
        dependencies.now(),
      ));
    }
    navigation.push(
      await navigationAction(actor, "payments.list", {}, "Обновить", dependencies.now()),
      await navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now()),
    );
    const text = result.items.length
      ? ["Чеки на проверке", "", ...result.items.map((payment, index) => [
        `${index + 1}. ${payment.booking.customer.name} · ${payment.booking.service.name}`,
        `${formatSomoni(payment.amountDiram)} · ${attentionReasonLabel(payment.attentionReason)}`,
      ].join("\n"))].join("\n\n")
      : "Чеки на проверке\n\nВсе чеки проверены.";
    await deliver({
      text,
      replyMarkup: inlineView([...openActions.map(action => [action]), ...pairRows(navigation)]),
    }, actor, dependencies, message);
  } catch (error) {
    await showPaymentReviewError(actor, null, error, message, dependencies);
  }
}

async function showPaymentReviewCard(
  actor: BusinessBotPlatformActor,
  paymentId: string,
  dependencies: BusinessBotHandlerDependencies,
  message?: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  notice?: string,
) {
  try {
    const payment = await getBusinessBotPaymentReview(actor, paymentId);
    const actions: BusinessBotAction[] = [];
    if (isPaymentReviewActionable(payment)) {
      if (payment.hasReceipt) {
        actions.push(await navigationAction(actor, "PAYMENT_RECEIPT", { paymentId, submissionId: payment.submissionId! }, "Показать чек", dependencies.now()));
      }
      actions.push(
        await navigationAction(actor, "PAYMENT_APPROVE_BEGIN", { paymentId, submissionId: payment.submissionId! }, "Подтвердить оплату", dependencies.now()),
        await navigationAction(actor, "PAYMENT_REJECT_BEGIN", { paymentId, submissionId: payment.submissionId! }, "Отклонить чек", dependencies.now()),
      );
    }
    actions.push(
      await navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, "Обновить", dependencies.now()),
      await navigationAction(actor, "payments.list", {}, "К очереди", dependencies.now()),
      await navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now()),
    );
    const base = paymentReviewView({
      customerName: payment.booking.customer.name,
      serviceName: payment.booking.service.name,
      startsAt: payment.booking.startsAt,
      timeZone: payment.booking.branch.timeZone,
      amountDiram: payment.amountDiram,
      recipientCardLast4: payment.recipientCardLast4 ?? undefined,
      attentionReason: payment.attentionReason ? attentionReasonLabel(payment.attentionReason) : undefined,
    });
    const statusNotice = [...new Set([notice, paymentDecisionNotice(payment)].filter((value): value is string => Boolean(value)))].join("\n");
    await deliver(viewWithActions(statusNotice ? { ...base, text: `${statusNotice}\n\n${base.text}` } : base, actions), actor, dependencies, message);
  } catch (error) {
    await showPaymentReviewError(actor, paymentId, error, message, dependencies);
  }
}

async function showPaymentReceipt(
  actor: BusinessBotPlatformActor,
  paymentId: string,
  submissionId: string,
  dependencies: BusinessBotHandlerDependencies,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
) {
  try {
    const payment = await getBusinessBotPaymentReview(actor, paymentId);
    if (!dependencies.sendPhoto) {
      await deliver({ text: "Фото чека временно недоступно. Обновите карточку и попробуйте снова." }, actor, dependencies, message);
      return;
    }
    const receipt = await (dependencies.loadPaymentReceipt ?? getPaymentReceiptForReview)({
      businessId: actor.businessId,
      actorUserId: actor.userId,
      paymentId,
      submissionId,
    });
    const back = await navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, "Назад к проверке", dependencies.now());
    const caption = paymentReviewView({
      customerName: payment.booking.customer.name,
      serviceName: payment.booking.service.name,
      startsAt: payment.booking.startsAt,
      timeZone: payment.booking.branch.timeZone,
      amountDiram: payment.amountDiram,
      recipientCardLast4: payment.recipientCardLast4 ?? undefined,
      attentionReason: payment.attentionReason ? attentionReasonLabel(payment.attentionReason) : undefined,
    }).text;
    await dependencies.sendPhoto(actor.destination.chatId, receipt.body, caption, inlineView([[back]]));
  } catch (error) {
    await showPaymentReviewError(actor, paymentId, error, message, dependencies);
  }
}

async function showPaymentApprovalConfirmation(
  actor: BusinessBotPlatformActor,
  paymentId: string,
  submissionId: string,
  dependencies: BusinessBotHandlerDependencies,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
) {
  try {
    const payment = await getBusinessBotPaymentReview(actor, paymentId);
    if (!isPaymentReviewActionable(payment)) {
      await showPaymentReviewCard(actor, paymentId, dependencies, message);
      return;
    }
    if (payment.submissionId !== submissionId) {
      await showPaymentReviewCard(actor, paymentId, dependencies, message, "Состояние изменилось. Проверьте новый чек перед решением.");
      return;
    }
    const [confirmAction, dismissAction] = await Promise.all([
      mutationAction(actor, "PAYMENT_APPROVE_CONFIRM", { paymentId, submissionId }, "Да, подтвердить", dependencies.now()),
      navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, "Назад", dependencies.now()),
    ]);
    await deliver(paymentReviewView({
      customerName: payment.booking.customer.name,
      serviceName: payment.booking.service.name,
      startsAt: payment.booking.startsAt,
      timeZone: payment.booking.branch.timeZone,
      amountDiram: payment.amountDiram,
      recipientCardLast4: payment.recipientCardLast4 ?? undefined,
      attentionReason: payment.attentionReason ? attentionReasonLabel(payment.attentionReason) : undefined,
      confirmation: {
        text: "Подтвердить оплату после сверки чека? Запись станет подтверждённой.",
        confirmAction,
        dismissAction,
      },
    }), actor, dependencies, message);
  } catch (error) {
    await showPaymentReviewError(actor, paymentId, error, message, dependencies);
  }
}

async function showPaymentRejectionReasons(
  actor: BusinessBotPlatformActor,
  paymentId: string,
  submissionId: string,
  dependencies: BusinessBotHandlerDependencies,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
) {
  try {
    const payment = await getBusinessBotPaymentReview(actor, paymentId);
    if (!isPaymentReviewActionable(payment)) {
      await showPaymentReviewCard(actor, paymentId, dependencies, message);
      return;
    }
    if (payment.submissionId !== submissionId) {
      await showPaymentReviewCard(actor, paymentId, dependencies, message, "Состояние изменилось. Проверьте новый чек перед решением.");
      return;
    }
    const reasons = ["Сумма не совпадает", "Карта получателя не совпадает", "Оплата не подтверждена банком"];
    const actions = await Promise.all(reasons.map(reason => mutationAction(
      actor,
      "PAYMENT_REJECT_REASON",
      { paymentId, submissionId, reason },
      reason,
      dependencies.now(),
    )));
    const back = await navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, "Назад", dependencies.now());
    await deliver({
      text: "Отклонить чек? Выберите причину отклонения. Решение сохранится в истории записи.",
      replyMarkup: inlineView([...actions.map(action => [action]), [back]]),
    }, actor, dependencies, message);
  } catch (error) {
    await showPaymentReviewError(actor, paymentId, error, message, dependencies);
  }
}

async function showPaymentReviewError(
  actor: BusinessBotPlatformActor,
  paymentId: string | null,
  error: unknown,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"] | undefined,
  dependencies: BusinessBotHandlerDependencies,
) {
  if (!(error instanceof PaymentReviewError)) {
    await showStaleAction(actor, message, dependencies);
    return;
  }
  if (error.code === "INVALID_STATUS" && paymentId) {
    await showPaymentReviewCard(actor, paymentId, dependencies, message, "Состояние изменилось. Показаны актуальные данные.");
    return;
  }
  const actions = [
    ...(paymentId ? [await navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, "Обновить", dependencies.now())] : []),
    await navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now()),
  ];
  const text = {
    FORBIDDEN: "У вас нет доступа к проверке чеков.",
    NOT_FOUND: "Чек не найден или у вас нет доступа к нему.",
    INVALID_STATUS: "Чек уже обработан. Обновите карточку, чтобы увидеть текущее состояние.",
    INVALID_INPUT: "Причина должна содержать от 3 до 300 символов.",
  }[error.code];
  await deliver({ text, replyMarkup: inlineView([actions]) }, actor, dependencies, message);
}

async function showChecks(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  if (actor.role === "STAFF") {
    await dependencies.sendMessage(actor.destination.chatId, "Проверка чеков доступна владельцу и администратору.");
    return;
  }
  await showPaymentReviewList(actor, null, dependencies);
}

function attentionReasonLabel(reason: string | null) {
  return ({
    AMOUNT_MISMATCH: "Сумма не совпадает",
    RECIPIENT_MISMATCH: "Карта не совпадает",
    OPERATION_TIME_MISMATCH: "Время операции не совпадает",
    RECEIPT_NOT_SUCCESSFUL: "Оплата неуспешна",
    BOOKING_NOT_PENDING: "Статус записи изменился",
    OCR_FAILED: "Чек не распознан",
    OCR_UNRELIABLE: "Чек не распознан",
    RECEIPT_MISMATCH: "Данные не совпадают",
    DUPLICATE_OPERATION: "Операция уже использована",
  } as Record<string, string>)[reason ?? ""] ?? "Нужна ручная проверка";
}

function isPaymentReviewActionable(payment: {
  status: string;
  hasReceipt: boolean;
  submissionId: string | null;
  booking: { status: string };
}) {
  return payment.status === "NEEDS_ATTENTION"
    && payment.booking.status === "PENDING_PAYMENT"
    && payment.hasReceipt
    && Boolean(payment.submissionId);
}

function paymentDecisionNotice(payment: {
  status: string;
  reviewReason: string | null;
  hasReceipt: boolean;
  booking: { status: string };
}) {
  if (payment.status === "RECEIPT_ACCEPTED") return "Оплата подтверждена. Запись подтверждена.";
  if (payment.status === "REJECTED") return `Чек отклонён.${payment.reviewReason ? ` Причина: ${payment.reviewReason}.` : ""}`;
  if (payment.booking.status !== "PENDING_PAYMENT") {
    return `Текущее состояние: запись ${bookingReviewStatusLabel(payment.booking.status)}; оплата ${paymentReviewStatusLabel(payment.status)}. Решение по чеку недоступно.`;
  }
  if (payment.status === "NEEDS_ATTENTION" && !payment.hasReceipt) {
    return "Текущее состояние: запись ожидает оплаты; оплата требует проверки, но актуального чека на проверке нет.";
  }
  if (payment.status !== "NEEDS_ATTENTION") {
    return `Текущее состояние: запись ожидает оплаты; оплата ${paymentReviewStatusLabel(payment.status)}.`;
  }
  return null;
}

function bookingReviewStatusLabel(status: string) {
  return ({
    PENDING_PAYMENT: "ожидает оплаты",
    CONFIRMED: "подтверждена",
    CANCELLED: "отменена",
    EXPIRED: "истекла",
  } as Record<string, string>)[status] ?? "изменилась";
}

function paymentReviewStatusLabel(status: string) {
  return ({
    PENDING: "ожидает оплаты",
    RECEIPT_PROCESSING: "обрабатывается",
    NEEDS_ATTENTION: "требует проверки",
    RECEIPT_ACCEPTED: "подтверждена",
    REJECTED: "отклонена",
  } as Record<string, string>)[status] ?? "изменилась";
}

async function showCustomerLink(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  const slug = actor.business.slug;
  const url = slug ? `${requiredAppUrl()}/b/${encodeURIComponent(slug)}` : requiredAppUrl();
  await dependencies.sendMessage(actor.destination.chatId, "Ссылка для записи клиентов:", {
    inline_keyboard: [[{ text: "Открыть запись", url }]],
  });
}

async function showHelp(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  await dependencies.sendMessage(
    actor.destination.chatId,
    "Используйте меню для записей и рабочего дня. Бизнес создаёт только одного бота — клиентского; владельцы и команда работают здесь, в общем @manclient_bot.",
  );
}

async function navigationAction(
  actor: BusinessBotPlatformActor,
  kind: BusinessBotActionKind,
  payload: Prisma.InputJsonObject,
  text: string,
  now: Date,
): Promise<BusinessBotAction> {
  const action = await createBusinessBotAction(actor, {
    kind,
    payload,
    expiresAt: new Date(now.getTime() + actionLifetimeMs),
    mode: "NAVIGATION",
  });
  return { actionId: action.actionId, text };
}

async function mutationAction(
  actor: BusinessBotPlatformActor,
  kind: BusinessBotActionKind,
  payload: Prisma.InputJsonObject,
  text: string,
  now: Date,
): Promise<BusinessBotAction> {
  const action = await createBusinessBotAction(actor, {
    kind,
    payload,
    expiresAt: new Date(now.getTime() + actionLifetimeMs),
    mode: "MUTATION",
  });
  return { actionId: action.actionId, text };
}

async function deliver(
  view: BusinessBotView,
  actor: BusinessBotPlatformActor,
  dependencies: BusinessBotHandlerDependencies,
  message?: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
) {
  if (message) {
    try {
      await dependencies.editMessageText(
        { chatId: String(message.chat.id), messageId: message.message_id },
        view.text,
        view.replyMarkup,
      );
      return;
    } catch {
      // Telegram can reject edits for old or unchanged messages; sending keeps navigation usable.
    }
  }
  await dependencies.sendMessage(actor.destination.chatId, view.text, view.replyMarkup);
}

function viewWithActions(view: BusinessBotView, actions: BusinessBotAction[]): BusinessBotView {
  const existing = view.replyMarkup && "inline_keyboard" in view.replyMarkup
    ? view.replyMarkup.inline_keyboard
    : [];
  return {
    ...view,
    replyMarkup: {
      inline_keyboard: [...existing, ...inlineView([actions]).inline_keyboard],
    },
  };
}

function inlineView(rows: BusinessBotAction[][]) {
  return {
    inline_keyboard: rows.map(row => row.map(action => ({ text: action.text, callback_data: action.actionId }))),
  };
}

function bookingFilter(payload: Prisma.JsonObject): BusinessBotBookingFilter | null {
  const filter = stringValue(payload.filter);
  return filter === "today" || filter === "upcoming" || filter === "pending"
    ? { kind: filter }
    : null;
}

function stringValue(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

function titleForFilter(filter: BusinessBotBookingFilter["kind"]) {
  switch (filter) {
    case "today": return "Записи на сегодня";
    case "pending": return "Ожидают оплату";
    case "upcoming": return "Ближайшие записи";
  }
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "short", weekday: "short" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function formatTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(value);
}

function pairRows(actions: BusinessBotAction[]) {
  return Array.from({ length: Math.ceil(actions.length / 2) }, (_, index) => actions.slice(index * 2, index * 2 + 2));
}

function requiredAppUrl() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required");
  return appUrl.replace(/\/$/, "");
}
