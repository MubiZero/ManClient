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
  getBusinessBotSummary,
  listBusinessBotBookings,
  type BusinessBotBookingFilter,
} from "@/core/integrations/business-bot-query-service";
import { formatTajikPhoneInput } from "@/core/formatting/tajik-phone";
import { todayInTimeZone } from "@/core/formatting/dushanbe-date";
import {
  bookingCardView,
  bookingListView,
  mainMenuView,
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
    keyboard: [...keyboard, [{ text: "Ссылка для клиентов" }, { text: "Ещё" }]],
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

async function showChecks(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  if (actor.role === "STAFF") {
    await dependencies.sendMessage(actor.destination.chatId, "Проверка чеков доступна владельцу и администратору.");
    return;
  }
  const summary = await getBusinessBotSummary(actor, dependencies.now());
  await dependencies.sendMessage(actor.destination.chatId, `Чеков на проверке: ${summary.needsAttentionCount}.`);
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
    "Используйте меню, чтобы открыть записи и рабочий день. Владельцы и администраторы могут отправить сюда токен клиентского Telegram-бота для подключения.",
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
