import type { Sender } from "@/core/notifications/delivery";
import { buildPayomVariables, findPayomTemplateKind } from "@/integrations/payom/payom-templates";

/**
 * The last rung: the only channel that reaches a customer with no apps at all, and the only one that
 * costs the platform money on every send. Everything above it exists so that this one is reached
 * rarely.
 */
export const sendOnSms: Sender = async ({ kind, target }, dependencies) => {
  const templateKind = findPayomTemplateKind(kind);
  if (!templateKind) return { delivered: false, unavailable: `no approved SMS template for ${kind}` };

  const template = buildPayomVariables(templateKind, target.customer.telegramLocale, {
    businessName: target.business.name,
    startsAt: target.occursAt,
    timeZone: target.timeZone,
  });
  const { externalId } = await dependencies.sendSms({ telephone: target.customer.phone, ...template });
  return { delivered: true, externalId };
};
