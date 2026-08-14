import { createPendingBooking } from "@/core/bookings/booking-service";
import { BookingPolicyError } from "@/core/bookings/booking-policy";
import {
  conversationMessage,
  getActiveConversationSession,
  handleConversationCommand,
  openConversation,
  replaceConversationSession,
  restartConversation,
} from "@/core/conversations/conversation-engine";
import { consumeConversationAction, createConversationAction } from "@/core/conversations/conversation-actions";
import type { ConversationData, ConversationLocale, ConversationStateName } from "@/core/conversations/conversation-state";
import { getAvailableStarts } from "@/core/availability/availability-service";
import { prisma } from "@/core/database/prisma";
import { DEFAULT_TIME_ZONE, localDateTimeToUtc } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import { assertPaymentCardConfigured, getPaymentUrl } from "@/core/payments/payment-service";
import type { ReceiptRecognizer } from "@/core/payments/receipt-recognizer";
import { intlLocale, moneyLocale, t } from "@/i18n/translate";
import { fitButtonText } from "@/integrations/telegram/bot-messages";
import { contactKeyboard, inlineButtonGrid, inlineButtons } from "@/integrations/telegram/conversation-renderer";
import { escapeTelegramHtml, type TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";
import type { BusinessTelegramContext, BusinessTelegramUpdate } from "@/integrations/telegram/business-update-dispatcher";
import { handleTelegramUpdate } from "@/integrations/telegram/update-handler";
import { verifyBookingActionToken } from "@/core/bookings/booking-action-token";
import { listCustomerBookings, getCustomerBooking } from "@/core/bookings/customer-booking-query-service";
import { cancelBooking } from "@/core/bookings/cancel-booking";
import { rescheduleBooking } from "@/core/bookings/reschedule-booking";

export type BusinessTelegramHandlerDependencies = {
  now: () => Date;
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup, parseMode?: "HTML") => Promise<void>;
  answerCallbackQuery?: (callbackQueryId: string, text?: string) => Promise<void>;
  downloadPhoto: (fileId: string) => Promise<Uint8Array>;
  storeReceipt: (input: { storageKey: string; contentType: string; body: Uint8Array }) => Promise<string>;
  recognizeReceipt: ReceiptRecognizer["recognize"] extends (storageKey: string) => infer _Result
    ? (image: Uint8Array) => Promise<Awaited<_Result>>
    : never;
};

const SESSION_MINUTES = 30;

export async function handleBusinessTelegramUpdate(
  context: BusinessTelegramContext,
  update: BusinessTelegramUpdate,
  dependencies: BusinessTelegramHandlerDependencies,
) {
  const chatId = update.message
    ? String(update.message.chat.id)
    : update.callback_query?.message
      ? String(update.callback_query.message.chat.id)
      : null;
  if (!chatId) return;
  const chatType = update.message?.chat.type ?? update.callback_query?.message?.chat.type ?? "private";
  if (chatType !== "private") {
    await dependencies.sendMessage(chatId, "Для записи и оплаты откройте этого бота в личном чате.");
    return;
  }

  const conversation = await openConversation({
    businessId: context.businessId,
    integrationId: context.integrationId,
    channel: "TELEGRAM",
    externalChatId: chatId,
    expiresAt: sessionExpiry(dependencies.now()),
  });

  const startText = update.message?.text?.trim();
  if (startText?.startsWith("/start ")) {
    await bindPaymentDeepLink(context.businessId, conversation.id, chatId, startText.slice(7).trim(), dependencies);
    return;
  }

  if (startText === "/start") {
    const current = await getActiveConversationSession(context.businessId, conversation.id);
    if (current.data.locale) {
      await replaceConversationSession(context.businessId, conversation.id, "HOME", { locale: current.data.locale }, sessionExpiry(dependencies.now()));
    } else {
      await restartConversation(context.businessId, conversation.id, sessionExpiry(dependencies.now()));
    }
    await renderState(context.businessId, conversation.id, chatId, dependencies);
    return;
  }

  if (startText === "/menu") {
    const current = await getActiveConversationSession(context.businessId, conversation.id);
    await replaceConversationSession(context.businessId, conversation.id, "HOME", { locale: localeOf(current.data) }, sessionExpiry(dependencies.now()));
    await renderState(context.businessId, conversation.id, chatId, dependencies);
    return;
  }
  if (startText === "/book") {
    const current = await getActiveConversationSession(context.businessId, conversation.id);
    await replaceConversationSession(context.businessId, conversation.id, "BRANCH", { locale: localeOf(current.data) }, sessionExpiry(dependencies.now()));
    await renderState(context.businessId, conversation.id, chatId, dependencies);
    return;
  }
  if (startText === "/bookings") {
    await renderCustomerBookings(context.businessId, conversation.id, chatId, dependencies);
    return;
  }
  if (startText === "/language") {
    await replaceConversationSession(context.businessId, conversation.id, "LANGUAGE", {}, sessionExpiry(dependencies.now()));
    await renderState(context.businessId, conversation.id, chatId, dependencies);
    return;
  }
  if (startText === "/help") {
    await dependencies.sendMessage(chatId, "Здесь можно записаться, оплатить визит, отправить чек, перенести или отменить запись. Команды: /menu, /book, /bookings, /language.");
    return;
  }

  if (update.callback_query?.data) {
    if (update.callback_query.id && dependencies.answerCallbackQuery) {
      await dependencies.answerCallbackQuery(update.callback_query.id);
    }
    if (update.callback_query.data.startsWith("c.")) {
      await handleTelegramUpdate(context.businessId, update, dependencies);
      return;
    }
    await handleAction(context.businessId, conversation.id, chatId, update.callback_query.data, dependencies);
    return;
  }

  const session = await getActiveConversationSession(context.businessId, conversation.id);
  if (update.message?.photo?.length) {
    if (session.state !== "AWAITING_RECEIPT") {
      await dependencies.sendMessage(chatId, conversationMessage(localeOf(session.data), session.state));
      return;
    }
    await handleTelegramUpdate(context.businessId, update, dependencies, session.data.paymentId);
    if (session.data.bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: session.data.bookingId, businessId: context.businessId },
        select: { status: true },
      });
      if (booking?.status === "CONFIRMED") {
        await handleConversationCommand({
          businessId: context.businessId,
          conversationId: conversation.id,
          kind: "RECEIPT_ACCEPTED",
          payload: {},
        }, dependencies.now());
      }
    }
    return;
  }

  if (session.state === "CUSTOMER_NAME" && update.message?.text) {
    await advanceAndRender(context.businessId, conversation.id, chatId, "ENTER_NAME", { name: update.message.text }, dependencies);
    return;
  }
  if (session.state === "CUSTOMER_PHONE") {
    const contact = update.message?.contact;
    if (contact?.user_id && String(contact.user_id) !== chatId) {
      await dependencies.sendMessage(chatId, "Отправьте собственный номер телефона.", contactKeyboard(localeOf(session.data)));
      return;
    }
    const phone = normalizeTajikPhone(contact?.phone_number ?? update.message?.text ?? "");
    await advanceAndRender(context.businessId, conversation.id, chatId, "ENTER_PHONE", { phone }, dependencies);
    return;
  }

  await dependencies.sendMessage(chatId, conversationMessage(localeOf(session.data), session.state));
}

