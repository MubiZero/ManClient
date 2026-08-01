import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getBusinessBranding, updateBusinessBranding } from "@/core/business-settings/branding-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { registerBusiness } from "@/core/onboarding/register-business";

describe("business branding", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  let businessId: string;
  let actorUserId: string;

  const fakeStore = new Map<string, { body: Uint8Array; contentType: string }>();
  const dependencies = {
    async storeLogo(businessIdForKey: string, body: Uint8Array, contentType: string) {
      const storageKey = `logos/${businessIdForKey}.png`;
      fakeStore.set(storageKey, { body, contentType });
      return storageKey;
    },
    async deleteLogo(storageKey: string) {
      fakeStore.delete(storageKey);
    },
  };

  beforeEach(async () => {
    const suffix = randomUUID().replace(/\D/g, "").padEnd(8, "7").slice(0, 8);
    const registered = await registerBusiness({
      ownerName: "Владелец",
      phone: `+9929${suffix}`,
      password: "safe-password",
      businessName: "Салон Брендинг",
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

  it("saves a brand color and a resized logo", async () => {
    const logo = await logoFile();
    const updated = await updateBusinessBranding({ businessId, actorUserId, brandColor: "#176B45", logoFile: logo }, dependencies);

    expect(updated.brandColor).toBe("#176B45");
    expect(updated.logoStorageKey).toBe(`logos/${businessId}.png`);
    expect(fakeStore.has(`logos/${businessId}.png`)).toBe(true);

    const branding = await getBusinessBranding(businessId);
    expect(branding).toMatchObject({ brandColor: "#176B45", logoStorageKey: `logos/${businessId}.png` });
  });

  it("removes a logo without touching the brand color", async () => {
    await updateBusinessBranding({ businessId, actorUserId, brandColor: "#176B45", logoFile: await logoFile() }, dependencies);
    const updated = await updateBusinessBranding({ businessId, actorUserId, removeLogo: true }, dependencies);

    expect(updated.logoStorageKey).toBeNull();
    expect(updated.brandColor).toBe("#176B45");
    expect(fakeStore.has(`logos/${businessId}.png`)).toBe(false);
  });

  it("rejects a malformed hex color", async () => {
    await expect(updateBusinessBranding({ businessId, actorUserId, brandColor: "green" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
  });

  it("rejects a non-image logo upload", async () => {
    const notAnImage = new File([new Uint8Array([1, 2, 3, 4])], "logo.png", { type: "image/png" });
    await expect(updateBusinessBranding({ businessId, actorUserId, logoFile: notAnImage }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
  });

  it("keeps staff from updating branding", async () => {
    const suffix = randomUUID();
    const staffUser = await prisma.user.create({ data: { email: `staff-${suffix}@example.test`, displayName: "Сотрудник" } });
    userIds.push(staffUser.id);
    await prisma.membership.create({ data: { businessId, userId: staffUser.id, role: "STAFF" } });

    await expect(updateBusinessBranding({ businessId, actorUserId: staffUser.id, brandColor: "#176B45" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<SettingsError>);
  });
});

async function logoFile(): Promise<File> {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 20, g: 120, b: 70 } } }).png().toBuffer();
  return new File([new Uint8Array(png)], "logo.png", { type: "image/png" });
}
