import type { BusinessRole, Prisma } from "@/generated/prisma/client";

import {
  consumeBusinessBotAction,
  createBusinessBotAction,
  type BusinessBotActionActor,
} from "@/core/integrations/business-bot-actions";
import {
  getBusinessBotBooking,
  getBusinessBotSummary,
  listBusinessBotBookings,
  type BusinessBotBookingFilter,
} from "@/core/integrations/business-bot-query-service";
import { formatTajikPhoneInput } from "@/core/formatting/tajik-phone";
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
) {
  try {
    const booking = await getBusinessBotBooking(actor, bookingId);
    const [refresh, menu] = await Promise.all([
      navigationAction(actor, "booking.open", { bookingId }, "Обновить", dependencies.now()),
      navigationAction(actor, "menu.open", {}, "Главное меню", dependencies.now()),
    ]);
    await deliver(bookingCardView({
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
      actions: [refresh, menu],
    }), actor, dependencies, message);
  } catch {
    await showStaleAction(actor, message, dependencies);
  }
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
  kind: string,
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

function requiredAppUrl() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required");
  return appUrl.replace(/\/$/, "");
}
