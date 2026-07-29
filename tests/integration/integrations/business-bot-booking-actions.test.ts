import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { rescheduleBusinessBooking } from "@/core/booking-operations/booking-command-service";
import type { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { createBusinessBotAction, type BusinessBotActionKind } from "@/core/integrations/business-bot-actions";
import { encryptSecret } from "@/core/security/secret-encryption";
import {
  handleBusinessBotUpdate,
  type BusinessBotHandlerDependencies,
  type BusinessBotPlatformActor,
} from "@/integrations/telegram/business-bot-handler";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";
import type { TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";

describe("business bot booking mutations", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
  });

  it("confirms an OWNER booking once and shows the current state to a second delivery", async () => {
    const workspace = await createWorkspace();
    const booking = await createPendingBooking(workspace);
    const firstCard = await openBooking(workspace.owner, booking.id);
    const secondCard = await openBooking(workspace.owner, booking.id);
    const firstConfirm = findCallback(firstCard, "Подтвердить запись")!;
    const secondConfirm = findCallback(secondCard, "Подтвердить запись")!;

    expect(firstConfirm).toBeTruthy();
    expect(firstConfirm).not.toContain(booking.id);

    const firstResult = await invoke(workspace.owner, firstConfirm);
    const secondResult = await invoke(workspace.owner, secondConfirm);

    expect(firstResult.at(-1)?.text).toContain("Подтверждена");
    expect(secondResult.at(-1)?.text).toContain("Подтверждена");
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).resolves.toMatchObject({
      status: "CONFIRMED",
      confirmedBy: expect.stringMatching(/^membership:/),
    });
    await expect(prisma.auditEvent.count({ where: { bookingId: booking.id, type: "booking.confirmed_manually" } })).resolves.toBe(1);

    const replay = await invoke(workspace.owner, firstConfirm);
    expect(replay.at(-1)?.text).toContain("уже недействительно");
  });

  it("denies STAFF outside their assigned bookings and actors from another tenant", async () => {
    const workspace = await createWorkspace();
    const foreignWorkspace = await createWorkspace();
    const booking = await createPendingBooking(workspace);
    const staffAction = await mutationAction(workspace.otherStaff, "BOOKING_CONFIRM", { bookingId: booking.id });
    const tenantAction = await mutationAction(foreignWorkspace.owner, "BOOKING_CONFIRM", { bookingId: booking.id });

    const staffResult = await invoke(workspace.otherStaff, staffAction);
    const tenantResult = await invoke(foreignWorkspace.owner, tenantAction);

    expect(staffResult.at(-1)?.text).toContain("нет доступа");
    expect(tenantResult.at(-1)?.text).toContain("нет доступа");
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
  });

  it("requires a separate cancellation confirmation and stores its reason", async () => {
    const workspace = await createWorkspace();
    const booking = await createPendingBooking(workspace, { status: "CONFIRMED" });
    const card = await openBooking(workspace.owner, booking.id);

    const confirmation = await invoke(workspace.owner, findCallback(card, "Отменить запись")!);
    expect(confirmation.at(-1)?.text).toContain("Выберите причину");
    expect(confirmation.at(-1)?.text).not.toContain("получит уведомление");
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).resolves.toMatchObject({ status: "CONFIRMED" });

    const cancelled = await invoke(workspace.owner, findCallback(confirmation, "Клиент попросил отменить")!);
    expect(cancelled.at(-1)?.text).toContain("Отменена");
    expect(cancelled.at(-1)?.text).not.toContain("уведом");
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).resolves.toMatchObject({
      status: "CANCELLED",
      cancellationReason: "Клиент попросил отменить",
      cancelledBy: expect.stringMatching(/^membership:/),
    });
  });

  it("rechecks allocation before rescheduling and keeps the old slot on conflict", async () => {
    const workspace = await createWorkspace();
    const oldStartsAt = new Date("2026-08-02T05:00:00.000Z");
    const booking = await createPendingBooking(workspace, { status: "CONFIRMED", startsAt: oldStartsAt });
    const card = await openBooking(workspace.owner, booking.id);

    const dates = await invoke(workspace.owner, findCallback(card, "Перенести")!);
    const slots = await invoke(workspace.owner, findCallback(dates, "2 авг")!);
    expect(slots.at(-1)?.text).toContain("Выберите новое время");
    const selectedSlot = findCallback(slots, "09:00")!;
    expect(selectedSlot).toBeTruthy();

    await createPendingBooking(workspace, {
      customerName: "Конкурирующая запись",
      status: "CONFIRMED",
      startsAt: new Date("2026-08-02T04:00:00.000Z"),
    });
    const result = await invoke(workspace.owner, selectedSlot);

    expect(result.at(-1)?.text).toContain("время уже занято");
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).resolves.toMatchObject({
      startsAt: oldStartsAt,
      status: "CONFIRMED",
    });
  });

  it("rejects a past reschedule in the domain and preserves the old time", async () => {
    const workspace = await createWorkspace();
    await prisma.businessScheduleRule.create({
      data: { branchId: workspace.branch.id, dayOfWeek: 3, startsAt: "00:00", endsAt: "23:59" },
    });
    const oldStartsAt = new Date("2026-08-02T05:00:00.000Z");
    const booking = await createPendingBooking(workspace, { status: "CONFIRMED", startsAt: oldStartsAt });

    await expect(rescheduleBusinessBooking({
      businessId: workspace.business.id,
      actorUserId: workspace.owner.userId,
      bookingId: booking.id,
      startsAt: new Date("2026-07-29T06:30:00.000Z"),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<BookingOperationError>);
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).resolves.toMatchObject({ startsAt: oldStartsAt });
  });

  it("offers only future slots and completes a valid native reschedule", async () => {
    const workspace = await createWorkspace();
    await prisma.businessScheduleRule.create({
      data: { branchId: workspace.branch.id, dayOfWeek: 3, startsAt: "00:00", endsAt: "23:59" },
    });
    const booking = await createPendingBooking(workspace, { status: "CONFIRMED" });
    const card = await openBooking(workspace.owner, booking.id);
    const dates = await invoke(workspace.owner, findCallback(card, "Перенести")!);
    const todaySlots = await invoke(workspace.owner, findCallback(dates, "29 июл")!);
    const todayLabels = buttonLabels(todaySlots);

    expect(todayLabels).not.toContain("12:00");
    expect(todayLabels).toContain("12:30");

    const sundaySlots = await invoke(workspace.owner, findCallback(dates, "2 авг")!);
    const result = await invoke(workspace.owner, findCallback(sundaySlots, "09:00")!);
    expect(result.at(-1)?.text).toContain("Запись перенесена");
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).resolves.toMatchObject({
      startsAt: new Date("2026-08-02T04:00:00.000Z"),
    });
  });

  it("hides payment reminders without a linked customer Telegram and explains a stale action", async () => {
    const workspace = await createWorkspace();
    const booking = await createPendingBooking(workspace);
    const card = await openBooking(workspace.owner, booking.id);

    expect(findCallback(card, "Напомнить об оплате")).toBeUndefined();

    const staleAction = await mutationAction(workspace.owner, "BOOKING_REMIND_PAYMENT", { bookingId: booking.id });
    const result = await invoke(workspace.owner, staleAction);
    expect(result.at(-1)?.text).toContain("Клиент не привязал Telegram");
  });

  it("deduplicates a Telegram payment reminder and leaves payment pending", async () => {
    const workspace = await createWorkspace();
    const encryptionKey = Buffer.alloc(32, 19).toString("base64");
    process.env.INTEGRATION_ENCRYPTION_KEY = encryptionKey;
    await prisma.businessTelegramIntegration.create({
      data: {
        businessId: workspace.business.id,
        publicId: `payment-reminder-${randomUUID()}`,
        botId: `payment-reminder-bot-${randomUUID()}`,
        botUsername: "payment_reminder_bot",
        botTokenEncrypted: encryptSecret("10014:payment-reminder-token", encryptionKey),
        webhookSecretEncrypted: encryptSecret("payment-reminder-secret", encryptionKey),
        status: "ACTIVE",
      },
    });
    const booking = await createPendingBooking(workspace, { telegramChatId: "customer-chat-7001" });
    const firstCard = await openBooking(workspace.owner, booking.id);
    const secondCard = await openBooking(workspace.owner, booking.id);

    const firstResult = await invoke(workspace.owner, findCallback(firstCard, "Напомнить об оплате")!);
    const secondResult = await invoke(workspace.owner, findCallback(secondCard, "Напомнить об оплате")!);

    expect(firstResult.at(-1)?.text).toContain("Напоминание об оплате запланировано");
    expect(secondResult.at(-1)?.text).toContain("уже запланировано");
    await expect(prisma.message.findMany({ where: { bookingId: booking.id, channel: "TELEGRAM", kind: "PAYMENT_REMINDER" } })).resolves.toMatchObject([
      { status: "SCHEDULED", bookingId: booking.id, channel: "TELEGRAM", kind: "PAYMENT_REMINDER" },
    ]);
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { customer: true, payment: true } })).resolves.toMatchObject({
      customer: { telegramChatId: "customer-chat-7001" },
      payment: { status: "PENDING", receiptAcceptedAt: null },
    });
    const delivered: Array<{ chatId: string; text: string }> = [];
    await sendDueBookingReminders(new Date("2026-07-29T07:00:00.000Z"), {
      sendTelegram: async (_token, chatId, text) => { delivered.push({ chatId, text }); },
      sendWhatsApp: async () => ({ externalId: "unused" }),
    });
    expect(delivered).toEqual([{ chatId: "customer-chat-7001", text: expect.stringContaining("оплате") }]);
    await expect(prisma.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })).resolves.toMatchObject({ status: "PENDING" });
  });

  async function createWorkspace() {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const assignedMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
    userIds.push(assignedMembership.userId);
    const ownerUser = await prisma.user.create({ data: { email: `bot-owner-${randomUUID()}@example.test`, displayName: "Owner" } });
    const otherStaffUser = await prisma.user.create({ data: { email: `bot-staff-${randomUUID()}@example.test`, displayName: "Other staff" } });
    userIds.push(ownerUser.id, otherStaffUser.id);
    await prisma.membership.create({ data: { businessId: fixture.business.id, userId: ownerUser.id, role: "OWNER" } });
    const otherMembership = await prisma.membership.create({ data: { businessId: fixture.business.id, userId: otherStaffUser.id, role: "STAFF" } });
    const otherStaff = await prisma.staffMember.create({
      data: {
        businessId: fixture.business.id,
        membershipId: otherMembership.id,
        displayName: "Other staff",
        branches: { create: { branchId: fixture.branch.id } },
      },
    });
    return {
      ...fixture,
      owner: actor(fixture, ownerUser.id, "OWNER", "owner"),
      assignedStaff: actor(fixture, assignedMembership.userId, "STAFF", "assigned"),
      otherStaff: actor({ ...fixture, staff: otherStaff }, otherStaffUser.id, "STAFF", "other"),
    };
  }

  function actor(
    fixture: { business: { id: string; name: string; slug: string }; staff: { id: string } },
    userId: string,
    role: "OWNER" | "STAFF",
    suffix: string,
  ): BusinessBotPlatformActor {
    return {
      businessId: fixture.business.id,
      userId,
      role,
      business: fixture.business,
      destination: { chatId: `business-chat-${fixture.business.id}`, chatType: "supergroup" },
      telegramUserId: `telegram-${suffix}-${fixture.business.id}`,
    };
  }

  async function createPendingBooking(
    workspace: Awaited<ReturnType<typeof createWorkspace>>,
    options: {
      customerName?: string;
      startsAt?: Date;
      status?: "PENDING_PAYMENT" | "CONFIRMED";
      telegramChatId?: string;
    } = {},
  ) {
    const startsAt = options.startsAt ?? new Date("2026-08-02T05:00:00.000Z");
    const customer = await prisma.customer.create({
      data: {
        businessId: workspace.business.id,
        name: options.customerName ?? "Мухаммад",
        phone: `+992${randomUUID().replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`,
        telegramChatId: options.telegramChatId,
      },
    });
    return prisma.booking.create({
      data: {
        businessId: workspace.business.id,
        branchId: workspace.branch.id,
        serviceId: workspace.service.id,
        staffId: workspace.staff.id,
        customerId: customer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + workspace.service.durationMinutes * 60_000),
        status: options.status ?? "PENDING_PAYMENT",
        payment: { create: { businessId: workspace.business.id, amountDiram: workspace.service.amountDiram } },
      },
    });
  }
});

