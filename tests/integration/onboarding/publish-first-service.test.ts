import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { archiveService, restoreService } from "@/core/business-settings/service-service";
import { prisma } from "@/core/database/prisma";
import { createFirstService } from "@/core/onboarding/create-first-service";
import { publishFirstServiceWhenReady } from "@/core/onboarding/publish-first-service";
import { registerBusiness } from "@/core/onboarding/register-business";

/**
 * The helper exists so a salon that filled in its schedule late does not have to publish by hand. The
 * danger is the mirror image: reaching back into a catalogue the owner has since taken charge of.
 */
describe("publishFirstServiceWhenReady", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  async function registerWithService() {
    const digits = randomUUID().replace(/\D/g, "").padEnd(8, "4").slice(0, 8);
    const owner = await registerBusiness({
      ownerName: "Владелец",
      phone: `+9929${digits}`,
      password: "12345678",
      businessName: `Бизнес ${digits}`,
    });
    businessIds.push(owner.businessId);
    userIds.push(owner.userId);
    const service = await createFirstService({
      businessId: owner.businessId,
      actorUserId: owner.userId,
      serviceName: "Стрижка",
      durationMinutes: "45",
      amountSomoni: "50.00",
    });
    return { ...owner, serviceId: service.id };
  }

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("leaves a service the owner archived and restored as the draft they left it", async () => {
    const { businessId, userId, serviceId } = await registerWithService();

    // Archiving unpublishes, restoring brings it back as a draft — the owner's way of taking a service
    // off the booking page without deleting it.
    await archiveService({ businessId, actorUserId: userId, serviceId });
    await restoreService({ businessId, actorUserId: userId, serviceId });
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).isPublished).toBe(false);

    // Saving something unrelated — a schedule, a specialist — must not undo that decision.
    await publishFirstServiceWhenReady(businessId);

    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).isPublished).toBe(false);
  });

  it("publishes the wizard's own service once the branch has hours and somebody to work them", async () => {
    const { businessId, serviceId } = await registerWithService();
    await prisma.service.update({ where: { id: serviceId }, data: { isPublished: false } });

    await publishFirstServiceWhenReady(businessId);

    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).isPublished).toBe(true);
  });

  it("leaves the service hidden while the branch has no opening hours to honour it with", async () => {
    const { businessId, serviceId } = await registerWithService();
    await prisma.service.update({ where: { id: serviceId }, data: { isPublished: false } });
    await prisma.businessScheduleRule.deleteMany({ where: { branch: { businessId } } });

    await publishFirstServiceWhenReady(businessId);

    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).isPublished).toBe(false);
  });

  it("answers rather than throws when it cannot finish, because the save it follows already committed", async () => {
    await expect(publishFirstServiceWhenReady("business-that-does-not-exist")).resolves.toBeUndefined();
  });
});
