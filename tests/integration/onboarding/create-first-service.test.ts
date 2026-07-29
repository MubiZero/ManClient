import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { createFirstService, updateFirstService } from "@/core/onboarding/create-first-service";
import { OnboardingStepError } from "@/core/onboarding/onboarding-step-error";
import { registerBusiness } from "@/core/onboarding/register-business";

describe("createFirstService", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  async function register() {
    const digits = randomUUID().replace(/\D/g, "").padEnd(8, "4").slice(0, 8);
    const result = await registerBusiness({
      ownerName: "Владелец",
      phone: `+9929${digits}`,
      password: "12345678",
      businessName: `Бизнес ${digits}`,
    });
    businessIds.push(result.businessId);
    userIds.push(result.userId);
    return result;
  }

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("creates one priced service connected to the owner staff profile", async () => {
    const registered = await register();

    await createFirstService({
      businessId: registered.businessId,
      actorUserId: registered.userId,
      serviceName: "  Мужская стрижка  ",
      durationMinutes: "45",
      amountSomoni: "50.00",
    });

    const services = await prisma.service.findMany({
      where: { branch: { businessId: registered.businessId } },
      include: { staffMembers: true },
    });
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({ name: "Мужская стрижка", durationMinutes: 45, amountDiram: 5000 });
    expect(services[0].staffMembers).toHaveLength(1);
  });

  it("does not create a duplicate when the step is submitted again", async () => {
    const registered = await register();
    const input = {
      businessId: registered.businessId,
      actorUserId: registered.userId,
      serviceName: "Стрижка",
      durationMinutes: "45",
      amountSomoni: "50",
    };

    await createFirstService(input);
    await expect(createFirstService(input)).rejects.toMatchObject({ code: "ALREADY_COMPLETED" });
    await expect(prisma.service.count({ where: { branch: { businessId: registered.businessId } } })).resolves.toBe(1);
  });

  it("updates the saved first service without creating another one", async () => {
    const registered = await register();
    const service = await createFirstService({
      businessId: registered.businessId,
      actorUserId: registered.userId,
      serviceName: "Стрижка",
      durationMinutes: "45",
      amountSomoni: "50",
    });

    await updateFirstService({
      businessId: registered.businessId,
      actorUserId: registered.userId,
      serviceId: service.id,
      serviceName: "Стрижка и укладка",
      durationMinutes: "60",
      amountSomoni: "75",
    });

    await expect(prisma.service.findMany({ where: { branch: { businessId: registered.businessId } } }))
      .resolves.toMatchObject([{ id: service.id, name: "Стрижка и укладка", durationMinutes: 60, amountDiram: 7500 }]);
  });

  it("rejects a staff member", async () => {
    const registered = await register();
    const staffUser = await prisma.user.create({ data: { displayName: "Сотрудник" } });
    userIds.push(staffUser.id);
    await prisma.membership.create({ data: { businessId: registered.businessId, userId: staffUser.id, role: "STAFF" } });

    await expect(createFirstService({
      businessId: registered.businessId,
      actorUserId: staffUser.id,
      serviceName: "Стрижка",
      durationMinutes: "45",
      amountSomoni: "50",
    })).rejects.toBeInstanceOf(OnboardingStepError);
  });
});