async function bindPaymentDeepLink(
  businessId: string,
  conversationId: string,
  chatId: string,
  token: string,
  dependencies: BusinessTelegramHandlerDependencies,
) {
  try {
    const action = verifyBookingActionToken(token, dependencies.now(), "link_payment");
    const payment = await prisma.payment.findFirst({
      where: { id: action.paymentId, businessId, booking: { status: "PENDING_PAYMENT" } },
      include: { booking: true },
    });
    if (!payment) throw new Error("Payment is unavailable");
    await prisma.$transaction([
      prisma.customer.update({ where: { id: payment.booking.customerId }, data: { telegramChatId: chatId, telegramLocale: "ru" } }),
      prisma.conversationSession.updateMany({
        where: { conversationId, active: true },
        data: {
          state: "AWAITING_PAYMENT",
          data: { locale: "ru", bookingId: payment.bookingId, paymentId: payment.id },
          expiresAt: sessionExpiry(dependencies.now()),
          version: { increment: 1 },
        },
      }),
    ]);
    await renderState(businessId, conversationId, chatId, dependencies);
  } catch {
    await dependencies.sendMessage(chatId, "Ссылка на оплату истекла или недействительна. Откройте актуальную запись и попробуйте снова.");
  }
}

async function handleAction(
  businessId: string,
  conversationId: string,
  chatId: string,
  actionId: string,
  dependencies: BusinessTelegramHandlerDependencies,
) {
  try {
    const action = await consumeConversationAction({
      businessId,
      conversationId,
      actionId,
      now: dependencies.now(),
    });
    if (await handleCustomerAction(businessId, conversationId, chatId, action.kind, action.payload as Record<string, string>, dependencies)) return;
    let payload = action.payload;
    if (action.kind === "CONFIRM_BOOKING") {
      const created = await createBookingForConversation(businessId, conversationId, chatId, dependencies.now());
      // A business that takes payment on the premises has nothing to wait for, so the conversation skips
      // the "pay, then send the receipt" leg entirely instead of asking for a transfer of nothing.
      if (created.dueDiram === 0) {
        await replaceConversationSession(
          businessId,
          conversationId,
          "COMPLETE",
          { ...created.data, bookingId: created.bookingId, paymentId: created.paymentId },
          sessionExpiry(dependencies.now()),
        );
        await renderState(businessId, conversationId, chatId, dependencies);
        return;
      }
      payload = { bookingId: created.bookingId, paymentId: created.paymentId };
    }
    await advanceAndRender(businessId, conversationId, chatId, action.kind, payload, dependencies);
  } catch {
    await dependencies.sendMessage(chatId, "Действие устарело или выбранное время уже недоступно. Отправьте /start, чтобы начать заново.");
  }
}

