import { whatsappTemplateFor } from "@/core/notifications/channel-ladder";
import { formatVisitTime, type Sender } from "@/core/notifications/delivery";

/**
 * Free like Telegram, but only inside somebody else's rules: WhatsApp carries pre-approved templates
 * with numbered slots, so the wording belongs to Meta's moderation and all we choose is which
 * template and what goes in the blanks.
 */
export const sendOnWhatsApp: Sender = async ({ kind, target }, dependencies) => {
  const business = target.business;
  if (!business.whatsappPhoneNumberId) return { delivered: false, unavailable: "WhatsApp business settings are unavailable" };

  const templateName = whatsappTemplateFor(kind, business);
  if (!templateName) return { delivered: false, unavailable: `no approved WhatsApp template for ${kind}` };

  const { externalId } = await dependencies.sendWhatsApp({
    phoneNumberId: business.whatsappPhoneNumberId,
    to: target.customer.phone,
    templateName,
    languageCode: business.whatsappLanguageCode,
    parameters: [target.customer.name, formatVisitTime(target.occursAt, target.timeZone), target.serviceName],
  });
  return { delivered: true, externalId };
};
