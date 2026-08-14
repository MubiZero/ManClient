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
import { prisma } from "@/core/database/prisma";
import {
  approvePaymentReview,
  getPaymentReceiptForReview,
  PaymentReviewError,
  rejectPaymentReview,
} from "@/core/payments/payment-review-service";
import {
  botMessage,
  currentStateBookingNotice,
  currentStateNoReceiptNotice,
  currentStatePaymentNotice,
  customerBotStatusLabel,
  mainMenuSummaryText,
  openBookingButtonText,
  openPaymentButtonText,
  paymentRejectedNoticeText,
  paymentsQueueListText,
  resolveBotLocale,
  type BotLocale,
} from "@/integrations/telegram/bot-messages";
import {
  accessDeniedText,
  bookingCardView,
  bookingListView,
  mainMenuView,
  notFoundText,
  paymentReviewView,
  type BusinessBotAction,
  type BusinessBotView,
} from "@/integrations/telegram/business-bot-renderer";
import type { TelegramMessageRef, TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";
import { z } from "zod";

export type BusinessBotPlatformActor = BusinessBotActionActor & {
  membershipId: string;
  role: BusinessRole;
  languageCode?: string | null;
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
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup, parseMode?: "HTML") => Promise<void>;
  answerCallbackQuery: (callbackQueryId: string, text?: string) => Promise<void>;
  editMessageText: (message: TelegramMessageRef, text: string, replyMarkup?: TelegramReplyMarkup, parseMode?: "HTML") => Promise<TelegramMessageRef>;
  sendPhoto?: (chatId: string, photo: Uint8Array, caption?: string, replyMarkup?: TelegramReplyMarkup) => Promise<TelegramMessageRef>;
  loadPaymentReceipt?: typeof getPaymentReceiptForReview;
};

const actionLifetimeMs = 15 * 60_000;

