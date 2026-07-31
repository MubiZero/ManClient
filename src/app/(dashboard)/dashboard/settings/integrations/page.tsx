import { requireBusinessAdmin } from "@/core/auth/business-session";
import { getBusinessTelegramStatus } from "@/core/integrations/business-telegram-service";
import { getPlatformTelegramCapability } from "@/core/integrations/platform-telegram-capability";
import type { TelegramDashboardStatus } from "@/core/integrations/telegram-dashboard-service";
import { TelegramIntegrationForm } from "@/features/dashboard/telegram-integration-form";
import { PageHeader } from "@/features/ui-kit/page-header";

export default async function IntegrationsPage() {
  const membership = await requireBusinessAdmin();
  const [current, capability] = await Promise.all([
    getBusinessTelegramStatus(membership.businessId),
    getPlatformTelegramCapability(),
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
        description="Бизнес создаёт одного Telegram-бота для клиентов. Владельцы и сотрудники используют общий бизнес-ассистент @manclient_bot."
      />
      <TelegramIntegrationForm initialStatus={initialStatus} managedBotsAvailable={capability.managedBotsAvailable} />
    </>
  );
}
