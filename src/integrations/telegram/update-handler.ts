import {
  createCustomerBookingToken,
  verifyBookingActionToken,
  verifyCustomerBookingToken,
} from "@/core/bookings/booking-action-token";
import { cancelBooking } from "@/core/bookings/cancel-booking";
import { prisma } from "@/core/database/prisma";
import { recognizeDushanbeCityReceipt } from "@/core/payments/dushanbe-city-receipt-recognizer";
import { submitReceiptImage } from "@/core/payments/receipt-submission-service";
import { storeReceipt } from "@/core/payments/receipt-storage";
import { downloadTelegramPhoto, sendTelegramMessage, type TelegramReplyMarkup } from "@/integrations/telegram/telegram-client";

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
    photo?: Array<{ file_id: string }>;
  };
  callback_query?: { data?: string; message?: { chat: { id: number } } };
};

type HandlerDependencies = {
  now: () => Date;
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) => Promise<void>;
  downloadPhoto: (fileId: string) => Promise<Uint8Array>;
  storeReceipt: (input: { storageKey: string; contentType: string; body: Uint8Array }) => Promise<string>;
  recognizeReceipt: typeof recognizeDushanbeCityReceipt;
};

const defaultDependencies: HandlerDependencies = {
  now: () => new Date(),
  sendMessage: sendTelegramMessage,
  downloadPhoto: downloadTelegramPhoto,
  storeReceipt,
  recognizeReceipt: recognizeDushanbeCityReceipt,
};

export async function handleTelegramUpdate(businessId: string, update: TelegramUpdate, dependencies: HandlerDependencies = defaultDependencies, expectedPaymentId?: string): Promise<void> {
  const message = update.message;
  if (update.callback_query?.data?.startsWith("c.") && update.callback_query.message) {
    const chatId = String(update.callback_query.message.chat.id);
    try {
      const token = update.callback_query.data;
      const action = verifyCustomerBookingToken(token, "cancel_booking", dependencies.now());
      const booking = await prisma.booking.findFirstOrThrow({
        where: { id: action.bookingId, businessId, customer: { telegramChatId: chatId } },
        select: { customerId: true },
      });
      await cancelBooking({ bookingId: action.bookingId, actor: { type: "customer", customerId: booking.customerId } }, dependencies.now());
      await dependencies.sendMessage(chatId, "Запись отменена. Освободившееся время снова доступно.");
    } catch {
      await dependencies.sendMessage(chatId, "Не удалось отменить запись по этой кнопке. Возможно, ссылка истекла.");
    }
    return;
  }
  if (!message) return;
  const chatId = String(message.chat.id);

  if (message.text?.startsWith("/start ")) {
    const token = message.text.slice(7).trim();
    try {
      const action = verifyBookingActionToken(token, dependencies.now(), "link_payment");
      const payment = await prisma.payment.findFirst({ where: { id: action.paymentId, businessId }, include: { booking: true } });
      if (!payment || payment.booking.status !== "PENDING_PAYMENT") throw new Error("Payment is unavailable");
      await prisma.customer.update({ where: { id: payment.booking.customerId }, data: { telegramChatId: chatId } });
      await dependencies.sendMessage(chatId, "После оплаты отправьте чек DushanbeCity сюда одним изображением.");
    } catch {
      await dependencies.sendMessage(chatId, "Ссылка на запись истекла или недействительна. Создайте запись заново на странице бизнеса.");
    }
    return;
  }

  if (!message.photo?.length) {
    await dependencies.sendMessage(chatId, "Откройте ссылку из записи, затем отправьте чек DushanbeCity изображением.");
    return;
  }

  if (!expectedPaymentId) {
    await dependencies.sendMessage(chatId, "Не выбрана запись для этого чека. Откройте нужную запись, нажмите «Я оплатил» и отправьте изображение снова.");
    return;
  }

  const payment = await prisma.payment.findFirst({
    where: {
      businessId,
      id: expectedPaymentId,
      status: { in: ["PENDING", "NEEDS_ATTENTION"] },
      booking: { status: "PENDING_PAYMENT", customer: { telegramChatId: chatId } },
    },
    include: { booking: true },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) {
    await dependencies.sendMessage(chatId, "Не найдена запись, ожидающая оплату. Откройте ссылку из новой записи и повторите отправку.");
    return;
  }

  const photo = message.photo.at(-1)!;
  try {
    const image = await dependencies.downloadPhoto(photo.file_id);
    try {
      await dependencies.sendMessage(chatId, "Чек получен. Проверяем изображение и реквизиты оплаты.");
    } catch {
      // Receipt processing must not depend on delivery of immediate feedback.
    }
    await submitReceiptImage({ paymentId: payment.id, bytes: image, contentType: "image/jpeg", channel: "telegram" }, dependencies.now(), {
      store: dependencies.storeReceipt,
      recognize: dependencies.recognizeReceipt,
    });
  } catch {
    await dependencies.sendMessage(chatId, "Не удалось сохранить или прочитать изображение. Проверьте, что это чек JPG, PNG или WEBP, и отправьте его ещё раз.");
    return;
  }

  const current = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { status: true } });
  if (current.status !== "RECEIPT_ACCEPTED") {
    await dependencies.sendMessage(chatId, "Чек получен и передан администратору на проверку. Запись пока ожидает подтверждения.");
    return;
  }

  await deliverTelegramConfirmation(payment.booking.id, payment.businessId, chatId, dependencies);
}

async function deliverTelegramConfirmation(bookingId: string, businessId: string, chatId: string, dependencies: HandlerDependencies) {
  const message = await prisma.message.upsert({
    where: { bookingId_channel_kind: { bookingId, channel: "TELEGRAM", kind: "BOOKING_CONFIRMATION" } },
    create: { businessId, bookingId, channel: "TELEGRAM", kind: "BOOKING_CONFIRMATION", status: "PROCESSING", scheduledAt: dependencies.now() },
    update: {},
  });
  if (message.status === "SENT") return;

  try {
    await dependencies.sendMessage(chatId, "Запись подтверждена. Мы напомним вам перед визитом.", bookingActions(bookingId, dependencies.now()));
    await prisma.message.update({ where: { id: message.id }, data: { status: "SENT", attempts: { increment: 1 }, lastError: null } });
  } catch {
    await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", attempts: { increment: 1 }, lastError: "TELEGRAM delivery failed" } });
  }
}

function bookingActions(bookingId: string, now: Date): TelegramReplyMarkup {
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const cancelToken = createCustomerBookingToken({ bookingId, action: "cancel_booking", expiresAt });
  const rescheduleToken = createCustomerBookingToken({ bookingId, action: "reschedule_booking", expiresAt });
  const appUrl = process.env.APP_URL;
  return { inline_keyboard: [
    ...(appUrl ? [[{ text: "Перенести запись", url: `${appUrl.replace(/\/$/, "")}/reschedule/${rescheduleToken}` }]] : []),
    [{ text: "Отменить запись", callback_data: cancelToken }],
  ] };
}
