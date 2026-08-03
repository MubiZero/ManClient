import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createBusinessBotAction, type BusinessBotActionKind } from "@/core/integrations/business-bot-actions";
import { listBusinessBotPaymentReviews } from "@/core/integrations/business-bot-query-service";
import { prisma } from "@/core/database/prisma";
import {
  approvePaymentReview,
  getPaymentReceiptForReview,
  rejectPaymentReview,
  PaymentReviewError,
} from "@/core/payments/payment-review-service";
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
  let receiptServer: Server;
  const originalStorageEnvironment = {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    accessKey: process.env.S3_ACCESS_KEY_ID,
    secretKey: process.env.S3_SECRET_ACCESS_KEY,
  };

  beforeAll(async () => {
    receiptServer = createServer((request, response) => {
      const path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      const key = path.replace(/^\/review-receipts\//, "");
      const body = receiptObjects.get(key);
      if (!body) {
        response.writeHead(404, { "content-type": "application/xml" });
        response.end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      response.writeHead(200, { "content-type": "image/jpeg", "content-length": String(body.byteLength) });
      response.end(Buffer.from(body));
    });
    await new Promise<void>((resolve, reject) => {
      receiptServer.once("error", reject);
      receiptServer.listen(0, "127.0.0.1", resolve);
    });
    const address = receiptServer.address() as AddressInfo;
    process.env.S3_ENDPOINT = `http://127.0.0.1:${address.port}`;
    process.env.S3_REGION = "test";
    process.env.S3_BUCKET = "review-receipts";
    process.env.S3_ACCESS_KEY_ID = "test-access-key";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => receiptServer.close(error => error ? reject(error) : resolve()));
    restoreEnvironment("S3_ENDPOINT", originalStorageEnvironment.endpoint);
    restoreEnvironment("S3_REGION", originalStorageEnvironment.region);
    restoreEnvironment("S3_BUCKET", originalStorageEnvironment.bucket);
    restoreEnvironment("S3_ACCESS_KEY_ID", originalStorageEnvironment.accessKey);
    restoreEnvironment("S3_SECRET_ACCESS_KEY", originalStorageEnvironment.secretKey);
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
    receiptObjects.clear();
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

  it("paginates equal updatedAt rows in exact updatedAt and id order without duplicates or gaps", async () => {
    const workspace = await createWorkspace("OWNER");
    const reviews = await Promise.all(Array.from({ length: 11 }, (_, index) => createReview(workspace, `Tie ${index + 1}`)));
    const tiedAt = new Date("2026-07-29T06:30:00.000Z");
    await prisma.payment.updateMany({
      where: { id: { in: reviews.map(review => review.payment.id) } },
      data: { updatedAt: tiedAt },
    });
    const expected = reviews.map(review => review.payment.id).sort();
    const actual: string[] = [];
    let cursor: string | null = null;

    do {
      const page = await listBusinessBotPaymentReviews(workspace.actor, cursor, 3);
      expect(page.items.every(item => item.updatedAt.getTime() === tiedAt.getTime())).toBe(true);
      actual.push(...page.items.map(item => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(expected.length);
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

  it("shows only a safe card tail and sends protected receipt bytes through the real accessor", async () => {
    const workspace = await createWorkspace("OWNER");
    const review = await createReview(workspace, "Чек с фото", {
      recipientCardSuffix: "1111222233339999",
      storageKey: "receipts/private/raw-secret-key.jpg",
      receiptBytes: new Uint8Array([1, 2, 3, 4]),
    });
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);

    const card = await openFirstReview(workspace.actor, dependencies, output);
    expect(card.text).toContain("•••• 9999");
    expect(JSON.stringify(card)).not.toContain("1111222233339999");
    expect(JSON.stringify(card)).not.toContain("raw-secret-key");

    output.length = 0;
    await handleBusinessBotUpdate(workspace.actor, callbackUpdate("photo", findCallback(card, "Показать чек")!), dependencies);
    expect(output[0]).toMatchObject({ kind: "answer", callbackId: "photo" });
    expect(output.at(-1)).toMatchObject({ kind: "photo", photo: [1, 2, 3, 4] });
    expect(JSON.stringify(output)).not.toContain("raw-secret-key");
  });

  it("protects receipt bytes from STAFF, another tenant and an unknown payment", async () => {
    const owner = await createWorkspace("OWNER");
    const foreignOwner = await createWorkspace("OWNER");
    const review = await createReview(owner, "Защищённый чек", { receiptBytes: new Uint8Array([4, 3, 2, 1]) });
    const ownerInput = { businessId: owner.business.id, actorUserId: owner.actor.userId, paymentId: review.payment.id };

    await expect(getPaymentReceiptForReview(ownerInput)).resolves.toMatchObject({ body: new Uint8Array([4, 3, 2, 1]) });
    await expect(getPaymentReceiptForReview({ ...ownerInput, actorUserId: owner.staffUserId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getPaymentReceiptForReview({
      businessId: foreignOwner.business.id,
      actorUserId: foreignOwner.actor.userId,
      paymentId: review.payment.id,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getPaymentReceiptForReview({ ...ownerInput, paymentId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("loads the same latest NEEDS_REVIEW submission that a decision processes", async () => {
    const workspace = await createWorkspace("OWNER");
    const review = await createReview(workspace, "Несколько чеков", {
      storageKey: "receipts/actionable.jpg",
      receiptBytes: new Uint8Array([1, 1, 1, 1]),
      submissionCreatedAt: new Date("2026-07-29T06:00:00.000Z"),
    });
    const newerKey = "receipts/newer-upload.jpg";
    receiptObjects.set(newerKey, new Uint8Array([9, 9, 9, 9]));
    const newer = await prisma.receiptSubmission.create({
      data: {
        businessId: workspace.business.id,
        paymentId: review.payment.id,
        storageKey: newerKey,
        contentType: "image/jpeg",
        sizeBytes: 4,
        status: "UPLOADED",
        createdAt: new Date("2026-07-29T06:30:00.000Z"),
      },
    });

    const receipt = await getPaymentReceiptForReview({
      businessId: workspace.business.id,
      actorUserId: workspace.actor.userId,
      paymentId: review.payment.id,
    });
    expect([...receipt.body]).toEqual([1, 1, 1, 1]);

    await approvePaymentReview({ businessId: workspace.business.id, actorUserId: workspace.actor.userId, paymentId: review.payment.id });
    await expect(prisma.receiptSubmission.findUniqueOrThrow({ where: { id: review.submission.id } })).resolves.toMatchObject({ status: "ACCEPTED" });
    await expect(prisma.receiptSubmission.findUniqueOrThrow({ where: { id: newer.id } })).resolves.toMatchObject({ status: "UPLOADED" });
  });

  it("expires a displayed decision when a newer review receipt appears", async () => {
    const workspace = await createWorkspace("OWNER");
    const review = await createReview(workspace, "Обновлённый чек", {
      submissionCreatedAt: new Date("2026-07-29T06:00:00.000Z"),
    });
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);
    const card = await openFirstReview(workspace.actor, dependencies, output);
    const confirmation = await invoke(
      workspace.actor,
      findCallback(card, "Подтвердить оплату")!,
      dependencies,
      output,
    );

    await prisma.receiptSubmission.create({
      data: {
        businessId: workspace.business.id,
        paymentId: review.payment.id,
        storageKey: "receipts/newer-review.jpg",
        contentType: "image/jpeg",
        sizeBytes: 4,
        status: "NEEDS_REVIEW",
        createdAt: new Date("2026-07-29T06:30:00.000Z"),
      },
    });

    const recovered = await invoke(
      workspace.actor,
      findCallback(confirmation, "Да, подтвердить")!,
      dependencies,
      output,
    );

    expect(recovered.text).toContain("Состояние изменилось");
    await expect(prisma.payment.findUniqueOrThrow({ where: { id: review.payment.id } }))
      .resolves.toMatchObject({ status: "NEEDS_ATTENTION" });
    await expect(prisma.auditEvent.count({
      where: { bookingId: review.booking.id, type: "payment.review_approved" },
    })).resolves.toBe(0);
  });

  it("hides decisions and reports the actual state when booking or actionable receipt changed", async () => {
    const workspace = await createWorkspace("OWNER");
    const changedBooking = await createReview(workspace, "Изменённая запись");
    await prisma.booking.update({ where: { id: changedBooking.booking.id }, data: { status: "CONFIRMED" } });
    const output: Output[] = [];
    const dependencies = fakeDependencies(output);
    const bookingCardAction = await createAction(workspace.actor, "payment.open", { paymentId: changedBooking.payment.id });

    const bookingCard = await invoke(workspace.actor, bookingCardAction, dependencies, output);
    expect(bookingCard.text).toContain("Текущее состояние: запись подтверждена; оплата требует проверки");
    expect(findCallback(bookingCard, "Подтвердить оплату")).toBeUndefined();
    expect(findCallback(bookingCard, "Отклонить чек")).toBeUndefined();
    expect(findCallback(bookingCard, "Обновить")).toBeTruthy();
    expect(findCallback(bookingCard, "К очереди")).toBeTruthy();

    const staleApprove = await createAction(workspace.actor, "PAYMENT_APPROVE_CONFIRM", {
      paymentId: changedBooking.payment.id,
      submissionId: changedBooking.submission.id,
    }, "MUTATION");
    const recovered = await invoke(workspace.actor, staleApprove, dependencies, output);
    expect(recovered.text).toContain("Текущее состояние: запись подтверждена; оплата требует проверки");
    expect(recovered.text).not.toContain("Чек уже обработан");
    expect(findCallback(recovered, "Подтвердить оплату")).toBeUndefined();

    const missingReceipt = await createReview(workspace, "Чек исчез");
    await prisma.receiptSubmission.update({ where: { id: missingReceipt.submission.id }, data: { status: "ACCEPTED" } });
    const missingAction = await createAction(workspace.actor, "payment.open", { paymentId: missingReceipt.payment.id });
    const missingCard = await invoke(workspace.actor, missingAction, dependencies, output);
    expect(missingCard.text).toContain("актуального чека на проверке нет");
    expect(findCallback(missingCard, "Подтвердить оплату")).toBeUndefined();
    expect(findCallback(missingCard, "Отклонить чек")).toBeUndefined();
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
      { channel: "TELEGRAM", kind: "PAYMENT_APPROVED", status: "SCHEDULED" },
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

  it("keeps concurrent duplicate rejection idempotent", async () => {
    const workspace = await createWorkspace("OWNER");
    const review = await createReview(workspace, "Двойное отклонение");
    const input = {
      businessId: workspace.business.id,
      actorUserId: workspace.actor.userId,
      paymentId: review.payment.id,
      reason: "Сумма не совпадает",
    };

    const results = await Promise.all([
      rejectPaymentReview(input, new Date("2026-07-29T07:00:00.000Z")),
      rejectPaymentReview(input, new Date("2026-07-29T07:00:00.000Z")),
    ]);

    expect(results.map(result => result.changed).sort()).toEqual([false, true]);
    await expect(prisma.auditEvent.count({ where: { bookingId: review.booking.id, type: "payment.review_rejected" } })).resolves.toBe(1);
    await expect(prisma.message.count({ where: { bookingId: review.booking.id } })).resolves.toBe(0);
  });

  it("rejects a stale rejection after the booking status changes", async () => {
    const workspace = await createWorkspace("OWNER");
    const review = await createReview(workspace, "Устаревшее отклонение");
    await prisma.booking.update({ where: { id: review.booking.id }, data: { status: "CANCELLED" } });

    await expect(rejectPaymentReview({
      businessId: workspace.business.id,
      actorUserId: workspace.actor.userId,
      paymentId: review.payment.id,
      submissionId: review.submission.id,
      reason: "Оплата не подтверждена банком",
    })).rejects.toMatchObject({ code: "INVALID_STATUS" });

    await expect(prisma.payment.findUniqueOrThrow({ where: { id: review.payment.id } }))
      .resolves.toMatchObject({ status: "NEEDS_ATTENTION" });
    await expect(prisma.receiptSubmission.findUniqueOrThrow({ where: { id: review.submission.id } }))
      .resolves.toMatchObject({ status: "NEEDS_REVIEW" });
  });

  it("allows exactly one outcome in an approve-versus-reject race", async () => {
    const workspace = await createWorkspace("OWNER", { customerNotifications: true });
    const review = await createReview(workspace, "Гонка решения", { telegramChatId: "race-customer" });
    const actorInput = { businessId: workspace.business.id, actorUserId: workspace.actor.userId, paymentId: review.payment.id };

    const results = await Promise.allSettled([
      approvePaymentReview(actorInput, new Date("2026-07-29T07:00:00.000Z")),
      rejectPaymentReview({ ...actorInput, reason: "Оплата не подтверждена банком" }, new Date("2026-07-29T07:00:00.000Z")),
    ]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: review.payment.id } });
    const audit = await prisma.auditEvent.findMany({
      where: { bookingId: review.booking.id, type: { in: ["payment.review_approved", "payment.review_rejected"] } },
    });
    const schedules = await prisma.message.findMany({ where: { bookingId: review.booking.id } });

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(["RECEIPT_ACCEPTED", "REJECTED"]).toContain(payment.status);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.type).toBe(payment.status === "RECEIPT_ACCEPTED" ? "payment.review_approved" : "payment.review_rejected");
    expect(schedules).toHaveLength(payment.status === "RECEIPT_ACCEPTED" ? 4 : 1);
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
      submissionId: review.submission.id,
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
    let membershipId = fixtureMembership.id;
    if (role !== "STAFF") {
      const user = await prisma.user.create({ data: { email: `payment-review-${randomUUID()}@example.test`, displayName: role } });
      userIds.push(user.id);
      userId = user.id;
      const membership = await prisma.membership.create({ data: { businessId: fixture.business.id, userId, role } });
      membershipId = membership.id;
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
      staffUserId: fixtureMembership.userId,
      actor: {
        membershipId,
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
    options: {
      recipientCardSuffix?: string;
      storageKey?: string;
      telegramChatId?: string;
      receiptBytes?: Uint8Array;
      submissionCreatedAt?: Date;
    } = {},
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
    const storageKey = options.storageKey ?? `receipts/${workspace.business.id}/${payment.id}/${randomUUID()}.jpg`;
    receiptObjects.set(storageKey, options.receiptBytes ?? new Uint8Array([1, 2, 3, 4]));
    const submission = await prisma.receiptSubmission.create({
      data: {
        businessId: workspace.business.id,
        paymentId: payment.id,
        storageKey,
        contentType: "image/jpeg",
        sizeBytes: 4,
        status: "NEEDS_REVIEW",
        ...(options.submissionCreatedAt ? { createdAt: options.submissionCreatedAt } : {}),
      },
    });
    return { booking, payment, submission };
  }
});

type Output = {
  kind: "send" | "edit" | "answer" | "photo";
  text?: string;
  callbackId?: string;
  replyMarkup?: TelegramReplyMarkup;
  photo?: number[];
};

function fakeDependencies(output: Output[]): BusinessBotHandlerDependencies {
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

const receiptObjects = new Map<string, Uint8Array>();

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