const setLanguagePayloadSchema = z.object({ locale: z.enum(["ru", "tg"]) });

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
  const locale = resolveBotLocale(actor);
  switch (text) {
    case "/start":
    case "/menu":
    case botMessage(locale, "keyboardMainMenu"):
      await showMainMenu(actor, dependencies);
      return;
    case "/today":
    case botMessage(locale, "buttonToday"):
      await showBookingList(actor, { kind: "today" }, null, dependencies);
      return;
    case "/bookings":
    case botMessage(locale, "buttonBookings"):
      await showBookingFilters(actor, dependencies);
      return;
    case "/checks":
    case botMessage(locale, "keyboardCheckReceipts"):
      await showChecks(actor, dependencies);
      return;
    case botMessage(locale, "keyboardCustomerLink"):
      await showCustomerLink(actor, dependencies);
      return;
    case "/language":
    case botMessage(locale, "keyboardLanguage"):
      await showLanguagePicker(actor, dependencies);
      return;
    case "/help":
    case botMessage(locale, "keyboardMore"):
    case botMessage(locale, "keyboardHelp"):
      await showHelp(actor, dependencies);
      return;
    default:
      // A manager typing a customer's name expects a search; silently answering with help reads as the
      // bot ignoring them, so say the text was not understood and put the menu back in reach.
      await showMainMenu(actor, dependencies, undefined, botMessage(locale, "unknownCommandText"));
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
      const locale = resolveBotLocale(actor);
      try {
        const result = await approvePaymentReview({ businessId: actor.businessId, actorUserId: actor.userId, paymentId, submissionId }, dependencies.now());
        await showPaymentReviewCard(
          actor,
          paymentId,
          dependencies,
          callback.message,
          result.changed ? botMessage(locale, "paymentApproved") : botMessage(locale, "paymentAlreadyApproved"),
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
      const locale = resolveBotLocale(actor);
      try {
        const result = await rejectPaymentReview({ businessId: actor.businessId, actorUserId: actor.userId, paymentId, submissionId, reason }, dependencies.now());
        await showPaymentReviewCard(
          actor,
          paymentId,
          dependencies,
          callback.message,
          result.changed ? botMessage(locale, "paymentRejected") : botMessage(locale, "paymentAlreadyRejected"),
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
        await showBookingCard(actor, bookingId, dependencies, callback.message, botMessage(resolveBotLocale(actor), "bookingConfirmedManual"));
      } catch (error) {
        await showBookingOperationError(actor, bookingId, error, callback.message, dependencies);
      }
      return;
    }
    case "BOOKING_REMIND_PAYMENT": {
      const bookingId = stringValue(action.payload.bookingId);
      if (!bookingId) return showStaleAction(actor, callback.message, dependencies);
      const locale = resolveBotLocale(actor);
      try {
        const result = await remindBusinessBookingPayment({ businessId: actor.businessId, actorUserId: actor.userId, bookingId }, dependencies.now());
        await showBookingCard(
          actor,
          bookingId,
          dependencies,
          callback.message,
          result.scheduled ? botMessage(locale, "reminderScheduled") : botMessage(locale, "reminderAlreadyScheduled"),
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
          await showBookingCard(actor, bookingId, dependencies, callback.message, botMessage(resolveBotLocale(actor), "bookingRescheduled"));
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
        await showBookingCard(actor, bookingId, dependencies, callback.message, botMessage(resolveBotLocale(actor), "bookingCancelled"));
      } catch (error) {
        await showBookingOperationError(actor, bookingId, error, callback.message, dependencies);
      }
      return;
    }
    case "SET_LANGUAGE": {
      const parsed = setLanguagePayloadSchema.safeParse(action.payload);
      if (!parsed.success) return showStaleAction(actor, callback.message, dependencies);
      await prisma.membership.update({ where: { id: actor.membershipId }, data: { languageCode: parsed.data.locale } });
      const nextActor: BusinessBotPlatformActor = { ...actor, languageCode: parsed.data.locale };
      await showMainMenu(nextActor, dependencies, callback.message);
      return;
    }
    default:
      await showStaleAction(actor, callback.message, dependencies);
  }
}

async function showMainMenu(
  actor: BusinessBotPlatformActor,
  dependencies: BusinessBotHandlerDependencies,
  message?: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  notice?: string,
) {
  const locale = resolveBotLocale(actor);
  const summary = await getBusinessBotSummary(actor, dependencies.now());
  const base = mainMenuView({ role: actor.role, locale });
  const keyboard = base.replyMarkup && "keyboard" in base.replyMarkup ? base.replyMarkup.keyboard : [];
  const customerBotLabel = customerBotStatusLabel(locale, summary.customerBotStatus === "ACTIVE" ? "ACTIVE" : "INACTIVE", summary.customerBotUsername);
  const summaryText = mainMenuSummaryText(locale, {
    businessName: actor.business.name,
    todayCount: summary.todayCount,
    pendingPaymentCount: summary.pendingPaymentCount,
    needsAttentionCount: actor.role === "STAFF" ? null : summary.needsAttentionCount,
    customerBotLabel,
  });
  const text = notice ? `${notice}\n\n${summaryText}` : summaryText;
  const replyMarkup: TelegramReplyMarkup = {
    keyboard: [
      ...keyboard,
      ...(actor.role !== "STAFF" && actor.destination.chatType === "private" && summary.customerBotStatus !== "ACTIVE"
        ? [[{ text: botMessage(locale, "keyboardCreateCustomerBot") }]]
        : []),
      [{ text: botMessage(locale, "keyboardCustomerLink") }, { text: botMessage(locale, "keyboardMore") }],
    ],
    resize_keyboard: true,
  };
  if (message) {
    try {
      await dependencies.editMessageText({ chatId: String(message.chat.id), messageId: message.message_id }, text, replyMarkup);
      return;
    } catch {
      // fall through to a fresh message
    }
  }
  await dependencies.sendMessage(actor.destination.chatId, text, replyMarkup);
}

async function showLanguagePicker(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  const locale = resolveBotLocale(actor);
  const [ruAction, tgAction] = await Promise.all([
    mutationAction(actor, "SET_LANGUAGE", { locale: "ru" }, botMessage(locale, "languageButtonRu"), dependencies.now()),
    mutationAction(actor, "SET_LANGUAGE", { locale: "tg" }, botMessage(locale, "languageButtonTg"), dependencies.now()),
  ]);
  await dependencies.sendMessage(actor.destination.chatId, botMessage(locale, "languagePrompt"), inlineView([[ruAction, tgAction]]));
}

async function showBookingFilters(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  const locale = resolveBotLocale(actor);
  const [today, upcoming, pending, menu] = await Promise.all([
    navigationAction(actor, "bookings.list", { filter: "today" }, botMessage(locale, "buttonToday"), dependencies.now()),
    navigationAction(actor, "bookings.list", { filter: "upcoming" }, botMessage(locale, "buttonUpcoming"), dependencies.now()),
    navigationAction(actor, "bookings.list", { filter: "pending" }, botMessage(locale, "buttonPending"), dependencies.now()),
    navigationAction(actor, "menu.open", {}, botMessage(locale, "keyboardMainMenu"), dependencies.now()),
  ]);
  await dependencies.sendMessage(actor.destination.chatId, botMessage(locale, "bookingsFilterPrompt"), inlineView([[today, upcoming], [pending], [menu]]));
}

async function showBookingList(
  actor: BusinessBotPlatformActor,
  filter: BusinessBotBookingFilter,
  cursor: string | null,
  dependencies: BusinessBotHandlerDependencies,
  message?: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
) {
  const locale = resolveBotLocale(actor);
  const result = await listBusinessBotBookings(actor, filter, cursor, dependencies.now());
  const actions = await Promise.all(result.items.map((booking) => navigationAction(
    actor,
    "booking.open",
    { bookingId: booking.id },
    openBookingButtonText(formatVisitStamp(booking.startsAt, booking.branch.timeZone, locale), booking.customer.name),
    dependencies.now(),
  )));
  const view = bookingListView({
    title: titleForFilter(filter.kind, locale),
    locale,
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
      botMessage(locale, "buttonShowMore"),
      dependencies.now(),
    ));
  }
  navigation.push(
    await navigationAction(actor, "bookings.list", { filter: filter.kind }, botMessage(locale, "buttonRefresh"), dependencies.now()),
    await navigationAction(actor, "menu.open", {}, botMessage(locale, "keyboardMainMenu"), dependencies.now()),
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
  const locale = resolveBotLocale(actor);
  try {
    const booking = await getBusinessBotBooking(actor, bookingId);
    const actions = await Promise.all([
      ...(booking.status === "PENDING_PAYMENT" ? [
        mutationAction(actor, "BOOKING_CONFIRM", { bookingId }, botMessage(locale, "buttonConfirmBooking"), dependencies.now()),
      ] : []),
      ...(booking.status === "PENDING_PAYMENT" && booking.payment?.status === "PENDING" && booking.customer.telegramChatId ? [
        mutationAction(actor, "BOOKING_REMIND_PAYMENT", { bookingId }, botMessage(locale, "buttonRemindPayment"), dependencies.now()),
      ] : []),
      ...(["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status) ? [
        navigationAction(actor, "BOOKING_RESCHEDULE_DATE", { bookingId }, botMessage(locale, "buttonReschedule"), dependencies.now()),
        navigationAction(actor, "BOOKING_CANCEL_BEGIN", { bookingId }, botMessage(locale, "buttonCancelBooking"), dependencies.now()),
      ] : []),
      navigationAction(actor, "BOOKING_REFRESH", { bookingId }, botMessage(locale, "buttonRefresh"), dependencies.now()),
      navigationAction(actor, "menu.open", {}, botMessage(locale, "keyboardMainMenu"), dependencies.now()),
    ]);
    const view = bookingCardView({
      locale,
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
  const locale = resolveBotLocale(actor);
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
      formatDate(item.date, booking.branch.timeZone, locale),
      dependencies.now(),
    )));
    const back = await navigationAction(actor, "BOOKING_REFRESH", { bookingId }, botMessage(locale, "buttonBack"), dependencies.now());
    await deliver({
      text: actions.length
        ? botMessage(locale, "rescheduleDatesPrompt")
        : botMessage(locale, "rescheduleDatesEmpty"),
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
  const locale = resolveBotLocale(actor);
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
      formatTime(startsAt, options.timeZone, locale),
      dependencies.now(),
    )));
    const back = await navigationAction(actor, "BOOKING_RESCHEDULE_DATE", { bookingId }, botMessage(locale, "buttonBackToDates"), dependencies.now());
    await deliver({
      text: actions.length
        ? botMessage(locale, "rescheduleSlotsPrompt")
        : botMessage(locale, "rescheduleSlotsEmpty"),
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
  const locale = resolveBotLocale(actor);
  try {
    await getBusinessBotBooking(actor, bookingId);
    const reasons = [botMessage(locale, "cancellationReasonCustomer"), botMessage(locale, "cancellationReasonUnreachable")];
    const actions = await Promise.all(reasons.map(reason => mutationAction(
      actor,
      "BOOKING_CANCEL_REASON",
      { bookingId, reason },
      reason,
      dependencies.now(),
    )));
    const back = await navigationAction(actor, "BOOKING_REFRESH", { bookingId }, botMessage(locale, "buttonBack"), dependencies.now());
    await deliver({
      text: botMessage(locale, "cancellationConfirmPrompt"),
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
  const locale = resolveBotLocale(actor);
  if (!(error instanceof BookingOperationError)) {
    await showStaleAction(actor, message, dependencies);
    return;
  }
  const refresh = await navigationAction(actor, "BOOKING_REFRESH", { bookingId }, botMessage(locale, "buttonRefresh"), dependencies.now());
  const menu = await navigationAction(actor, "menu.open", {}, botMessage(locale, "keyboardMainMenu"), dependencies.now());
  const text = {
    FORBIDDEN: accessDeniedText(locale === "tg" ? "ин сабт" : "этой записи", locale),
    NOT_FOUND: notFoundText(locale === "tg" ? "Сабт" : "Запись", true, locale),
    INVALID_STATUS: botMessage(locale, "invalidStatusText"),
    SLOT_UNAVAILABLE: botMessage(locale, "slotUnavailableText"),
    INVALID_INPUT: botMessage(locale, "invalidInputText"),
    CUSTOMER_TELEGRAM_UNAVAILABLE: botMessage(locale, "customerTelegramUnavailableText"),
  }[error.code];
  await deliver({ text, replyMarkup: inlineView([[refresh, menu]]) }, actor, dependencies, message);
}

async function showStaleAction(
  actor: BusinessBotPlatformActor,
  message: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
  dependencies: BusinessBotHandlerDependencies,
) {
  const locale = resolveBotLocale(actor);
  const [refresh, menu] = await Promise.all([
    navigationAction(actor, "menu.open", {}, botMessage(locale, "buttonRefresh"), dependencies.now()),
    navigationAction(actor, "menu.open", {}, botMessage(locale, "keyboardMainMenu"), dependencies.now()),
  ]);
  await deliver({
    text: botMessage(locale, "staleActionText"),
    replyMarkup: inlineView([[refresh, menu]]),
  }, actor, dependencies, message);
}

async function showPaymentReviewList(
  actor: BusinessBotPlatformActor,
  cursor: string | null,
  dependencies: BusinessBotHandlerDependencies,
  message?: NonNullable<BusinessBotUpdate["callback_query"]>["message"],
) {
  const locale = resolveBotLocale(actor);
  try {
    const result = await listBusinessBotPaymentReviews(actor, cursor);
    const openActions = await Promise.all(result.items.map(payment => navigationAction(
      actor,
      "payment.open",
      { paymentId: payment.id },
      openPaymentButtonText(locale, payment.booking.customer.name),
      dependencies.now(),
    )));
    const navigation: BusinessBotAction[] = [];
    if (result.nextCursor) {
      navigation.push(await navigationAction(
        actor,
        "payments.list",
        { cursor: result.nextCursor },
        botMessage(locale, "buttonShowMore"),
        dependencies.now(),
      ));
    }
    navigation.push(
      await navigationAction(actor, "payments.list", {}, botMessage(locale, "buttonRefresh"), dependencies.now()),
      await navigationAction(actor, "menu.open", {}, botMessage(locale, "keyboardMainMenu"), dependencies.now()),
    );
    const text = result.items.length
      ? paymentsQueueListText(locale, result.items.map((payment, index) => ({
        index: index + 1,
        customerName: payment.booking.customer.name,
        serviceName: payment.booking.service.name,
        amount: formatSomoni(payment.amountDiram, locale === "tg" ? "tg-TJ" : "ru-TJ"),
        attentionReason: attentionReasonLabel(payment.attentionReason, locale),
      })))
      : botMessage(locale, "paymentsQueueEmpty");
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
  const locale = resolveBotLocale(actor);
  try {
    const payment = await getBusinessBotPaymentReview(actor, paymentId);
    const actions: BusinessBotAction[] = [];
    if (isPaymentReviewActionable(payment)) {
      if (payment.hasReceipt) {
        actions.push(await navigationAction(actor, "PAYMENT_RECEIPT", { paymentId, submissionId: payment.submissionId! }, botMessage(locale, "buttonShowReceipt"), dependencies.now()));
      }
      actions.push(
        await navigationAction(actor, "PAYMENT_APPROVE_BEGIN", { paymentId, submissionId: payment.submissionId! }, botMessage(locale, "buttonApprovePayment"), dependencies.now()),
        await navigationAction(actor, "PAYMENT_REJECT_BEGIN", { paymentId, submissionId: payment.submissionId! }, botMessage(locale, "buttonRejectReceipt"), dependencies.now()),
      );
    }
    actions.push(
      await navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, botMessage(locale, "buttonRefresh"), dependencies.now()),
      await navigationAction(actor, "payments.list", {}, botMessage(locale, "buttonBackToQueue"), dependencies.now()),
      await navigationAction(actor, "menu.open", {}, botMessage(locale, "keyboardMainMenu"), dependencies.now()),
    );
    const base = paymentReviewView({
      locale,
      customerName: payment.booking.customer.name,
      serviceName: payment.booking.service.name,
      startsAt: payment.booking.startsAt,
      timeZone: payment.booking.branch.timeZone,
      amountDiram: payment.amountDiram,
      recipientCardLast4: payment.recipientCardLast4 ?? undefined,
      attentionReason: payment.attentionReason ? attentionReasonLabel(payment.attentionReason, locale) : undefined,
    });
    const statusNotice = [...new Set([notice, paymentDecisionNotice(payment, locale)].filter((value): value is string => Boolean(value)))].join("\n");
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
  const locale = resolveBotLocale(actor);
  try {
    const payment = await getBusinessBotPaymentReview(actor, paymentId);
    if (!dependencies.sendPhoto) {
      await deliver({ text: botMessage(locale, "receiptPhotoUnavailable") }, actor, dependencies, message);
      return;
    }
    const receipt = await (dependencies.loadPaymentReceipt ?? getPaymentReceiptForReview)({
      businessId: actor.businessId,
      actorUserId: actor.userId,
      paymentId,
      submissionId,
    });
    const back = await navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, botMessage(locale, "buttonBackToReview"), dependencies.now());
    const caption = paymentReviewView({
      locale,
      customerName: payment.booking.customer.name,
      serviceName: payment.booking.service.name,
      startsAt: payment.booking.startsAt,
      timeZone: payment.booking.branch.timeZone,
      amountDiram: payment.amountDiram,
      recipientCardLast4: payment.recipientCardLast4 ?? undefined,
      attentionReason: payment.attentionReason ? attentionReasonLabel(payment.attentionReason, locale) : undefined,
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
  const locale = resolveBotLocale(actor);
  try {
    const payment = await getBusinessBotPaymentReview(actor, paymentId);
    if (!isPaymentReviewActionable(payment)) {
      await showPaymentReviewCard(actor, paymentId, dependencies, message);
      return;
    }
    if (payment.submissionId !== submissionId) {
      await showPaymentReviewCard(actor, paymentId, dependencies, message, botMessage(locale, "reviewStateChanged"));
      return;
    }
    const [confirmAction, dismissAction] = await Promise.all([
      mutationAction(actor, "PAYMENT_APPROVE_CONFIRM", { paymentId, submissionId }, botMessage(locale, "buttonConfirmYes"), dependencies.now()),
      navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, botMessage(locale, "buttonBack"), dependencies.now()),
    ]);
    await deliver(paymentReviewView({
      locale,
      customerName: payment.booking.customer.name,
      serviceName: payment.booking.service.name,
      startsAt: payment.booking.startsAt,
      timeZone: payment.booking.branch.timeZone,
      amountDiram: payment.amountDiram,
      recipientCardLast4: payment.recipientCardLast4 ?? undefined,
      attentionReason: payment.attentionReason ? attentionReasonLabel(payment.attentionReason, locale) : undefined,
      confirmation: {
        text: botMessage(locale, "approvalConfirmPrompt"),
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
  const locale = resolveBotLocale(actor);
  try {
    const payment = await getBusinessBotPaymentReview(actor, paymentId);
    if (!isPaymentReviewActionable(payment)) {
      await showPaymentReviewCard(actor, paymentId, dependencies, message);
      return;
    }
    if (payment.submissionId !== submissionId) {
      await showPaymentReviewCard(actor, paymentId, dependencies, message, botMessage(locale, "reviewStateChanged"));
      return;
    }
    const reasons = [
      botMessage(locale, "rejectionReasonAmount"),
      botMessage(locale, "rejectionReasonRecipient"),
      botMessage(locale, "rejectionReasonBank"),
    ];
    const actions = await Promise.all(reasons.map(reason => mutationAction(
      actor,
      "PAYMENT_REJECT_REASON",
      { paymentId, submissionId, reason },
      reason,
      dependencies.now(),
    )));
    const back = await navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, botMessage(locale, "buttonBack"), dependencies.now());
    await deliver({
      text: botMessage(locale, "rejectionConfirmPrompt"),
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
  const locale = resolveBotLocale(actor);
  if (!(error instanceof PaymentReviewError)) {
    await showStaleAction(actor, message, dependencies);
    return;
  }
  if (error.code === "INVALID_STATUS" && paymentId) {
    await showPaymentReviewCard(actor, paymentId, dependencies, message, botMessage(locale, "reviewStateStale"));
    return;
  }
  const actions = [
    ...(paymentId ? [await navigationAction(actor, "PAYMENT_REFRESH", { paymentId }, botMessage(locale, "buttonRefresh"), dependencies.now())] : []),
    await navigationAction(actor, "menu.open", {}, botMessage(locale, "keyboardMainMenu"), dependencies.now()),
  ];
  const text = {
    FORBIDDEN: accessDeniedText(locale === "tg" ? "санҷиши чекҳо" : "проверке чеков", locale),
    NOT_FOUND: notFoundText(locale === "tg" ? "Чек" : "Чек", false, locale),
    INVALID_STATUS: botMessage(locale, "paymentInvalidStatusText"),
    INVALID_INPUT: botMessage(locale, "paymentInvalidInputText"),
  }[error.code];
  await deliver({ text, replyMarkup: inlineView([actions]) }, actor, dependencies, message);
}

async function showChecks(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  const locale = resolveBotLocale(actor);
  if (actor.role === "STAFF") {
    await dependencies.sendMessage(actor.destination.chatId, botMessage(locale, "checksAccessDenied"));
    return;
  }
  await showPaymentReviewList(actor, null, dependencies);
}

function attentionReasonLabel(reason: string | null, locale: BotLocale) {
  const map = {
    AMOUNT_MISMATCH: botMessage(locale, "attentionAmountMismatch"),
    RECIPIENT_MISMATCH: botMessage(locale, "attentionRecipientMismatch"),
    OPERATION_TIME_MISMATCH: botMessage(locale, "attentionOperationTimeMismatch"),
    RECEIPT_NOT_SUCCESSFUL: botMessage(locale, "attentionReceiptNotSuccessful"),
    BOOKING_NOT_PENDING: botMessage(locale, "attentionBookingNotPending"),
    OCR_FAILED: botMessage(locale, "attentionOcrFailed"),
    OCR_UNRELIABLE: botMessage(locale, "attentionOcrFailed"),
    RECEIPT_MISMATCH: botMessage(locale, "attentionReceiptMismatch"),
    DUPLICATE_OPERATION: botMessage(locale, "attentionDuplicateOperation"),
  } as Record<string, string>;
  return map[reason ?? ""] ?? botMessage(locale, "attentionNeedsManualReview");
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
}, locale: BotLocale) {
  if (payment.status === "RECEIPT_ACCEPTED") return botMessage(locale, "paymentApproved");
  if (payment.status === "REJECTED") return paymentRejectedNoticeText(locale, payment.reviewReason);
  if (payment.booking.status !== "PENDING_PAYMENT") {
    return currentStateBookingNotice(locale, bookingReviewStatusLabel(payment.booking.status, locale), paymentReviewStatusLabel(payment.status, locale));
  }
  if (payment.status === "NEEDS_ATTENTION" && !payment.hasReceipt) {
    return currentStateNoReceiptNotice(locale);
  }
  if (payment.status !== "NEEDS_ATTENTION") {
    return currentStatePaymentNotice(locale, paymentReviewStatusLabel(payment.status, locale));
  }
  return null;
}

function bookingReviewStatusLabel(status: string, locale: BotLocale) {
  const map = {
    PENDING_PAYMENT: botMessage(locale, "bookingStatusPendingPayment"),
    CONFIRMED: botMessage(locale, "bookingStatusConfirmed"),
    CANCELLED: botMessage(locale, "bookingStatusCancelled"),
    EXPIRED: botMessage(locale, "bookingStatusExpired"),
  } as Record<string, string>;
  return map[status] ?? botMessage(locale, "bookingStatusChanged");
}

function paymentReviewStatusLabel(status: string, locale: BotLocale) {
  const map = {
    PENDING: botMessage(locale, "paymentStatusPending"),
    RECEIPT_PROCESSING: botMessage(locale, "paymentStatusProcessing"),
    NEEDS_ATTENTION: botMessage(locale, "paymentStatusNeedsAttention"),
    RECEIPT_ACCEPTED: botMessage(locale, "paymentStatusAccepted"),
    REJECTED: botMessage(locale, "paymentStatusRejected"),
  } as Record<string, string>;
  return map[status] ?? botMessage(locale, "paymentStatusChanged");
}

async function showCustomerLink(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  const locale = resolveBotLocale(actor);
  const slug = actor.business.slug;
  const url = slug ? `${requiredAppUrl()}/b/${encodeURIComponent(slug)}` : requiredAppUrl();
  await dependencies.sendMessage(actor.destination.chatId, botMessage(locale, "customerLinkPrompt"), {
    inline_keyboard: [[{ text: botMessage(locale, "customerLinkButton"), url }]],
  });
}

async function showHelp(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies) {
  const locale = resolveBotLocale(actor);
  await dependencies.sendMessage(actor.destination.chatId, botMessage(locale, "helpText"));
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
        view.parseMode,
      );
      return;
    } catch {
      // Telegram can reject edits for old or unchanged messages; sending keeps navigation usable.
    }
  }
  await dependencies.sendMessage(actor.destination.chatId, view.text, view.replyMarkup, view.parseMode);
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

function titleForFilter(filter: BusinessBotBookingFilter["kind"], locale: BotLocale) {
  switch (filter) {
    case "today": return botMessage(locale, "titleTodayBookings");
    case "pending": return botMessage(locale, "titlePendingBookings");
    case "upcoming": return botMessage(locale, "titleUpcomingBookings");
  }
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string, timeZone: string, locale: BotLocale) {
  return new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-RU", { timeZone, day: "numeric", month: "short", weekday: "short" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function formatTime(value: Date, timeZone: string, locale: BotLocale) {
  return new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(value);
}

/** Day and time without the year: the lists never reach beyond the coming weeks. */
function formatVisitStamp(value: Date, timeZone: string, locale: BotLocale) {
  return new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-RU", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function pairRows(actions: BusinessBotAction[]) {
  return Array.from({ length: Math.ceil(actions.length / 2) }, (_, index) => actions.slice(index * 2, index * 2 + 2));
}

function requiredAppUrl() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required");
  return appUrl.replace(/\/$/, "");
}
