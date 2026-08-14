import { requireBusinessSession } from "@/core/auth/business-session";
import { getBusinessTelegramStatus } from "@/core/integrations/business-telegram-service";
import { getPlatformTelegramCapability } from "@/core/integrations/platform-telegram-capability";
import type { TelegramDashboardStatus } from "@/core/integrations/telegram-dashboard-service";
import { TelegramIntegrationForm } from "@/features/dashboard/telegram-integration-form";
import { PageHeader } from "@/features/ui-kit/page-header";

/**
 * Open to every role: the staff bot is where a master reads today's visits, and linking a chat only ever
 * links the requester's own membership. Only the customer bot, which belongs to the business, stays with
 * owners and administrators.
 */
export default async function IntegrationsPage() {
  const membership = await requireBusinessSession();
  const canManageCustomerBot = membership.role !== "STAFF";
  const [current, capability] = await Promise.all([
    canManageCustomerBot ? getBusinessTelegramStatus(membership.businessId) : null,
    canManageCustomerBot ? getPlatformTelegramCapability() : { managedBotsAvailable: false },
  ]);
  const initialStatus: TelegramDashboardStatus = current ? {
    status: current.status === "DISCONNECTED" ? "DISCONNECTED" : current.status,
    botUsername: current.botUsername,
    connectedAt: current.connectedAt,
    lastWebhookError: current.lastWebhookError,
  } : { status: "DISCONNECTED", botUsername: null, connectedAt: null, lastWebhookError: null };

  return (
    <>
      <PageHeader
        eyebrow="Каналы записи"
        title="Telegram"
        description={canManageCustomerBot
          ? "Бизнес создаёт одного Telegram-бота для клиентов. Владельцы и сотрудники используют общий бизнес-ассистент @manclient_bot."
          : "Привяжите свой Telegram, чтобы получать записи и работать с расписанием прямо в @manclient_bot."}
      />
      <TelegramIntegrationForm
        initialStatus={initialStatus}
        managedBotsAvailable={capability.managedBotsAvailable}
        canManageCustomerBot={canManageCustomerBot}
      />
    </>
  );
}
