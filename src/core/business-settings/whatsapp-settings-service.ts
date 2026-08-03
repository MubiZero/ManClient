import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { whatsappSettingsSchema } from "@/core/business-settings/setting-schemas";
import { SettingsError } from "@/core/business-settings/settings-error";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";

export async function getWhatsAppSettings(businessId: string) {
  return prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: {
      whatsappPhoneNumberId: true,
      whatsappTemplateName: true,
      whatsappConfirmationTemplateName: true,
      whatsappCancellationTemplateName: true,
      whatsappLanguageCode: true,
    },
  });
}

export async function updateWhatsAppSettings(input: {
  businessId: string;
  actorUserId: string;
  phoneNumberId?: string;
  templateName?: string;
  confirmationTemplateName?: string;
  cancellationTemplateName?: string;
  languageCode?: string;
}) {
  const parsed = whatsappSettingsSchema.safeParse({
    phoneNumberId: input.phoneNumberId,
    templateName: input.templateName,
    confirmationTemplateName: input.confirmationTemplateName,
    cancellationTemplateName: input.cancellationTemplateName,
    languageCode: input.languageCode,
  });
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");

  return prisma.$transaction(async (transaction) => {
    await requireSettingsAccess(transaction, input);
    const updated = await transaction.business.update({
      where: { id: input.businessId },
      data: {
        whatsappPhoneNumberId: parsed.data.phoneNumberId ?? null,
        whatsappTemplateName: parsed.data.templateName ?? null,
        whatsappConfirmationTemplateName: parsed.data.confirmationTemplateName ?? null,
        whatsappCancellationTemplateName: parsed.data.cancellationTemplateName ?? null,
        whatsappLanguageCode: parsed.data.languageCode,
      },
      select: {
        whatsappPhoneNumberId: true,
        whatsappTemplateName: true,
        whatsappConfirmationTemplateName: true,
        whatsappCancellationTemplateName: true,
        whatsappLanguageCode: true,
      },
    });
    await writeAuditEvent({ businessId: input.businessId, type: "whatsapp.updated", actorType: "user", actorId: input.actorUserId }, transaction);
    return updated;
  });
}
