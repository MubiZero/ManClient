import sharp from "sharp";

import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { brandColorSchema } from "@/core/business-settings/setting-schemas";
import { SettingsError } from "@/core/business-settings/settings-error";
import * as brandingStorage from "@/core/business-settings/branding-storage";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_PIXELS = 24_000_000;
const LOGO_DIMENSION = 512;

type BrandingDependencies = {
  storeLogo: typeof brandingStorage.storeLogo;
  deleteLogo: typeof brandingStorage.deleteLogo;
};

const defaultDependencies: BrandingDependencies = { storeLogo: brandingStorage.storeLogo, deleteLogo: brandingStorage.deleteLogo };

export async function getBusinessBranding(businessId: string) {
  return prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { slug: true, logoStorageKey: true, brandColor: true },
  });
}

export async function updateBusinessBranding(input: {
  businessId: string;
  actorUserId: string;
  logoFile?: File;
  removeLogo?: boolean;
  brandColor?: string;
}, dependencies: BrandingDependencies = defaultDependencies) {
  const brandColor = input.brandColor !== undefined ? parseBrandColor(input.brandColor) : undefined;
  const normalizedLogo = input.logoFile ? await normalizeLogoImage(input.logoFile) : null;

  return prisma.$transaction(async (transaction) => {
    await requireSettingsAccess(transaction, input);
    const current = await transaction.business.findUniqueOrThrow({
      where: { id: input.businessId },
      select: { logoStorageKey: true },
    });

    let logoStorageKey = current.logoStorageKey;
    if (normalizedLogo) {
      logoStorageKey = await dependencies.storeLogo(input.businessId, normalizedLogo.body, normalizedLogo.contentType);
    } else if (input.removeLogo && current.logoStorageKey) {
      await dependencies.deleteLogo(current.logoStorageKey);
      logoStorageKey = null;
    }

    const updated = await transaction.business.update({
      where: { id: input.businessId },
      data: {
        logoStorageKey,
        ...(brandColor !== undefined ? { brandColor } : {}),
      },
      select: { logoStorageKey: true, brandColor: true },
    });
    await writeAuditEvent({ businessId: input.businessId, type: "branding.updated", actorType: "USER", actorId: input.actorUserId }, transaction);
    return updated;
  });
}

async function normalizeLogoImage(file: File): Promise<{ body: Uint8Array; contentType: "image/png" }> {
  if (file.size === 0 || file.size > MAX_LOGO_BYTES) throw new SettingsError("INVALID_INPUT");
  const input = new Uint8Array(await file.arrayBuffer());
  try {
    const image = sharp(input, { limitInputPixels: MAX_LOGO_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
      throw new Error("unsupported image");
    }
    const body = await image.rotate().resize(LOGO_DIMENSION, LOGO_DIMENSION, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return { body, contentType: "image/png" };
  } catch {
    throw new SettingsError("INVALID_INPUT");
  }
}

function parseBrandColor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = brandColorSchema.safeParse(trimmed);
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");
  return parsed.data;
}