async function advanceAndRender(
  businessId: string,
  conversationId: string,
  chatId: string,
  kind: string,
  payload: unknown,
  dependencies: BusinessTelegramHandlerDependencies,
) {
  await handleConversationCommand({ businessId, conversationId, kind, payload }, dependencies.now());
  await renderState(businessId, conversationId, chatId, dependencies);
}

async function renderState(
  businessId: string,
  conversationId: string,
  chatId: string,
  dependencies: BusinessTelegramHandlerDependencies,
  page = 0,
) {
  const session = await getActiveConversationSession(businessId, conversationId);
  const locale = localeOf(session.data);
  const expiresAt = session.expiresAt;

  if (session.state === "LANGUAGE") {
    await dependencies.sendMessage(chatId, conversationMessage("ru", "LANGUAGE"), inlineButtons(await actionButtons(businessId, conversationId, expiresAt, [
      { text: "Русский", kind: "SELECT_LANGUAGE", payload: { locale: "ru" } },
      { text: "Тоҷикӣ", kind: "SELECT_LANGUAGE", payload: { locale: "tg" } },
    ])));
    return;
  }
  if (session.state === "HOME") {
    const labels = locale === "tg"
      ? { book: "Сабти нав", bookings: "Сабтҳои ман", language: "Забон", help: "Кӯмак" }
      : { book: "Новая запись", bookings: "Мои записи", language: "Язык", help: "Помощь" };
    await dependencies.sendMessage(chatId, conversationMessage(locale, "HOME"), inlineButtons(await actionButtons(businessId, conversationId, expiresAt, [
      { text: labels.book, kind: "CLIENT_BOOK", payload: {} },
      { text: labels.bookings, kind: "CLIENT_BOOKINGS", payload: {} },
      { text: labels.language, kind: "CLIENT_LANGUAGE", payload: {} },
      { text: labels.help, kind: "CLIENT_HELP", payload: {} },
    ])));
    return;
  }
  if (session.state === "BRANCH") {
    // The same visibility rules the booking core enforces: offering an archived branch or an unpublished
    // service only walks the customer into "no free time" three taps later.
    const branches = await prisma.branch.findMany({ where: { businessId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    await sendOptions(chatId, locale, "BRANCH", branches.map(branch => ({ text: branch.name, kind: "SELECT_BRANCH", payload: { branchId: branch.id } })), businessId, conversationId, expiresAt, dependencies, page);
    return;
  }
  if (session.state === "SERVICE") {
    const services = await prisma.service.findMany({
      where: { branch: { id: session.data.branchId, businessId }, archivedAt: null, isPublished: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, durationMinutes: true, amountDiram: true },
    });
    await sendOptions(chatId, locale, "SERVICE", services.map(service => ({ text: serviceOptionLabel(service, locale), kind: "SELECT_SERVICE", payload: { serviceId: service.id } })), businessId, conversationId, expiresAt, dependencies, page);
    return;
  }
  if (session.state === "STAFF") {
    const staff = await prisma.staffMember.findMany({ where: { businessId, archivedAt: null, branches: { some: { branchId: session.data.branchId } }, services: { some: { id: session.data.serviceId } } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } });
    await sendOptions(chatId, locale, "STAFF", staff.map(member => ({ text: member.displayName, kind: "SELECT_STAFF", payload: { staffId: member.id } })), businessId, conversationId, expiresAt, dependencies, page);
    return;
  }
  if (session.state === "DATE") {
    const branch = await prisma.branch.findFirstOrThrow({ where: { id: required(session.data.branchId), businessId }, select: { timeZone: true } });
    const dates = nextDates(dependencies.now(), 14, branch.timeZone);
    await sendOptions(chatId, locale, "DATE", dates.map(date => ({ text: formatDateLabel(date, locale), kind: "SELECT_DATE", payload: { date } })), businessId, conversationId, expiresAt, dependencies, page, 2);
    return;
  }
  if (session.state === "SLOT") {
    const [service, branch] = await Promise.all([
      selectedService(businessId, session.data),
      prisma.branch.findFirstOrThrow({ where: { id: required(session.data.branchId), businessId }, select: { timeZone: true } }),
    ]);
    const date = required(session.data.date);
    const rangeStartsAt = localDateTimeToUtc(date, "00:00", branch.timeZone);
    const starts = await getAvailableStarts({
      branchId: required(session.data.branchId),
      serviceId: required(session.data.serviceId),
      staffId: required(session.data.staffId),
      resourceIds: service.resources.map(({ resourceId }) => resourceId),
      rangeStartsAt,
      rangeEndsAt: localDateTimeToUtc(nextDate(date), "00:00", branch.timeZone),
      durationMinutes: service.durationMinutes,
      intervalMinutes: 30,
      // The handler's clock is injected; passing it on is what makes the booking policy — and the rule
      // that a customer is never offered a time that has already passed — measured against the same now.
      now: dependencies.now(),
    });
    await sendOptions(chatId, locale, "SLOT", starts.map(startsAt => ({ text: formatVisitTime(startsAt, branch.timeZone), kind: "SELECT_SLOT", payload: { startsAt: startsAt.toISOString() } })), businessId, conversationId, expiresAt, dependencies, page, 3);
    return;
  }
  if (session.state === "CUSTOMER_PHONE") {
    await dependencies.sendMessage(chatId, conversationMessage(locale, session.state), contactKeyboard(locale));
    return;
  }
  if (session.state === "CONFIRM") {
    const details = await bookingSummary(businessId, session.data, locale);
    const actions = await actionButtons(businessId, conversationId, expiresAt, [
      { text: locale === "tg" ? "Тасдиқ" : "Подтвердить запись", kind: "CONFIRM_BOOKING", payload: {} },
      { text: locale === "tg" ? "Тағйири вақт" : "Изменить время", kind: "CLIENT_BACK", payload: { state: "CONFIRM" } },
    ]);
    await dependencies.sendMessage(chatId, `${conversationMessage(locale, "CONFIRM")}\n\n${details}`, inlineButtonGrid(actions, 1), "HTML");
    return;
  }
  if (session.state === "AWAITING_PAYMENT") {
    const paymentUrl = await getPaymentUrl(required(session.data.paymentId));
    const actions = await actionButtons(businessId, conversationId, expiresAt, [{
      text: locale === "tg" ? "Ман пардохт кардам" : "Я оплатил",
      kind: "PAYMENT_SUBMITTED",
      payload: {},
    }]);
    await dependencies.sendMessage(chatId, `${conversationMessage(locale, session.state)}\nDushanbeCity`, inlineButtons([
      { text: locale === "tg" ? "Пардохт" : "Оплатить", url: paymentUrl.toString() },
      ...actions,
    ]));
    return;
  }
  if (session.state === "COMPLETE" && session.data.paymentId) {
    await dependencies.sendMessage(chatId, `${conversationMessage(locale, "COMPLETE")}${await balanceNotice(session.data.paymentId, locale)}`);
    return;
  }
  await dependencies.sendMessage(chatId, conversationMessage(locale, session.state));
}

/**
 * What the customer still owes when the visit happens. Silent when the whole price has already been
 * transferred — a "0 сомони to pay" line reads as a mistake.
 */
async function balanceNotice(paymentId: string, locale: ConversationLocale): Promise<string> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { amountDiram: true, totalDiram: true } });
  const balanceDiram = Math.max(0, (payment?.totalDiram ?? 0) - (payment?.amountDiram ?? 0));
  if (balanceDiram === 0) return "";
  const amount = (balanceDiram / 100).toFixed(2);
  return locale === "tg" ? `\nДар ҷои қабул: ${amount} сомонӣ.` : `\nК оплате на месте: ${amount} сомони.`;
}

