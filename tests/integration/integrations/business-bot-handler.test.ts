import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import {
  handleBusinessBotUpdate,
  type BusinessBotHandlerDependencies,
  type BusinessBotPlatformActor,
} from "@/integrations/telegram/business-bot-handler";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("platform business bot handler", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("renders a useful menu and opens a pending booking without a web redirect", async () => {
    const fixture = await createActor("OWNER");
    await createPendingBooking(fixture, "Мухаммад");
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);

    await handleBusinessBotUpdate(fixture.actor, messageUpdate("/start"), dependencies);
    expect(output.at(-1)?.text).toContain("Ожидают оплату: 1");
    expect(output.at(-1)?.text).toContain("Клиентский бот: не подключён");
    expect(output.at(-1)?.replyMarkup?.keyboard?.flat().map(({ text }) => text)).not.toContain("Настройки");

    await handleBusinessBotUpdate(fixture.actor, messageUpdate("Записи"), dependencies);
    const pendingAction = findCallback(output.at(-1), "Ожидают оплату");
    expect(pendingAction).toBeTruthy();
    expect(pendingAction).not.toContain("bookings:pending");

    output.length = 0;
    await handleBusinessBotUpdate(fixture.actor, callbackUpdate("pending", pendingAction!), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "pending" });
    expect(output.at(-1)?.text).toContain("Мухаммад");
    const bookingAction = findCallback(output.at(-1), "Открыть");

    output.length = 0;
    await handleBusinessBotUpdate(fixture.actor, callbackUpdate("booking", bookingAction!), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "booking" });
    expect(output.at(-1)?.text).toContain("Ждёт оплаты");
    expect(output.at(-1)?.text).toContain("+992 90 000 11 77");
    expect(output.at(-1)?.text).not.toContain("/dashboard");
  });

  it("keeps navigation actions repeatable but bound to the linked actor", async () => {
    const owner = await createActor("OWNER");
    const staff = await createActor("STAFF", owner);
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);

    await handleBusinessBotUpdate(owner.actor, messageUpdate("Записи"), dependencies);
    const todayAction = findCallback(output.at(-1), "Сегодня")!;
    expect(todayAction).toBeTruthy();

    output.length = 0;
    await handleBusinessBotUpdate(owner.actor, callbackUpdate("first", todayAction), dependencies);
    await handleBusinessBotUpdate(owner.actor, callbackUpdate("second", todayAction), dependencies);
    expect(output.filter(({ kind }) => kind === "answer")).toHaveLength(2);
    expect(output.at(-1)?.text).toContain("Записи на сегодня");

    output.length = 0;
    await handleBusinessBotUpdate(staff.actor, callbackUpdate("foreign", todayAction), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "foreign" });
    expect(output.at(-1)?.text).toContain("уже недействительно");
    expect(findCallback(output.at(-1), "Обновить")).toBeTruthy();
    expect(findCallback(output.at(-1), "Главное меню")).toBeTruthy();
  });

  it("hides payment checks from staff while keeping the native workspace available", async () => {
    const staff = await createActor("STAFF");
    const output: Output[] = [];

    await handleBusinessBotUpdate(staff.actor, messageUpdate("/menu"), fakeDependencies(output));

    const labels = output.at(-1)?.replyMarkup?.keyboard?.flat().map(({ text }) => text) ?? [];
    expect(labels).toContain("Сегодня");
    expect(labels).toContain("Ссылка для клиентов");
    expect(labels).toContain("Ещё");
    expect(labels).not.toContain("Проверить чеки");
  });

  async function createActor(role: "OWNER" | "STAFF", workspace?: ActorFixture): Promise<ActorFixture> {
    if (!workspace) {
      const fixture = await createBookingFixture();
      businessIds.push(fixture.business.id);
      const fixtureMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
      userIds.push(fixtureMembership.userId);
      if (role === "STAFF") {
        return actorResult(fixture.business, fixture.branch.id, fixture.service.id, fixture.staff.id, fixtureMembership.userId, role);
      }
      const owner = await prisma.user.create({ data: { email: `handler-owner-${randomUUID()}@example.test`, displayName: "Owner" } });
      userIds.push(owner.id);
      await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role } });
      return actorResult(fixture.business, fixture.branch.id, fixture.service.id, fixture.staff.id, owner.id, role);
    }

    const user = await prisma.user.create({ data: { email: `handler-staff-${randomUUID()}@example.test`, displayName: "Staff" } });
    userIds.push(user.id);
    const membership = await prisma.membership.create({ data: { businessId: workspace.actor.businessId, userId: user.id, role } });
    const staff = await prisma.staffMember.create({
      data: { businessId: workspace.actor.businessId, membershipId: membership.id, displayName: "Staff" },
    });
    return actorResult(workspace.business, workspace.branchId, workspace.serviceId, staff.id, user.id, role, "9002");
  }

  function actorResult(
    business: { id: string; name: string },
    branchId: string,
    serviceId: string,
    staffId: string,
    userId: string,
    role: "OWNER" | "STAFF",
    telegramUserId = "9001",
  ) {
    const actor: BusinessBotPlatformActor = {
      businessId: business.id,
      userId,
      role,
      business: { id: business.id, name: business.name },
      destination: { chatId: "-100900", chatType: "supergroup" },
      telegramUserId,
    };
    return { actor, business, branchId, serviceId, staffId };
  }

  async function createPendingBooking(fixture: Awaited<ReturnType<typeof createActor>>, customerName: string) {
    const customer = await prisma.customer.create({
      data: { businessId: fixture.actor.businessId, name: customerName, phone: "+992900001177" },
    });
    return prisma.booking.create({
      data: {
        businessId: fixture.actor.businessId,
        branchId: fixture.branchId,
        serviceId: fixture.serviceId,
        staffId: fixture.staffId,
        customerId: customer.id,
        startsAt: new Date("2026-07-29T08:00:00.000Z"),
        endsAt: new Date("2026-07-29T08:45:00.000Z"),
        status: "PENDING_PAYMENT",
        payment: { create: { businessId: fixture.actor.businessId, amountDiram: 5_000 } },
      },
    });
  }
});

type ReplyMarkup = {
  inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>>;
  keyboard?: Array<Array<{ text: string }>>;
};

type ActorFixture = {
  actor: BusinessBotPlatformActor;
  business: { id: string; name: string };
  branchId: string;
  serviceId: string;
  staffId: string;
};

type Output = {
  kind: "send" | "edit" | "answer";
  text?: string;
  callbackId?: string;
  replyMarkup?: ReplyMarkup;
};

function fakeDependencies(output: Output[]): BusinessBotHandlerDependencies {
  return {
    now: () => new Date("2026-07-29T07:00:00.000Z"),
    sendMessage: async (_chatId, text, replyMarkup) => { output.push({ kind: "send", text, replyMarkup }); },
    editMessageText: async (_message, text, replyMarkup) => {
      output.push({ kind: "edit", text, replyMarkup });
      return _message;
    },
    answerCallbackQuery: async (callbackId) => { output.push({ kind: "answer", callbackId }); },
  };
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
  return output?.replyMarkup?.inline_keyboard?.flat().find(({ text }) => text.includes(label))?.callback_data;
}
