import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  connectTelegramForDashboard,
  disconnectTelegramForDashboard,
  getTelegramDashboardStatus,
  TelegramDashboardError,
  type TelegramApiFactory,
} from "@/core/integrations/telegram-dashboard-service";
import { prisma } from "@/core/database/prisma";

const encryptionKey = Buffer.alloc(32, 19).toString("base64");

describe("Telegram dashboard API service", () => {
  const businessIds: string[] = [];

  beforeEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = encryptionKey;
    process.env.APP_URL = "https://manclient.example";
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
  });

  it("derives the business from the signed-in user and never returns credentials", async () => {
    const fixture = await createBusiness("OWNER");
    const result = await connectTelegramForDashboard(
      fixture.user.email,
      { token: "20001:dashboard-secret" },
      fakeFactory({ id: 20001, username: "salon_customer_bot" }),
    );

    expect(result).toEqual({
      status: "ACTIVE",
      botUsername: "salon_customer_bot",
      connectedAt: expect.any(Date),
      lastWebhookError: null,
    });
    expect(JSON.stringify(result)).not.toContain("dashboard-secret");
    expect(await getTelegramDashboardStatus(fixture.user.email)).toEqual(result);
  });

  it("rejects staff and unknown users without revealing tenant state", async () => {
    const staff = await createBusiness("STAFF");

    await expect(connectTelegramForDashboard(
      staff.user.email,
      { token: "20002:dashboard-secret" },
      fakeFactory({ id: 20002, username: "staff_bot" }),
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getTelegramDashboardStatus("missing@example.test"))
      .rejects.toBeInstanceOf(TelegramDashboardError);
  });

  it("validates token input and disconnects without returning stored secrets", async () => {
    const fixture = await createBusiness("ADMIN");
    await expect(connectTelegramForDashboard(fixture.user.email, { token: " " }, fakeFactory({ id: 1, username: "x_bot" })))
      .rejects.toMatchObject({ code: "INVALID_BOT_TOKEN" });

    const factory = fakeFactory({ id: 20003, username: "service_bot" });
    await connectTelegramForDashboard(fixture.user.email, { token: "20003:dashboard-secret" }, factory);
    const result = await disconnectTelegramForDashboard(fixture.user.email, factory);

    expect(result).toEqual({ status: "DISCONNECTED", botUsername: null, connectedAt: null, lastWebhookError: null });
    expect(JSON.stringify(result)).not.toContain("dashboard-secret");
  });

  async function createBusiness(role: "OWNER" | "ADMIN" | "STAFF") {
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { id: `dashboard-telegram-${suffix}`, name: "Dashboard Business", slug: `dashboard-${suffix}` },
    });
    businessIds.push(business.id);
    const user = await prisma.user.create({
      data: { email: `dashboard-${suffix}@example.test`, displayName: "Manager" },
    });
    await prisma.membership.create({ data: { businessId: business.id, userId: user.id, role } });
    return { business, user };
  }
});

function fakeFactory(identity: { id: number; username: string }): TelegramApiFactory {
  return () => ({
    async getMe() { return { ...identity, isBot: true as const }; },
    async setWebhook() {},
    async deleteWebhook() {},
  });
}
