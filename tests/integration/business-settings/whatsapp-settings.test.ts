import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getWhatsAppSettings, updateWhatsAppSettings } from "@/core/business-settings/whatsapp-settings-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { registerBusiness } from "@/core/onboarding/register-business";

describe("business WhatsApp settings", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  let businessId: string;
  let actorUserId: string;

  beforeEach(async () => {
    const suffix = randomUUID().replace(/\D/g, "").padEnd(8, "8").slice(0, 8);
    const registered = await registerBusiness({
      ownerName: "Владелец",
      phone: `+9929${suffix}`,
      password: "safe-password",
      businessName: "Салон WhatsApp",
    });
    businessId = registered.businessId;
    actorUserId = registered.userId;
    businessIds.push(businessId);
    userIds.push(actorUserId);
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("saves phone number id, templates and language", async () => {
    const updated = await updateWhatsAppSettings({
      businessId,
      actorUserId,
      phoneNumberId: "1234567890",
      templateName: "booking_reminder",
      confirmationTemplateName: "booking_confirmed",
      languageCode: "tg",
    });

    expect(updated).toEqual({
      whatsappPhoneNumberId: "1234567890",
      whatsappTemplateName: "booking_reminder",
      whatsappConfirmationTemplateName: "booking_confirmed",
      whatsappLanguageCode: "tg",
    });

    const settings = await getWhatsAppSettings(businessId);
    expect(settings).toEqual(updated);
  });

  it("defaults an unset language code to Russian", async () => {
    const updated = await updateWhatsAppSettings({ businessId, actorUserId, phoneNumberId: "1234567890" });
    expect(updated.whatsappLanguageCode).toBe("ru");
  });

  it("clears fields left blank", async () => {
    await updateWhatsAppSettings({ businessId, actorUserId, phoneNumberId: "1234567890", templateName: "reminder" });
    const cleared = await updateWhatsAppSettings({ businessId, actorUserId, phoneNumberId: "" });

    expect(cleared.whatsappPhoneNumberId).toBeNull();
    expect(cleared.whatsappTemplateName).toBeNull();
  });

  it("rejects an unsupported language code", async () => {
    await expect(updateWhatsAppSettings({ businessId, actorUserId, languageCode: "en" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
  });

  it("keeps staff from updating WhatsApp settings", async () => {
    const suffix = randomUUID();
    const staffUser = await prisma.user.create({ data: { email: `staff-${suffix}@example.test`, displayName: "Сотрудник" } });
    userIds.push(staffUser.id);
    await prisma.membership.create({ data: { businessId, userId: staffUser.id, role: "STAFF" } });

    await expect(updateWhatsAppSettings({ businessId, actorUserId: staffUser.id, phoneNumberId: "1234567890" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<SettingsError>);
  });
});
