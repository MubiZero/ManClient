import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

  beforeEach(() => {
    process.env.APP_URL = "https://manclient.example";
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
    delete process.env.APP_URL;
  });

  it("renders a useful menu and opens a pending booking without a web redirect", async () => {
    const fixture = await createActor("OWNER");
    await createPendingBooking(fixture, "Мухаммад", new Date("2026-07-29T08:00:00.000Z"), "+992900001177");
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

  it("falls back to a fresh message when Telegram rejects a callback edit", async () => {
    const owner = await createActor("OWNER");
    const output: Output[] = [];
    const dependencies = fakeDependencies(output, { editFails: true });
    await handleBusinessBotUpdate(owner.actor, messageUpdate("Записи"), dependencies);
    const todayAction = findCallback(output.at(-1), "Сегодня")!;

    output.length = 0;
    await handleBusinessBotUpdate(owner.actor, callbackUpdate("edit-fallback", todayAction), dependencies);

    expect(output).toMatchObject([
      { kind: "answer", callbackId: "edit-fallback" },
      { kind: "send", text: "Записи на сегодня\n\nЗаписей нет." },
    ]);
  });

  it("serves help, the public client link and owner-only check counts", async () => {
    const owner = await createActor("OWNER");
    const booking = await createPendingBooking(owner, "Чек клиента");
    const payment = await prisma.payment.update({ where: { bookingId: booking.id }, data: { status: "NEEDS_ATTENTION" } });
    await prisma.receiptSubmission.create({
      data: {
        businessId: owner.actor.businessId,
        paymentId: payment.id,
        storageKey: `receipts/${owner.actor.businessId}/${payment.id}/${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 4,
        status: "NEEDS_REVIEW",
      },
    });
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);

    await handleBusinessBotUpdate(owner.actor, messageUpdate("/help"), dependencies);
    expect(output.at(-1)?.text).toContain("Используйте меню");

    await handleBusinessBotUpdate(owner.actor, messageUpdate("Ссылка для клиентов"), dependencies);
    expect(findUrl(output.at(-1), "Открыть запись")).toBe(`https://manclient.example/b/${owner.business.slug}`);

    await handleBusinessBotUpdate(owner.actor, messageUpdate("Проверить чеки"), dependencies);
    expect(output.at(-1)?.text).toContain("Чеки на проверке");
    expect(output.at(-1)?.text).toContain("Чек клиента");
    expect(findCallback(output.at(-1), "Открыть")).toBeTruthy();
  });

  it("switches the bot language and persists the choice on the membership", async () => {
    const owner = await createActor("OWNER");
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);

    await handleBusinessBotUpdate(owner.actor, messageUpdate("/language"), dependencies);
    expect(output.at(-1)?.text).toContain("Выберите язык бота.");
    const tgAction = findCallback(output.at(-1), "Тоҷикӣ");
    expect(tgAction).toBeTruthy();

    output.length = 0;
    await handleBusinessBotUpdate(owner.actor, callbackUpdate("set-language", tgAction!), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "set-language" });
    expect(output.at(-1)?.text).toContain("Мунтазири пардохт");

    await expect(prisma.membership.findUniqueOrThrow({ where: { id: owner.actor.membershipId } }))
      .resolves.toMatchObject({ languageCode: "tg" });

    output.length = 0;
    const tgActor: BusinessBotPlatformActor = { ...owner.actor, languageCode: "tg" };
    await handleBusinessBotUpdate(tgActor, messageUpdate("/help"), dependencies);
    expect(output.at(-1)?.text).toContain("Барои сабтҳо ва рӯзи корӣ менюро истифода баред");
  });

  it("maps every registered slash command to the matching business workspace action", async () => {
    const owner = await createActor("OWNER");
    const booking = await createPendingBooking(owner, "Командный клиент");
    const payment = await prisma.payment.update({ where: { bookingId: booking.id }, data: { status: "NEEDS_ATTENTION" } });
    await prisma.receiptSubmission.create({
      data: {
        businessId: owner.actor.businessId,
        paymentId: payment.id,
        storageKey: `receipts/${owner.actor.businessId}/${payment.id}/${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 4,
        status: "NEEDS_REVIEW",
      },
    });
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);

    await handleBusinessBotUpdate(owner.actor, messageUpdate("/today"), dependencies);
    expect(output.at(-1)?.text).toContain("Командный клиент");

    await handleBusinessBotUpdate(owner.actor, messageUpdate("/bookings"), dependencies);
    expect(output.at(-1)?.text).toBe("Какие записи показать?");

    await handleBusinessBotUpdate(owner.actor, messageUpdate("/checks"), dependencies);
    expect(output.at(-1)?.text).toContain("Чеки на проверке");
  });

  it("opens the next page through an opaque Show more action", async () => {
    const owner = await createActor("OWNER");
    for (let index = 0; index < 11; index += 1) {
      await createPendingBooking(owner, `Клиент ${String(index + 1).padStart(2, "0")}`, new Date(`2026-07-29T${String(8 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}:00.000Z`));
    }
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);
    await handleBusinessBotUpdate(owner.actor, messageUpdate("Записи"), dependencies);
    const pendingAction = findCallback(output.at(-1), "Ожидают оплату")!;

    output.length = 0;
    await handleBusinessBotUpdate(owner.actor, callbackUpdate("pending-page", pendingAction), dependencies);
    const showMore = findCallback(output.at(-1), "Показать ещё");
    expect(showMore).toBeTruthy();
    expect(showMore).not.toContain("cursor");

    output.length = 0;
    await handleBusinessBotUpdate(owner.actor, callbackUpdate("next-page", showMore!), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "next-page" });
    expect(output.at(-1)?.text).toContain("Клиент 11");
    expect(findCallback(output.at(-1), "Показать ещё")).toBeUndefined();
  });

  async function createActor(role: "OWNER" | "STAFF", workspace?: ActorFixture): Promise<ActorFixture> {
    if (!workspace) {
      const fixture = await createBookingFixture();
      businessIds.push(fixture.business.id);
      const fixtureMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
      userIds.push(fixtureMembership.userId);
      if (role === "STAFF") {
        return actorResult(fixture.business, fixture.branch.id, fixture.service.id, fixture.staff.id, fixtureMembership.id, fixtureMembership.userId, role);
      }
      const owner = await prisma.user.create({ data: { email: `handler-owner-${randomUUID()}@example.test`, displayName: "Owner" } });
      userIds.push(owner.id);
      const ownerMembership = await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role } });
      return actorResult(fixture.business, fixture.branch.id, fixture.service.id, fixture.staff.id, ownerMembership.id, owner.id, role);
    }

    const user = await prisma.user.create({ data: { email: `handler-staff-${randomUUID()}@example.test`, displayName: "Staff" } });
    userIds.push(user.id);
    const membership = await prisma.membership.create({ data: { businessId: workspace.actor.businessId, userId: user.id, role } });
    const staff = await prisma.staffMember.create({
      data: { businessId: workspace.actor.businessId, membershipId: membership.id, displayName: "Staff" },
    });
    return actorResult(workspace.business, workspace.branchId, workspace.serviceId, staff.id, membership.id, user.id, role, "9002");
  }

  function actorResult(
    business: { id: string; name: string; slug: string },
    branchId: string,
    serviceId: string,
    staffId: string,
    membershipId: string,
    userId: string,
    role: "OWNER" | "STAFF",
    telegramUserId = "9001",
  ) {
    const actor: BusinessBotPlatformActor = {
      membershipId,
      businessId: business.id,
      userId,
      role,
      business: { id: business.id, name: business.name, slug: business.slug },
      destination: { chatId: "-100900", chatType: "supergroup" },
      telegramUserId,
    };
    return { actor, business, branchId, serviceId, staffId };
  }

  async function createPendingBooking(
    fixture: Awaited<ReturnType<typeof createActor>>,
    customerName: string,
    startsAt = new Date("2026-07-29T08:00:00.000Z"),
    phone = `+992${randomUUID().replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`,
  ) {
    const customer = await prisma.customer.create({
      data: {
        businessId: fixture.actor.businessId,
        name: customerName,
        phone,
      },
    });
    return prisma.booking.create({
      data: {
        businessId: fixture.actor.businessId,
        branchId: fixture.branchId,
        serviceId: fixture.serviceId,
        staffId: fixture.staffId,
        customerId: customer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * 60_000),
        status: "PENDING_PAYMENT",
        payment: { create: { businessId: fixture.actor.businessId, amountDiram: 5_000 } },
      },
    });
  }
});

type ReplyMarkup = {
  inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  keyboard?: Array<Array<{ text: string }>>;
};

type ActorFixture = {
  actor: BusinessBotPlatformActor;
  business: { id: string; name: string; slug: string };
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

function fakeDependencies(output: Output[], options: { editFails?: boolean } = {}): BusinessBotHandlerDependencies {
  return {
    now: () => new Date("2026-07-29T07:00:00.000Z"),
    sendMessage: async (_chatId, text, replyMarkup) => { output.push({ kind: "send", text, replyMarkup }); },
    editMessageText: async (_message, text, replyMarkup) => {
      if (options.editFails) throw new Error("message cannot be edited");
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

function findUrl(output: Output | undefined, label: string) {
  return output?.replyMarkup?.inline_keyboard?.flat().find(({ text }) => text.includes(label))?.url;
}
