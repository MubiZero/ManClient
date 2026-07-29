import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { createBusinessBotAction, type BusinessBotActionKind } from "@/core/integrations/business-bot-actions";
import { prisma } from "@/core/database/prisma";
import { rejectPaymentReview, PaymentReviewError } from "@/core/payments/payment-review-service";
import {
  handleBusinessBotUpdate,
  type BusinessBotHandlerDependencies,
  type BusinessBotPlatformActor,
} from "@/integrations/telegram/business-bot-handler";
import type { TelegramMessageRef, TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("business bot payment review", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it.each(["OWNER", "ADMIN"] as const)("lets %s open the paginated review queue", async (role) => {
    const workspace = await createWorkspace(role);
    for (let index = 0; index < 11; index += 1) {
      await createReview(workspace, `Клиент ${String(index + 1).padStart(2, "0")}`);
    }
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);

    await handleBusinessBotUpdate(workspace.actor, messageUpdate("Проверить чеки"), dependencies);

    expect(output.at(-1)?.text).toContain("Чеки на проверке");
    expect(findCallback(output.at(-1), "Открыть")).toBeTruthy();
    const more = findCallback(output.at(-1), "Показать ещё");
    expect(more).toBeTruthy();
    expect(more).not.toContain("cursor");

    output.length = 0;
    await handleBusinessBotUpdate(workspace.actor, callbackUpdate("next", more!), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "next" });
    expect(output.at(-1)?.text).toContain("Клиент 11");
    expect(findCallback(output.at(-1), "Показать ещё")).toBeUndefined();
  });

  it("denies STAFF from both the menu command and a direct opaque action", async () => {
    const workspace = await createWorkspace("STAFF");
    const review = await createReview(workspace, "Закрытый чек");
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);

    await handleBusinessBotUpdate(workspace.actor, messageUpdate("Проверить чеки"), dependencies);
    expect(output.at(-1)?.text).toContain("доступна владельцу и администратору");

    const direct = await createAction(workspace.actor, "payment.open", { paymentId: review.payment.id });
    output.length = 0;
    await handleBusinessBotUpdate(workspace.actor, callbackUpdate("direct", direct), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "direct" });
    expect(output.at(-1)?.text).toContain("нет доступа");
    expect(JSON.stringify(output)).not.toContain("Закрытый чек");
  });

  it("shows only a safe card tail and sends protected receipt bytes", async () => {
    const workspace = await createWorkspace("OWNER");
    const review = await createReview(workspace, "Чек с фото", {
      recipientCardSuffix: "1111222233339999",
      storageKey: "receipts/private/raw-secret-key.jpg",
    });
    const output: Output[] = [];
    const receiptRequests: Array<Record<string, string>> = [];
    const dependencies = fakeDependencies(output, {
      loadPaymentReceipt: async (input) => {
        receiptRequests.push(input);
        return { body: new Uint8Array([1, 2, 3, 4]), contentType: "image/jpeg" };
      },
    });

    const card = await openFirstReview(workspace.actor, dependencies, output);
    expect(card.text).toContain("•••• 9999");
    expect(JSON.stringify(card)).not.toContain("1111222233339999");
    expect(JSON.stringify(card)).not.toContain("raw-secret-key");

    output.length = 0;
    await handleBusinessBotUpdate(workspace.actor, callbackUpdate("photo", findCallback(card, "Показать чек")!), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "photo" });
    expect(output.at(-1)).toMatchObject({ kind: "photo", photo: [1, 2, 3, 4] });
    expect(receiptRequests).toEqual([{
      businessId: workspace.actor.businessId,
      actorUserId: workspace.actor.userId,
      paymentId: review.payment.id,
    }]);
    expect(JSON.stringify(output)).not.toContain("raw-secret-key");
  });

  it("requires explicit approval confirmation, stays idempotent and schedules supported customer notifications", async () => {
    const workspace = await createWorkspace("ADMIN", { customerNotifications: true });
    const review = await createReview(workspace, "Подтверждение", { telegramChatId: "customer-7001" });
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);
    const firstCard = await openFirstReview(workspace.actor, dependencies, output);
    const secondCard = await openFirstReview(workspace.actor, dependencies, output);

    const firstConfirmation = await invoke(workspace.actor, findCallback(firstCard, "Подтвердить оплату")!, dependencies, output);
    const secondConfirmation = await invoke(workspace.actor, findCallback(secondCard, "Подтвердить оплату")!, dependencies, output);
    expect(firstConfirmation.text).toContain("Подтвердить оплату после сверки чека?");
    await expect(prisma.payment.findUniqueOrThrow({ where: { id: review.payment.id } })).resolves.toMatchObject({ status: "NEEDS_ATTENTION" });

    const accepted = await invoke(workspace.actor, findCallback(firstConfirmation, "Да, подтвердить")!, dependencies, output);
    const replay = await invoke(workspace.actor, findCallback(secondConfirmation, "Да, подтвердить")!, dependencies, output);
    expect(accepted.text).toContain("Оплата подтверждена");
    expect(replay.text).toContain("уже подтверждена");
    await expect(prisma.payment.findUniqueOrThrow({ where: { id: review.payment.id } })).resolves.toMatchObject({ status: "RECEIPT_ACCEPTED" });
    await expect(prisma.auditEvent.count({ where: { bookingId: review.booking.id, type: "payment.review_approved" } })).resolves.toBe(1);
    await expect(prisma.message.findMany({ where: { bookingId: review.booking.id }, orderBy: [{ channel: "asc" }, { kind: "asc" }] })).resolves.toMatchObject([
      { channel: "TELEGRAM", kind: "BOOKING_REMINDER", status: "SCHEDULED" },
      { channel: "WHATSAPP", kind: "BOOKING_CONFIRMATION", status: "SCHEDULED" },
      { channel: "WHATSAPP", kind: "BOOKING_REMINDER", status: "SCHEDULED" },
    ]);
  });

  it("offers typical rejection reasons and saves the selected reason once", async () => {
    const workspace = await createWorkspace("OWNER");
    const review = await createReview(workspace, "Отклонение");
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);
    const card = await openFirstReview(workspace.actor, dependencies, output);

    const reasons = await invoke(workspace.actor, findCallback(card, "Отклонить чек")!, dependencies, output);
    expect(reasons.text).toContain("Выберите причину отклонения");
    const rejected = await invoke(workspace.actor, findCallback(reasons, "Сумма не совпадает")!, dependencies, output);

    expect(rejected.text).toContain("Чек отклонён");
    await expect(prisma.payment.findUniqueOrThrow({ where: { id: review.payment.id } })).resolves.toMatchObject({
      status: "REJECTED",
      reviewReason: "Сумма не совпадает",
    });
    await expect(prisma.auditEvent.count({ where: { bookingId: review.booking.id, type: "payment.review_rejected" } })).resolves.toBe(1);
  });

  it("validates a custom rejection reason and accepts a valid opaque custom decision", async () => {
    const workspace = await createWorkspace("OWNER");
    const review = await createReview(workspace, "Своя причина");

    await expect(rejectPaymentReview({
      businessId: workspace.actor.businessId,
      actorUserId: workspace.actor.userId,
      paymentId: review.payment.id,
      reason: "x",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<PaymentReviewError>);

    const output: Output[] = [];
    const dependencies = fakeDependencies(output);
    const action = await createAction(workspace.actor, "PAYMENT_REJECT_REASON", {
      paymentId: review.payment.id,
      reason: "Карта получателя указана неверно",
    }, "MUTATION");
    const result = await invoke(workspace.actor, action, dependencies, output);

    expect(result.text).toContain("Чек отклонён");
    await expect(prisma.payment.findUniqueOrThrow({ where: { id: review.payment.id } })).resolves.toMatchObject({
      status: "REJECTED",
      reviewReason: "Карта получателя указана неверно",
    });
  });

  async function createWorkspace(
    role: "OWNER" | "ADMIN" | "STAFF",
    options: { customerNotifications?: boolean } = {},
  ) {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const fixtureMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
    userIds.push(fixtureMembership.userId);
    let userId = fixtureMembership.userId;
    if (role !== "STAFF") {
      const user = await prisma.user.create({ data: { email: `payment-review-${randomUUID()}@example.test`, displayName: role } });
      userIds.push(user.id);
      userId = user.id;
      await prisma.membership.create({ data: { businessId: fixture.business.id, userId, role } });
    }
    if (options.customerNotifications) {
      await prisma.business.update({
        where: { id: fixture.business.id },
        data: {
          whatsappPhoneNumberId: "phone-number-id",
          whatsappTemplateName: "booking_reminder",
          whatsappConfirmationTemplateName: "booking_confirmed",
        },
      });
    }
    return {
      ...fixture,
      actor: {
        businessId: fixture.business.id,
        userId,
        role,
        business: fixture.business,
        destination: { chatId: `business-chat-${fixture.business.id}`, chatType: "supergroup" },
        telegramUserId: `telegram-${role.toLowerCase()}-${fixture.business.id}`,
      } satisfies BusinessBotPlatformActor,
    };
  }

  async function createReview(
    workspace: Awaited<ReturnType<typeof createWorkspace>>,
    customerName: string,
    options: { recipientCardSuffix?: string; storageKey?: string; telegramChatId?: string } = {},
  ) {
    const customer = await prisma.customer.create({
      data: {
        businessId: workspace.business.id,
        name: customerName,
        phone: `+992${randomUUID().replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`,
        telegramChatId: options.telegramChatId,
      },
    });
    const booking = await prisma.booking.create({
      data: {
        businessId: workspace.business.id,
        branchId: workspace.branch.id,
        serviceId: workspace.service.id,
        staffId: workspace.staff.id,
        customerId: customer.id,
        startsAt: new Date("2026-08-02T05:00:00.000Z"),
        endsAt: new Date("2026-08-02T05:45:00.000Z"),
        expiresAt: new Date("2026-08-01T05:00:00.000Z"),
        status: "PENDING_PAYMENT",
        payment: {
          create: {
            businessId: workspace.business.id,
            amountDiram: 5_000,
            status: "NEEDS_ATTENTION",
            receiptAmountDiram: 4_000,
            recipientCardSuffix: options.recipientCardSuffix ?? "9999",
            attentionReason: "AMOUNT_MISMATCH",
          },
        },
      },
      include: { payment: true },
    });
    const payment = booking.payment!;
    await prisma.receiptSubmission.create({
      data: {
        businessId: workspace.business.id,
        paymentId: payment.id,
        storageKey: options.storageKey ?? `receipts/${workspace.business.id}/${payment.id}/${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 4,
        status: "NEEDS_REVIEW",
      },
    });
    return { booking, payment };
  }
});

type Output = {
  kind: "send" | "edit" | "answer" | "photo";
  text?: string;
  callbackId?: string;
  replyMarkup?: TelegramReplyMarkup;
  photo?: number[];
};

type ReceiptLoader = (input: { businessId: string; actorUserId: string; paymentId: string }) => Promise<{ body: Uint8Array; contentType: string }>;

function fakeDependencies(output: Output[], options: { loadPaymentReceipt?: ReceiptLoader } = {}): BusinessBotHandlerDependencies {
  return {
    now: () => new Date("2026-07-29T07:00:00.000Z"),
    sendMessage: async (_chatId, text, replyMarkup) => { output.push({ kind: "send", text, replyMarkup }); },
    editMessageText: async (message, text, replyMarkup) => {
      output.push({ kind: "edit", text, replyMarkup });
      return message;
    },
    answerCallbackQuery: async (callbackId) => { output.push({ kind: "answer", callbackId }); },
    sendPhoto: async (_chatId, photo, caption, replyMarkup) => {
      output.push({ kind: "photo", photo: [...photo], text: caption, replyMarkup });
      return { chatId: _chatId, messageId: 91 } satisfies TelegramMessageRef;
    },
    loadPaymentReceipt: options.loadPaymentReceipt ?? (async () => ({ body: new Uint8Array([1, 2, 3, 4]), contentType: "image/jpeg" })),
  };
}

async function openFirstReview(actor: BusinessBotPlatformActor, dependencies: BusinessBotHandlerDependencies, output: Output[]) {
  output.length = 0;
  await handleBusinessBotUpdate(actor, messageUpdate("Проверить чеки"), dependencies);
  return invoke(actor, findCallback(output.at(-1), "Открыть")!, dependencies, output);
}

async function invoke(actor: BusinessBotPlatformActor, data: string, dependencies: BusinessBotHandlerDependencies, output: Output[]) {
  output.length = 0;
  await handleBusinessBotUpdate(actor, callbackUpdate(randomUUID(), data), dependencies);
  return output.at(-1)!;
}

async function createAction(
  actor: BusinessBotPlatformActor,
  kind: BusinessBotActionKind,
  payload: Record<string, string>,
  mode: "NAVIGATION" | "MUTATION" = "NAVIGATION",
) {
  const action = await createBusinessBotAction(actor, {
    kind,
    payload,
    expiresAt: new Date("2026-07-29T07:15:00.000Z"),
    mode,
  });
  return action.actionId;
}

function messageUpdate(text: string) {
  return { update_id: 1, message: { message_id: 1, from: { id: 9001 }, chat: { id: -100900, type: "supergroup" as const }, text } };
}

function callbackUpdate(id: string, data: string) {
  return {
    update_id: 2,
    callback_query: {
      id,
      from: { id: 9001 },
      message: { message_id: 42, chat: { id: -100900, type: "supergroup" as const } },
      data,
    },
  };
}

function findCallback(output: Output | undefined, label: string) {
  const replyMarkup = output?.replyMarkup;
  if (!replyMarkup || !("inline_keyboard" in replyMarkup)) return undefined;
  return replyMarkup.inline_keyboard.flat().find(({ text }) => text.includes(label))?.callback_data;
}