async function sendOptions(
  chatId: string,
  locale: ConversationLocale,
  state: ConversationStateName,
  options: ActionOption[],
  businessId: string,
  conversationId: string,
  expiresAt: Date,
  dependencies: BusinessTelegramHandlerDependencies,
  page = 0,
  columns = 1,
) {
  if (options.length === 0) {
    const home = await actionButtons(businessId, conversationId, expiresAt, [{ text: locale === "tg" ? "Ба меню" : "В меню", kind: "CLIENT_HOME", payload: {} }]);
    await dependencies.sendMessage(chatId, locale === "tg" ? "Ҳоло интихоби дастрас нест." : "Сейчас нет доступных вариантов.", inlineButtons(home));
    return;
  }
  const pageSize = state === "SLOT" ? 12 : 8;
  const lastPage = Math.max(0, Math.ceil(options.length / pageSize) - 1);
  const currentPage = Math.min(Math.max(page, 0), lastPage);
  const visible = options.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const paging: ActionOption[] = [];
  if (currentPage > 0) paging.push({ text: locale === "tg" ? "← Қаблӣ" : "← Назад по списку", kind: "CLIENT_OPTIONS_PAGE", payload: { page: String(currentPage - 1) } });
  if (currentPage < lastPage) paging.push({ text: locale === "tg" ? "Баъдӣ →" : "Дальше →", kind: "CLIENT_OPTIONS_PAGE", payload: { page: String(currentPage + 1) } });
  const back = { text: locale === "tg" ? "‹ Ба қафо" : "‹ Назад", kind: "CLIENT_BACK", payload: { state } };
  const home = { text: locale === "tg" ? "Ба меню" : "В меню", kind: "CLIENT_HOME", payload: {} };
  const [choiceButtons, pagingButtons, backButton, homeButton] = await Promise.all([
    actionButtons(businessId, conversationId, expiresAt, visible),
    actionButtons(businessId, conversationId, expiresAt, paging),
    actionButtons(businessId, conversationId, expiresAt, [back]),
    actionButtons(businessId, conversationId, expiresAt, [home]),
  ]);
  await dependencies.sendMessage(chatId, conversationMessage(locale, state), inlineButtonGrid(choiceButtons, columns, [
    ...(pagingButtons.length ? [pagingButtons] : []),
    backButton,
    homeButton,
  ]));
}

