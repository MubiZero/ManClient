import { createPendingBooking } from "@/core/bookings/booking-service";
import {
  conversationMessage,
  getActiveConversationSession,
  handleConversationCommand,
  openConversation,
  restartConversation,
} from "@/core/conversations/conversation-engine";
import { consumeConversationAction, createConversationAction } from "@/core/conversations/conversation-actions";
import type { ConversationData, ConversationLocale, ConversationStateName } from "@/core/conversations/conversation-state";
import { getAvailableStarts } from "@/core/availability/availability-service";
import { prisma } from "@/core/database/prisma";
import { assertPaymentCardConfigured, getPaymentUrl } from "@/core/payments/payment-service";
import type { ReceiptRecognizer } from "@/core/payments/receipt-recognizer";
import { contactKeyboard, inlineButtons } from "@/integrations/telegram/conversation-renderer";
import type { TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";
import type { BusinessTelegramContext, BusinessTelegramUpdate } from "@/integrations/telegram/business-update-dispatcher";
import { handleTelegramUpdate } from "@/integrations/telegram/update-handler";

export type BusinessTelegramHandlerDependencies = {
  now: () => Date;
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) => Promise<void>;
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

  const conversation = await openConversation({
    businessId: context.businessId,
    integrationId: context.integrationId,
    channel: "TELEGRAM",
    externalChatId: chatId,
    expiresAt: sessionExpiry(dependencies.now()),
  });

  if (update.message?.text?.trim() === "/start") {
    await restartConversation(context.businessId, conversation.id, sessionExpiry(dependencies.now()));
    await renderState(context.businessId, conversation.id, chatId, dependencies);
    return;
  }

  if (update.callback_query?.data) {
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
    await handleTelegramUpdate(context.businessId, update, dependencies);
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
    let payload = action.payload;
    if (action.kind === "CONFIRM_BOOKING") {
      payload = await createBookingForConversation(businessId, conversationId, chatId, dependencies.now());
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
  if (session.state === "BRANCH") {
    const branches = await prisma.branch.findMany({ where: { businessId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    await sendOptions(chatId, locale, "BRANCH", branches.map(branch => ({ text: branch.name, kind: "SELECT_BRANCH", payload: { branchId: branch.id } })), businessId, conversationId, expiresAt, dependencies);
    return;
  }
  if (session.state === "SERVICE") {
    const services = await prisma.service.findMany({ where: { branch: { id: session.data.branchId, businessId } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    await sendOptions(chatId, locale, "SERVICE", services.map(service => ({ text: service.name, kind: "SELECT_SERVICE", payload: { serviceId: service.id } })), businessId, conversationId, expiresAt, dependencies);
    return;
  }
  if (session.state === "STAFF") {
    const staff = await prisma.staffMember.findMany({ where: { businessId, archivedAt: null, branches: { some: { branchId: session.data.branchId } }, services: { some: { id: session.data.serviceId } } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } });
    await sendOptions(chatId, locale, "STAFF", staff.map(member => ({ text: member.displayName, kind: "SELECT_STAFF", payload: { staffId: member.id } })), businessId, conversationId, expiresAt, dependencies);
    return;
  }
  if (session.state === "DATE") {
    const dates = nextDates(dependencies.now(), 14);
    await sendOptions(chatId, locale, "DATE", dates.map(date => ({ text: formatDateLabel(date), kind: "SELECT_DATE", payload: { date } })), businessId, conversationId, expiresAt, dependencies);
    return;
  }
  if (session.state === "SLOT") {
    const service = await selectedService(businessId, session.data);
    const rangeStartsAt = new Date(`${required(session.data.date)}T00:00:00+05:00`);
    const starts = await getAvailableStarts({
      branchId: required(session.data.branchId),
      serviceId: required(session.data.serviceId),
      staffId: required(session.data.staffId),
      resourceIds: service.resources.map(({ resourceId }) => resourceId),
      rangeStartsAt,
      rangeEndsAt: new Date(rangeStartsAt.getTime() + 24 * 60 * 60_000),
      durationMinutes: service.durationMinutes,
      intervalMinutes: 30,
    });
    await sendOptions(chatId, locale, "SLOT", starts.map(startsAt => ({ text: formatVisitTime(startsAt), kind: "SELECT_SLOT", payload: { startsAt: startsAt.toISOString() } })), businessId, conversationId, expiresAt, dependencies);
    return;
  }
  if (session.state === "CUSTOMER_PHONE") {
    await dependencies.sendMessage(chatId, conversationMessage(locale, session.state), contactKeyboard(locale));
    return;
  }
  if (session.state === "CONFIRM") {
    const details = await bookingSummary(businessId, session.data, locale);
    const actions = await actionButtons(businessId, conversationId, expiresAt, [{
      text: locale === "tg" ? "Сабтро тасдиқ кунед" : "Подтвердить запись",
      kind: "CONFIRM_BOOKING",
      payload: {},
    }]);
    await dependencies.sendMessage(chatId, `${conversationMessage(locale, "CONFIRM")}\n\n${details}`, inlineButtons(actions));
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
  await dependencies.sendMessage(chatId, conversationMessage(locale, session.state));
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
) {
  if (options.length === 0) {
    await dependencies.sendMessage(chatId, locale === "tg" ? "Ҳоло интихоби дастрас нест. /start-ро фиристед." : "Сейчас нет доступных вариантов. Отправьте /start.");
    return;
  }
  await dependencies.sendMessage(chatId, conversationMessage(locale, state), inlineButtons(await actionButtons(businessId, conversationId, expiresAt, options)));
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
  await assertPaymentCardConfigured(required(session.data.branchId));
  const booking = await createPendingBooking({
    businessSlug: business.slug,
    branchId: required(session.data.branchId),
    serviceId: required(session.data.serviceId),
    staffId: required(session.data.staffId),
    resourceIds: service.resources.map(({ resourceId }) => resourceId),
    startsAt: new Date(required(session.data.startsAt)),
    customer: { name: required(session.data.name), phone: required(session.data.phone) },
  }, now);
  const stored = await prisma.booking.findFirstOrThrow({ where: { id: booking.bookingId, businessId }, select: { customerId: true } });
  await prisma.customer.update({ where: { id: stored.customerId }, data: { telegramChatId: chatId } });
  return { bookingId: booking.bookingId, paymentId: booking.paymentId };
}

function selectedService(businessId: string, data: ConversationData) {
  return prisma.service.findFirstOrThrow({
    where: { id: required(data.serviceId), branch: { id: required(data.branchId), businessId }, staffMembers: data.staffId ? { some: { id: data.staffId } } : undefined },
    select: { id: true, name: true, durationMinutes: true, amountDiram: true, resources: { select: { resourceId: true } } },
  });
}

async function bookingSummary(businessId: string, data: ConversationData, locale: ConversationLocale) {
  const [branch, service, staff] = await Promise.all([
    prisma.branch.findFirstOrThrow({ where: { id: required(data.branchId), businessId }, select: { name: true } }),
    selectedService(businessId, data),
    prisma.staffMember.findFirstOrThrow({ where: { id: required(data.staffId), businessId }, select: { displayName: true } }),
  ]);
  const visit = new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-RU", { timeZone: "Asia/Dushanbe", dateStyle: "medium", timeStyle: "short" }).format(new Date(required(data.startsAt)));
  return `${branch.name}\n${service.name} · ${staff.displayName}\n${visit}\n${required(data.name)} · ${required(data.phone)}\n${(service.amountDiram / 100).toFixed(2)} TJS`;
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

function nextDates(now: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getTime() + index * 24 * 60 * 60_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dushanbe", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  });
}

function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function formatVisitTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dushanbe", hour: "2-digit", minute: "2-digit" }).format(value);
}

function sessionExpiry(now: Date) {
  return new Date(now.getTime() + SESSION_MINUTES * 60_000);
}
