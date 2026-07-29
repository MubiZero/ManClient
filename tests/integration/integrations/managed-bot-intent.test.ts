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
      .resolves.toMatchObject({ id: intent.id, businessId: actor.businessId, status: "PROCESSING" });

    await expect(claimManagedBotIntent({ telegramUserId: "7003", botId: "9001" }, now))
      .rejects.toThrow("is processing");

    await completeManagedBotIntent(intent.id, "9001", now);
    await expect(completeManagedBotIntent(intent.id, "9001", now)).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("allows only one concurrent worker to claim an intent", async () => {
    const actor = await createActor("OWNER", "7004");
    await createManagedBotIntent(actor, {
      displayName: "Concurrent Bot",
      suggestedUsername: "concurrent_customer_bot",
    }, now);

    const results = await Promise.allSettled([
      claimManagedBotIntent({ telegramUserId: "7004", botId: "9002" }, now),
      claimManagedBotIntent({ telegramUserId: "7004", botId: "9002" }, now),
    ]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });

  it("reclaims a stale processing intent for the same managed bot", async () => {
    const actor = await createActor("OWNER", "7008");
    const intent = await createManagedBotIntent(actor, {
      displayName: "Recoverable Bot",
      suggestedUsername: "recoverable_customer_bot",
    }, now);
    await claimManagedBotIntent({ telegramUserId: "7008", botId: "9008" }, now);
    await prisma.managedBotConnectionIntent.update({
      where: { id: intent.id },
      data: { processingStartedAt: new Date(now.getTime() - 61_000) },
    });

    await expect(claimManagedBotIntent({ telegramUserId: "7008", botId: "9008" }, now))
      .resolves.toMatchObject({ id: intent.id, status: "PROCESSING", botId: "9008" });
  });

  it("rejects an expired intent and an owner whose membership was revoked", async () => {
    const expired = await createActor("OWNER", "7005");
    await createManagedBotIntent(expired, { displayName: "Expired", suggestedUsername: "expired_customer_bot" }, now);
    await expect(claimManagedBotIntent({ telegramUserId: "7005", botId: "9003" }, new Date(now.getTime() + 31 * 60_000)))
      .rejects.toThrow("not found");

    const revoked = await createActor("OWNER", "7006");
    await createManagedBotIntent(revoked, { displayName: "Revoked", suggestedUsername: "revoked_customer_bot" }, now);
    await prisma.membership.delete({ where: { id: revoked.membershipId } });
    await expect(claimManagedBotIntent({ telegramUserId: "7006", botId: "9004" }, now))
      .rejects.toThrow("not found");
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