type ActionOption = { text: string; kind: string; payload: Record<string, string> };

async function actionButtons(
  businessId: string,
  conversationId: string,
  expiresAt: Date,
  options: ActionOption[],
) {
  return Promise.all(options.map(async option => {
    const action = await createConversationAction({ businessId, conversationId, kind: option.kind, payload: option.payload, expiresAt });
    return { text: option.text, callbackData: action.id };
  }));
}

async function createBookingForConversation(
  businessId: string,
  conversationId: string,
  chatId: string,
  now: Date,
) {
  const session = await getActiveConversationSession(businessId, conversationId);
  const service = await selectedService(businessId, session.data);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { slug: true } });
  const booking = await createPendingBooking({
    source: "TELEGRAM",
    businessSlug: business.slug,
    branchId: required(session.data.branchId),
    serviceId: required(session.data.serviceId),
    staffId: required(session.data.staffId),
    resourceIds: service.resources.map(({ resourceId }) => resourceId),
    startsAt: new Date(required(session.data.startsAt)),
    customer: { name: required(session.data.name), phone: required(session.data.phone) },
  }, now);
  const stored = await prisma.booking.findFirstOrThrow({ where: { id: booking.bookingId, businessId }, select: { customerId: true } });
  await prisma.customer.update({ where: { id: stored.customerId }, data: { telegramChatId: chatId, telegramLocale: localeOf(session.data) } });
  return { bookingId: booking.bookingId, paymentId: booking.paymentId, dueDiram: booking.prepayment.dueDiram, data: session.data };
}

async function renderCustomerBookings(
  businessId: string,
  conversationId: string,
  chatId: string,
  dependencies: BusinessTelegramHandlerDependencies,
  cursor?: string,
) {
  const session = await getActiveConversationSession(businessId, conversationId);
  const locale = localeOf(session.data);
  const result = await listCustomerBookings({ businessId, telegramChatId: chatId, cursor });
  if (result.items.length === 0) {
    const buttons = await actionButtons(businessId, conversationId, session.expiresAt, [{
      text: locale === "tg" ? "Сабти нав" : "Записаться",
      kind: "CLIENT_BOOK",
      payload: {},
    }]);
    await dependencies.sendMessage(chatId, locale === "tg" ? "Шумо ҳоло сабт надоред." : "У вас пока нет записей.", inlineButtons(buttons));
    return;
  }
  for (const booking of result.items) {
    await renderCustomerBookingCard(businessId, conversationId, chatId, booking.id, dependencies);
  }
  if (result.nextCursor) {
    const more = await actionButtons(businessId, conversationId, session.expiresAt, [{ text: locale === "tg" ? "Боз нишон диҳед" : "Показать ещё", kind: "CLIENT_BOOKINGS_PAGE", payload: { cursor: result.nextCursor } }]);
    await dependencies.sendMessage(chatId, locale === "tg" ? "Сабтҳои дигар" : "Другие записи", inlineButtons(more));
  }
}

async function renderCustomerBookingCard(
  businessId: string,
  conversationId: string,
  chatId: string,
  bookingId: string,
  dependencies: BusinessTelegramHandlerDependencies,
) {
  const session = await getActiveConversationSession(businessId, conversationId);
  const locale = localeOf(session.data);
  const booking = await getCustomerBooking({ businessId, telegramChatId: chatId, bookingId });
  if (!booking) throw new Error("Booking is unavailable");
  const visit = new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-RU", { timeZone: booking.branch.timeZone, dateStyle: "medium", timeStyle: "short" }).format(booking.startsAt);
  const active = (["PENDING_PAYMENT", "CONFIRMED"] as string[]).includes(booking.status) && booking.startsAt > dependencies.now();
  const options: ActionOption[] = active ? [
    { text: locale === "tg" ? "Гузарондани вақт" : "Перенести", kind: "CLIENT_RESCHEDULE_BEGIN", payload: { bookingId } },
    { text: locale === "tg" ? "Бекор кардан" : "Отменить", kind: "CLIENT_CANCEL_BEGIN", payload: { bookingId } },
  ] : [];
  if (booking.status === "PENDING_PAYMENT" && booking.payment?.status === "PENDING") {
    options.unshift({ text: locale === "tg" ? "Пардохт" : "Оплатить", kind: "CLIENT_PAYMENT", payload: { bookingId, paymentId: booking.payment.id } });
  }
  const status = ({ PENDING_PAYMENT: locale === "tg" ? "Интизори пардохт" : "Ожидает оплаты", CONFIRMED: locale === "tg" ? "Тасдиқ шуд" : "Подтверждена", CANCELLED: locale === "tg" ? "Бекор шуд" : "Отменена", EXPIRED: locale === "tg" ? "Муҳлат гузашт" : "Истекла" } as Record<string, string>)[booking.status] ?? booking.status;
  await dependencies.sendMessage(
    chatId,
    `<b>${escapeTelegramHtml(status)}</b>\n${visit}\n${escapeTelegramHtml(booking.service.name)} · ${escapeTelegramHtml(booking.staff.displayName)}\n${escapeTelegramHtml(booking.branch.name)}`,
    options.length ? inlineButtons(await actionButtons(businessId, conversationId, session.expiresAt, options)) : undefined,
    "HTML",
  );
}