type Output = {
  kind: "send" | "edit" | "answer";
  text?: string;
  callbackId?: string;
  replyMarkup?: TelegramReplyMarkup;
};

async function openBooking(actor: BusinessBotPlatformActor, bookingId: string) {
  const action = await createBusinessBotAction(actor, {
    kind: "BOOKING_REFRESH",
    payload: { bookingId },
    expiresAt: new Date("2026-07-29T07:15:00.000Z"),
  });
  return invoke(actor, action.actionId);
}

async function mutationAction(actor: BusinessBotPlatformActor, kind: BusinessBotActionKind, payload: { bookingId: string }) {
  const action = await createBusinessBotAction(actor, {
    kind,
    payload,
    expiresAt: new Date("2026-07-29T07:15:00.000Z"),
    mode: "MUTATION",
  });
  return action.actionId;
}

async function invoke(actor: BusinessBotPlatformActor, callbackData: string) {
  const output: Output[] = [];
  await handleBusinessBotUpdate(actor, {
    update_id: 1,
    callback_query: {
      id: randomUUID(),
      from: { id: Number.parseInt(actor.telegramUserId.replace(/\D/g, "").slice(0, 9), 10) || 1 },
      message: { message_id: 42, chat: { id: -100900, type: "supergroup" } },
      data: callbackData,
    },
  }, fakeDependencies(output));
  return output;
}

function fakeDependencies(output: Output[]): BusinessBotHandlerDependencies {
  return {
    now: () => new Date("2026-07-29T07:00:00.000Z"),
    sendMessage: async (_chatId, text, replyMarkup) => { output.push({ kind: "send", text, replyMarkup }); },
    editMessageText: async (message, text, replyMarkup) => {
      output.push({ kind: "edit", text, replyMarkup });
      return message;
    },
    answerCallbackQuery: async (callbackId) => { output.push({ kind: "answer", callbackId }); },
  };
}

function findCallback(output: Output[] | undefined, label: string) {
  const replyMarkup = output?.at(-1)?.replyMarkup;
  if (!replyMarkup || !("inline_keyboard" in replyMarkup)) return undefined;
  return replyMarkup.inline_keyboard.flat().find(({ text }) => text.includes(label))?.callback_data;
}

function buttonLabels(output: Output[] | undefined) {
  const replyMarkup = output?.at(-1)?.replyMarkup;
  if (!replyMarkup || !("inline_keyboard" in replyMarkup)) return [];
  return replyMarkup.inline_keyboard.flat().map(({ text }) => text);
}
