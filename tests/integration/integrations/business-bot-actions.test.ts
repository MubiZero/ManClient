import { afterEach, describe, expect, it } from "vitest";

import {
  consumeBusinessBotAction,
  createBusinessBotAction,
  type BusinessBotActionActor,
} from "@/core/integrations/business-bot-actions";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("business bot opaque actions", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("consumes a mutation exactly once under concurrent delivery", async () => {
    const actor = await createActor();
    const now = new Date("2026-07-29T07:00:00.000Z");
    const action = await createBusinessBotAction(actor, {
      kind: "booking.confirm",
      payload: { bookingId: "opaque-server-payload" },
      expiresAt: new Date(now.getTime() + 60_000),
      mode: "MUTATION",
    });

    const attempts = await Promise.allSettled([
      consumeBusinessBotAction(actor, action.actionId, now),
      consumeBusinessBotAction(actor, action.actionId, now),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(consumeBusinessBotAction(actor, action.actionId, now)).rejects.toThrow("invalid or expired");
  });

  it("denies expired, wrong chat, wrong business and wrong actor consumption", async () => {
    const actor = await createActor();
    const otherBusinessActor = await createActor();
    const now = new Date("2026-07-29T07:00:00.000Z");
    const expired = await createBusinessBotAction(actor, {
      kind: "bookings.list",
      expiresAt: new Date(now.getTime() + 1_000),
    });
    const active = await createBusinessBotAction(actor, {
      kind: "bookings.list",
      expiresAt: new Date(now.getTime() + 60_000),
    });

    await expect(consumeBusinessBotAction(actor, expired.actionId, new Date(now.getTime() + 1_000))).rejects.toThrow("invalid or expired");
    await expect(consumeBusinessBotAction({
      ...actor,
      destination: { chatId: "different-chat" },
    }, active.actionId, now)).rejects.toThrow("invalid or expired");
    await expect(consumeBusinessBotAction(otherBusinessActor, active.actionId, now)).rejects.toThrow("invalid or expired");
    await expect(consumeBusinessBotAction({
      ...actor,
      userId: `${actor.userId}-different`,
    }, active.actionId, now)).rejects.toThrow("invalid or expired");
  });

  async function createActor(): Promise<BusinessBotActionActor> {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
    userIds.push(membership.userId);
    return {
      businessId: fixture.business.id,
      userId: membership.userId,
      telegramUserId: `telegram-${fixture.business.id}`,
      destination: { chatId: `chat-${fixture.business.id}` },
    };
  }
});