async function handleCustomerAction(
  businessId: string,
  conversationId: string,
  chatId: string,
  kind: string,
  payload: Record<string, string>,
  dependencies: BusinessTelegramHandlerDependencies,
) {
  const session = await getActiveConversationSession(businessId, conversationId);
  const locale = localeOf(session.data);
  if (kind === "CLIENT_BOOK") {
    await replaceConversationSession(businessId, conversationId, "BRANCH", { locale }, sessionExpiry(dependencies.now()));
    await renderState(businessId, conversationId, chatId, dependencies);
    return true;
  }
  if (kind === "CLIENT_HOME") {
    await replaceConversationSession(businessId, conversationId, "HOME", { locale }, sessionExpiry(dependencies.now()));
    await renderState(businessId, conversationId, chatId, dependencies);
    return true;
  }
  if (kind === "CLIENT_OPTIONS_PAGE") {
    await renderState(businessId, conversationId, chatId, dependencies, Number.parseInt(payload.page ?? "0", 10) || 0);
    return true;
  }
  if (kind === "CLIENT_BACK") {
    const previous = ({ BRANCH: "HOME", SERVICE: "BRANCH", STAFF: "SERVICE", DATE: "STAFF", SLOT: "DATE", CONFIRM: "SLOT" } as const)[payload.state as "BRANCH" | "SERVICE" | "STAFF" | "DATE" | "SLOT" | "CONFIRM"];
    if (!previous) throw new Error("Back target is invalid");
    await replaceConversationSession(businessId, conversationId, previous, session.data, sessionExpiry(dependencies.now()));
    await renderState(businessId, conversationId, chatId, dependencies);
    return true;
  }
  if (kind === "CLIENT_BOOKINGS" || kind === "CLIENT_BOOKINGS_PAGE") {
    await renderCustomerBookings(businessId, conversationId, chatId, dependencies, payload.cursor);
    return true;
  }
  if (kind === "CLIENT_LANGUAGE") {
    await replaceConversationSession(businessId, conversationId, "LANGUAGE", {}, sessionExpiry(dependencies.now()));
    await renderState(businessId, conversationId, chatId, dependencies);
    return true;
  }
  if (kind === "CLIENT_HELP") {
    await dependencies.sendMessage(chatId, locale === "tg" ? "Шумо метавонед сабт созед, пардохт кунед, расид фиристед, вақтро гузаронед ё сабтро бекор кунед." : "Здесь можно записаться, оплатить визит, отправить чек, перенести или отменить запись.");
    return true;
  }
  if (kind === "CLIENT_PAYMENT") {
    const booking = await getCustomerBooking({ businessId, telegramChatId: chatId, bookingId: payload.bookingId });
    if (!booking || booking.payment?.id !== payload.paymentId) throw new Error("Payment is unavailable");
    await replaceConversationSession(businessId, conversationId, "AWAITING_PAYMENT", { locale, bookingId: booking.id, paymentId: payload.paymentId }, sessionExpiry(dependencies.now()));
    await renderState(businessId, conversationId, chatId, dependencies);
    return true;
  }
  if (kind === "CLIENT_CANCEL_BEGIN") {
    const booking = await getCustomerBooking({ businessId, telegramChatId: chatId, bookingId: payload.bookingId });
    if (!booking) throw new Error("Booking is unavailable");
    const confirm = await actionButtons(businessId, conversationId, session.expiresAt, [
      { text: locale === "tg" ? "Ҳа, бекор кунед" : "Да, отменить", kind: "CLIENT_CANCEL_CONFIRM", payload: { bookingId: booking.id } },
      { text: locale === "tg" ? "Не, нигоҳ доред" : "Не отменять", kind: "CLIENT_CANCEL_DISMISS", payload: { bookingId: booking.id } },
    ]);
    await dependencies.sendMessage(chatId, locale === "tg" ? "Сабтро бекор мекунед?" : "Точно отменить запись?", inlineButtonGrid(confirm, 2));
    return true;
  }
  if (kind === "CLIENT_CANCEL_DISMISS") {
    await renderCustomerBookingCard(businessId, conversationId, chatId, payload.bookingId, dependencies);
    return true;
  }
  if (kind === "CLIENT_CANCEL_CONFIRM") {
    const booking = await prisma.booking.findFirst({ where: { id: payload.bookingId, businessId, customer: { telegramChatId: chatId } }, select: { customerId: true } });
    if (!booking) throw new Error("Booking is unavailable");
    try {
      await cancelBooking({ bookingId: payload.bookingId, actor: { type: "customer", customerId: booking.customerId } }, dependencies.now());
    } catch (error) {
      if (!(error instanceof BookingPolicyError)) throw error;
      await dependencies.sendMessage(
        chatId,
        locale === "tg"
          ? `Сабтро камтар аз ${error.limit ?? 0} соат пеш аз ташриф бекор кардан мумкин нест. Лутфан бо мо тамос гиред.`
          : `Отменить запись можно не позднее чем за ${error.limit ?? 0} ч до визита. Свяжитесь с бизнесом напрямую.`,
      );
      return true;
    }
    await dependencies.sendMessage(chatId, locale === "tg" ? "Сабт бекор шуд. Вақт боз дастрас аст." : "Запись отменена. Время снова доступно.");
    return true;
  }
  if (kind === "CLIENT_RESCHEDULE_BEGIN") {
    const booking = await getCustomerBooking({ businessId, telegramChatId: chatId, bookingId: payload.bookingId });
    if (!booking) throw new Error("Booking is unavailable");
    const dates = nextDates(dependencies.now(), 14, booking.branch.timeZone);
    const [dateButtons, bookingButton, homeButton] = await Promise.all([
      actionButtons(businessId, conversationId, session.expiresAt, dates.map(date => ({ text: formatDateLabel(date, locale), kind: "CLIENT_RESCHEDULE_DATE", payload: { bookingId: booking.id, date } }))),
      actionButtons(businessId, conversationId, session.expiresAt, [{ text: locale === "tg" ? "‹ Ба сабт" : "‹ К записи", kind: "CLIENT_BOOKING_OPEN", payload: { bookingId: booking.id } }]),
      actionButtons(businessId, conversationId, session.expiresAt, [{ text: locale === "tg" ? "Ба меню" : "В меню", kind: "CLIENT_HOME", payload: {} }]),
    ]);
    await dependencies.sendMessage(chatId, locale === "tg" ? "Рӯзи навро интихоб кунед." : "Выберите новый день.", inlineButtonGrid(dateButtons, 2, [bookingButton, homeButton]));
    return true;
  }
  if (kind === "CLIENT_BOOKING_OPEN") {
    await renderCustomerBookingCard(businessId, conversationId, chatId, payload.bookingId, dependencies);
    return true;
  }
  if (kind === "CLIENT_RESCHEDULE_DATE") {
    const booking = await prisma.booking.findFirst({ where: { id: payload.bookingId, businessId, customer: { telegramChatId: chatId }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } }, include: { branch: { select: { timeZone: true } }, service: true, resources: true } });
    if (!booking) throw new Error("Booking is unavailable");
    const date = required(payload.date);
    const rangeStartsAt = localDateTimeToUtc(date, "00:00", booking.branch.timeZone);
    const starts = await getAvailableStarts({ branchId: booking.branchId, serviceId: booking.serviceId, staffId: booking.staffId, resourceIds: booking.resources.map(item => item.resourceId), rangeStartsAt, rangeEndsAt: localDateTimeToUtc(nextDate(date), "00:00", booking.branch.timeZone), durationMinutes: booking.service.durationMinutes, intervalMinutes: 30, excludeBookingId: booking.id, now: dependencies.now() });
    if (!starts.length) {
      const actions = await actionButtons(businessId, conversationId, session.expiresAt, [
        { text: locale === "tg" ? "Интихоби рӯзи дигар" : "Выбрать другой день", kind: "CLIENT_RESCHEDULE_BEGIN", payload: { bookingId: booking.id } },
        { text: locale === "tg" ? "‹ Ба сабт" : "‹ К записи", kind: "CLIENT_BOOKING_OPEN", payload: { bookingId: booking.id } },
      ]);
      await dependencies.sendMessage(chatId, locale === "tg" ? "Дар ин рӯз вақти холӣ нест. Рӯзи дигарро интихоб кунед." : "В этот день свободного времени нет. Выберите другой день.", inlineButtons(actions));
      return true;
    }
    const slotOptions = starts.slice(0, 12).map(startsAt => ({
      text: formatVisitTime(startsAt, booking.branch.timeZone),
      kind: "CLIENT_RESCHEDULE_SLOT",
      payload: { bookingId: booking.id, startsAt: startsAt.toISOString() },
    }));
    const [slotButtons, dateButton, bookingButton] = await Promise.all([
      actionButtons(businessId, conversationId, session.expiresAt, slotOptions),
      actionButtons(businessId, conversationId, session.expiresAt, [{ text: locale === "tg" ? "‹ Рӯзи дигар" : "‹ Другой день", kind: "CLIENT_RESCHEDULE_BEGIN", payload: { bookingId: booking.id } }]),
      actionButtons(businessId, conversationId, session.expiresAt, [{ text: locale === "tg" ? "‹ Ба сабт" : "‹ К записи", kind: "CLIENT_BOOKING_OPEN", payload: { bookingId: booking.id } }]),
    ]);
    await dependencies.sendMessage(chatId, locale === "tg" ? "Вақти навро интихоб кунед." : "Выберите новое время.", inlineButtonGrid(slotButtons, 3, [dateButton, bookingButton]));
    return true;
  }
  if (kind === "CLIENT_RESCHEDULE_SLOT") {
    const booking = await prisma.booking.findFirst({ where: { id: payload.bookingId, businessId, customer: { telegramChatId: chatId } }, select: { customerId: true } });
    if (!booking) throw new Error("Booking is unavailable");
    try {
      await rescheduleBooking({ bookingId: payload.bookingId, customerId: booking.customerId, startsAt: new Date(required(payload.startsAt)) }, dependencies.now());
    } catch (error) {
      if (!(error instanceof BookingPolicyError)) throw error;
      await dependencies.sendMessage(chatId, reschedulePolicyText(error, locale));
      return true;
    }
    await dependencies.sendMessage(chatId, locale === "tg" ? "Вақти сабт иваз шуд." : "Запись перенесена на новое время.");
    await renderCustomerBookingCard(businessId, conversationId, chatId, payload.bookingId, dependencies);
    return true;
  }
  return false;
}

