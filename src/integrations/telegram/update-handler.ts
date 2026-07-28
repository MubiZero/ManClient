import { randomUUID } from "node:crypto";

import {
  createCustomerBookingToken,
  verifyBookingActionToken,
  verifyCustomerBookingToken,
} from "@/core/bookings/booking-action-token";
import { cancelBooking } from "@/core/bookings/cancel-booking";
import { prisma } from "@/core/database/prisma";
import { recognizeDushanbeCityReceipt } from "@/core/payments/dushanbe-city-receipt-recognizer";
import { confirmFromReceipt } from "@/core/payments/payment-service";
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

export async function handleTelegramUpdate(update: TelegramUpdate, dependencies: HandlerDependencies = defaultDependencies): Promise<void> {
  const message = update.message;
  if (update.callback_query?.data?.startsWith("c.") && update.callback_query.message) {
    const chatId = String(update.callback_query.message.chat.id);
    try {
      const token = update.callback_query.data;
      const action = verifyCustomerBookingToken(token, "cancel_booking", dependencies.now());
      const booking = await prisma.booking.findFirstOrThrow({
        where: { id: action.bookingId, customer: { telegramChatId: chatId } },
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
      const action = verifyBookingActionToken(token, dependencies.now());
      const payment = await prisma.payment.findUnique({ where: { id: action.paymentId }, include: { booking: true } });
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

  const payment = await prisma.payment.findFirst({
    where: {
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
  const image = await dependencies.downloadPhoto(photo.file_id);
  const storageKey = `receipts/${payment.businessId}/${randomUUID()}.jpg`;
  await dependencies.storeReceipt({ storageKey, contentType: "image/jpeg", body: image });

  try {
    const receipt = await dependencies.recognizeReceipt(image);
    const confirmed = await confirmFromReceipt({ ...receipt, paymentId: payment.id, receiptStorageKey: storageKey });
    if (confirmed.status === "RECEIPT_ACCEPTED") {
      await dependencies.sendMessage(chatId, "Запись подтверждена. Мы напомним вам перед визитом.", bookingActions(payment.booking.id, dependencies.now()));
    } else {
      await dependencies.sendMessage(chatId, "Чек получен и передан администратору на проверку. Запись пока ожидает подтверждения.");
    }
  } catch {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "NEEDS_ATTENTION", receiptStorageKey: storageKey } });
    await dependencies.sendMessage(chatId, "Не удалось надёжно прочитать чек. Он передан администратору на проверку.");
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
