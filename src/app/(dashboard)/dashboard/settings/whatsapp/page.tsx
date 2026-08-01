import { requireBusinessAdmin } from "@/core/auth/business-session";
import { getWhatsAppSettings } from "@/core/business-settings/whatsapp-settings-service";
import { WhatsAppSettingsForm } from "@/features/dashboard/whatsapp-settings-form";
import { PageHeader } from "@/features/ui-kit/page-header";

export default async function WhatsAppSettingsPage() {
  const membership = await requireBusinessAdmin();
  const settings = await getWhatsAppSettings(membership.businessId);

  return (
    <>
      <PageHeader
        eyebrow="Каналы записи"
        title="WhatsApp"
        description="Укажите Phone Number ID и одобренные шаблоны WhatsApp Cloud API, чтобы отправлять клиентам подтверждения и напоминания."
      />
      <WhatsAppSettingsForm
        initial={{
          phoneNumberId: settings.whatsappPhoneNumberId,
          templateName: settings.whatsappTemplateName,
          confirmationTemplateName: settings.whatsappConfirmationTemplateName,
          languageCode: settings.whatsappLanguageCode,
        }}
      />
    </>
  );
}