/** Names the rule that refused the move, so the customer knows to call rather than tap again. */
function reschedulePolicyText(error: BookingPolicyError, locale: ConversationLocale): string {
  if (error.code === "RESCHEDULE_LIMIT_REACHED") {
    return locale === "tg"
      ? `Ин сабт аллакай ${error.limit ?? 0} бор иваз шудааст. Лутфан бо мо тамос гиред.`
      : `Эту запись уже переносили ${error.limit ?? 0} раз(а). Свяжитесь с бизнесом, если время не подходит.`;
  }
  return locale === "tg"
    ? `Сабтро камтар аз ${error.limit ?? 0} соат пеш аз ташриф иваз кардан мумкин нест. Лутфан бо мо тамос гиред.`
    : `Перенести запись можно не позднее чем за ${error.limit ?? 0} ч до визита. Свяжитесь с бизнесом напрямую.`;
}

function selectedService(businessId: string, data: ConversationData) {
  return prisma.service.findFirstOrThrow({
    where: { id: required(data.serviceId), branch: { id: required(data.branchId), businessId }, staffMembers: data.staffId ? { some: { id: data.staffId } } : undefined },
    select: { id: true, name: true, durationMinutes: true, amountDiram: true, resources: { select: { resourceId: true } } },
  });
}

