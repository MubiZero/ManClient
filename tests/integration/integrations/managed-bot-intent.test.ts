import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import {
  claimManagedBotIntent,
  completeManagedBotIntent,
  createManagedBotIntent,
} from "@/core/integrations/managed-bot-intent";

describe("managed customer bot connection intent", () => {
  const businessIds: string[] = [];
  const now = new Date("2026-07-30T08:00:00.000Z");

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("creates one pending intent for a linked owner and expires the previous one", async () => {
    const actor = await createActor("OWNER", "7001");

    const first = await createManagedBotIntent(actor, {
      displayName: "Salon Client",
      suggestedUsername: "salon_client_bot",
    }, now);
    const second = await createManagedBotIntent(actor, {
      displayName: "Salon Booking",
      suggestedUsername: "salon_booking_bot",
    }, new Date(now.getTime() + 1_000));

    await expect(prisma.managedBotConnectionIntent.findUniqueOrThrow({ where: { id: first.id } }))
      .resolves.toMatchObject({ status: "EXPIRED" });
    expect(second).toMatchObject({
      businessId: actor.businessId,
      membershipId: actor.membershipId,
      telegramUserId: "7001",
      status: "PENDING",
    });
  });

  it("rejects staff before storing an intent", async () => {
    const actor = await createActor("STAFF", "7002");

    await expect(createManagedBotIntent(actor, {
      displayName: "Staff Bot",
      suggestedUsername: "staff_customer_bot",
    }, now)).rejects.toThrow("not allowed");
    await expect(prisma.managedBotConnectionIntent.count({ where: { businessId: actor.businessId } }))
      .resolves.toBe(0);
  });

  it("claims only a current intent created by the same Telegram user", async () => {
    const actor = await createActor("ADMIN", "7003");
    const intent = await createManagedBotIntent(actor, {
      displayName: "Admin Bot",
      suggestedUsername: "admin_customer_bot",
    }, now);

    await expect(claimManagedBotIntent({ telegramUserId: "9999", botId: "9001" }, now))
      .rejects.toThrow("not found");
    await expect(claimManagedBotIntent({ telegramUserId: "7003", botId: "9001" }, now))
      .resolves.toMatchObject({ id: intent.id, businessId: actor.businessId });

    await completeManagedBotIntent(intent.id, "9001", now);
    await expect(completeManagedBotIntent(intent.id, "9001", now)).resolves.toMatchObject({ status: "COMPLETED" });
  });

  async function createActor(role: "OWNER" | "ADMIN" | "STAFF", telegramUserId: string) {
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { id: `managed-business-${suffix}`, name: "Managed Business", slug: `managed-${suffix}` },
    });
    businessIds.push(business.id);
    const user = await prisma.user.create({
      data: { email: `managed-${suffix}@example.test`, displayName: "Managed Owner" },
    });
    const membership = await prisma.membership.create({
      data: { businessId: business.id, userId: user.id, role },
    });
    await prisma.businessTelegramIdentity.create({
      data: { membershipId: membership.id, telegramUserId },
    });
    return {
      membershipId: membership.id,
      businessId: business.id,
      userId: user.id,
      role,
      telegramUserId,
    };
  }
});
