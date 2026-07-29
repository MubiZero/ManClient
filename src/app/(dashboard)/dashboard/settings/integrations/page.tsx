import { requireBusinessAdmin } from "@/core/auth/business-session";
import { getBusinessTelegramStatus } from "@/core/integrations/business-telegram-service";
import type { TelegramDashboardStatus } from "@/core/integrations/telegram-dashboard-service";
import { TelegramIntegrationForm } from "@/features/dashboard/telegram-integration-form";

export default async function IntegrationsPage() {
  const membership = await requireBusinessAdmin();
  const current = await getBusinessTelegramStatus(membership.businessId);
  const initialStatus: TelegramDashboardStatus = current ? {
    status: current.status === "DISCONNECTED" ? "DISCONNECTED" : current.status,
    botUsername: current.botUsername,
    connectedAt: current.connectedAt,
    lastWebhookError: current.lastWebhookError,
  } : { status: "DISCONNECTED", botUsername: null, connectedAt: null, lastWebhookError: null };

  return (
    <section className="dashboard-content integration-settings-page">
      <div className="page-heading">
        <div>
          <p className="context-label">Каналы записи</p>
          <h1>Telegram для клиентов</h1>
          <p>Подключите собственного бота бизнеса. Клиенты будут записываться через него, а данные останутся внутри вашего кабинета.</p>
        </div>
      </div>
      <TelegramIntegrationForm initialStatus={initialStatus} />
    </section>
  );
}