async function bookingSummary(businessId: string, data: ConversationData, locale: ConversationLocale) {
  const [branch, service, staff] = await Promise.all([
    prisma.branch.findFirstOrThrow({ where: { id: required(data.branchId), businessId }, select: { name: true, timeZone: true } }),
    selectedService(businessId, data),
    prisma.staffMember.findFirstOrThrow({ where: { id: required(data.staffId), businessId }, select: { displayName: true } }),
  ]);
  const visit = new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-RU", { timeZone: branch.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(required(data.startsAt)));
  return `${escapeTelegramHtml(branch.name)}\n${escapeTelegramHtml(service.name)} · ${escapeTelegramHtml(staff.displayName)}\n${visit}\n<b>${escapeTelegramHtml(required(data.name))}</b> · ${escapeTelegramHtml(required(data.phone))}\n<b>${escapeTelegramHtml(formatSomoni(service.amountDiram, locale === "tg" ? "tg-TJ" : "ru-TJ"))}</b>`;
}

function localeOf(data: ConversationData): ConversationLocale {
  return data.locale === "tg" ? "tg" : "ru";
}

function required(value: string | undefined) {
  if (!value) throw new Error("Conversation data is incomplete");
  return value;
}

function normalizeTajikPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `+992${digits}`;
  if (digits.length === 12 && digits.startsWith("992")) return `+${digits}`;
  return value.trim();
}

function nextDates(now: Date, count: number, timeZone: string) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getTime() + index * 24 * 60 * 60_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  });
}

/**
 * Price and duration decide the choice, so they belong on the button rather than on the confirmation
 * screen three taps later — the same pair the web form shows under every service.
 */
function serviceOptionLabel(
  service: { name: string; durationMinutes: number; amountDiram: number },
  locale: ConversationLocale,
) {
  const details = t(locale, "booking.durationAndPrice", {
    minutes: service.durationMinutes,
    price: formatSomoni(service.amountDiram, moneyLocale(locale)),
  });
  return fitButtonText(`${service.name} · ${details}`);
}

/** "пт, 15 авг." — a bare 15.08.2026 makes the customer count out which of the fourteen is Saturday. */
function formatDateLabel(date: string, locale: ConversationLocale) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${date}T12:00:00.000Z`));
}

function formatVisitTime(value: Date, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(value);
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function sessionExpiry(now: Date) {
  return new Date(now.getTime() + SESSION_MINUTES * 60_000);
}
