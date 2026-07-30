import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import { prisma } from "@/core/database/prisma";
import { encryptSecret } from "@/core/security/secret-encryption";
import {
  handleBusinessTelegramUpdate,
  type BusinessTelegramHandlerDependencies,
} from "@/integrations/telegram/business-update-handler";
import type { BusinessTelegramContext, BusinessTelegramUpdate } from "@/integrations/telegram/business-update-dispatcher";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

const integrationKey = Buffer.alloc(32, 13).toString("base64");

describe("tenant Telegram booking journey", () => {
  const businessIds: string[] = [];

  beforeEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = integrationKey;
    process.env.BOOKING_ACTION_SECRET = "booking-action-test-secret-at-least-32-bytes";
    process.env.APP_URL = "https://manclient.example";
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("books and confirms a visit entirely through the business bot", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    await prisma.branch.update({ where: { id: fixture.branch.id }, data: { timeZone: "Europe/Berlin" } });
    const integration = await prisma.businessTelegramIntegration.create({
      data: {
        businessId: fixture.business.id,
        publicId: `flow-${randomUUID()}`,
        botId: `flow-bot-${randomUUID()}`,
        botUsername: "pilot_barber_bot",
        botTokenEncrypted: encryptSecret("10012:tenant-token", integrationKey),
        webhookSecretEncrypted: encryptSecret("flow-secret", integrationKey),
        status: "ACTIVE",
      },
    });
    const context: BusinessTelegramContext = {
      businessId: fixture.business.id,
      integrationId: integration.id,
      token: "10012:tenant-token",
    };
    const sent: SentMessage[] = [];
    const answered: string[] = [];
    const image = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).jpeg().toBuffer());
    const dependencies: BusinessTelegramHandlerDependencies = {
      now: () => new Date("2026-08-01T04:00:00.000Z"),
      sendMessage: async (_chatId, text, replyMarkup) => { sent.push({ text, replyMarkup }); },
      answerCallbackQuery: async id => { answered.push(id); },
      downloadPhoto: async () => image,
      storeReceipt: async () => "receipts/tenant-flow.jpg",
      recognizeReceipt: async () => ({
        operationNumber: "88123001",
        amountDiram: 5_000,
        recipientCardSuffix: "4444",
        operationAt: new Date("2026-08-01T04:10:00.000Z"),
        isSuccessful: true,
      }),
    };

    await send(context, dependencies, { update_id: 1, message: { chat: { id: 701 }, text: "/start" } });
    await callback(context, dependencies, sent, "Русский", 2);
    await callback(context, dependencies, sent, "Новая запись", 3);
    await callback(context, dependencies, sent, fixture.branch.name, 4);
    await callback(context, dependencies, sent, fixture.service.name, 5);
    await callback(context, dependencies, sent, fixture.staff.displayName, 6);
    expect(sent.at(-1)?.replyMarkup?.inline_keyboard?.slice(0, 7).every(row => row.length <= 2)).toBe(true);
    await callback(context, dependencies, sent, "02.08", 7);
    expect(sent.at(-1)?.replyMarkup?.inline_keyboard?.slice(0, 4).every(row => row.length <= 3)).toBe(true);
    await callback(context, dependencies, sent, "09:00", 8);
    await send(context, dependencies, { update_id: 9, message: { chat: { id: 701 }, text: "Мухаммад" } });
    await send(context, dependencies, { update_id: 10, message: { chat: { id: 701 }, contact: { phone_number: "+992900001122", user_id: 701 } } });
    expect(findCallback(sent.at(-1), "Изменить время")).toBeTruthy();
    await callback(context, dependencies, sent, "Подтвердить запись", 11);

    expect(sent.at(-1)?.text).toContain("DushanbeCity");
    expect(findUrl(sent.at(-1), "Оплатить")).toMatch(/^http:\/\/pay\.expresspay\.tj\//);

    await callback(context, dependencies, sent, "Я оплатил", 12);
    const workingStoreReceipt = dependencies.storeReceipt;
    dependencies.storeReceipt = async () => { throw new Error("storage unavailable"); };
    await send(context, dependencies, { update_id: 13, message: { chat: { id: 701 }, photo: [{ file_id: "receipt" }] } });

    expect(sent.at(-1)?.text).toContain("отправьте его ещё раз");
    await expect(prisma.booking.findFirst({
      where: { businessId: fixture.business.id, customer: { telegramChatId: "701" } },
    })).resolves.toMatchObject({ status: "PENDING_PAYMENT" });

    dependencies.storeReceipt = workingStoreReceipt;
    await send(context, dependencies, { update_id: 14, message: { chat: { id: 701 }, photo: [{ file_id: "receipt" }] } });

    const booking = await prisma.booking.findFirstOrThrow({
      where: { businessId: fixture.business.id, customer: { telegramChatId: "701" } },
      include: { payment: true },
    });
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.payment?.status).toBe("RECEIPT_ACCEPTED");
    expect(sent.at(-1)?.text).toContain("подтверждена");
    expect(answered.length).toBeGreaterThan(0);

    await send(context, dependencies, { update_id: 15, message: { chat: { id: 701 }, text: "/bookings" } });
    await callback(context, dependencies, sent, "Отменить", 16);
    expect(findCallback(sent.at(-1), "Да, отменить")).toBeTruthy();
    expect(findCallback(sent.at(-1), "Не отменять")).toBeTruthy();

    await callback(context, dependencies, sent, "Не отменять", 17);
    expect(sent.at(-1)?.text).toContain("Подтверждена");

    await callback(context, dependencies, sent, "Перенести", 18);
    expect(sent.at(-1)?.replyMarkup?.inline_keyboard?.slice(0, 7).every(row => row.length <= 2)).toBe(true);
    await callback(context, dependencies, sent, "02.08", 19);
    expect(sent.at(-1)?.replyMarkup?.inline_keyboard?.slice(0, 4).every(row => row.length <= 3)).toBe(true);
    await callback(context, dependencies, sent, "10:00", 20);
    expect(sent.at(-2)?.text).toContain("перенесена");
    expect(sent.at(-1)?.text).toContain("10:00");
  });
});

type ReplyMarkup = {
  inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  keyboard?: Array<Array<{ text: string; request_contact?: boolean }>>;
};
type SentMessage = { text: string; replyMarkup?: ReplyMarkup };

async function callback(
  context: BusinessTelegramContext,
  dependencies: BusinessTelegramHandlerDependencies,
  sent: SentMessage[],
  label: string,
  updateId: number,
) {
  const callbackData = sent.at(-1)?.replyMarkup?.inline_keyboard?.flat().find(({ text }) => text.includes(label))?.callback_data;
  expect(callbackData, `callback ${label}`).toBeTruthy();
  await send(context, dependencies, {
    update_id: updateId,
    callback_query: { id: String(updateId), data: callbackData, message: { chat: { id: 701 } } },
  });
}

function findUrl(message: SentMessage | undefined, label: string) {
  return message?.replyMarkup?.inline_keyboard?.flat().find(({ text }) => text.includes(label))?.url;
}

function findCallback(message: SentMessage | undefined, label: string) {
  return message?.replyMarkup?.inline_keyboard?.flat().find(({ text }) => text.includes(label))?.callback_data;
}

function send(
  context: BusinessTelegramContext,
  dependencies: BusinessTelegramHandlerDependencies,
  update: BusinessTelegramUpdate,
) {
  return handleBusinessTelegramUpdate(context, update, dependencies);
}
