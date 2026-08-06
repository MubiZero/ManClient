import { requireBusinessAdmin } from "@/core/auth/business-session";
import { getNotificationSettings } from "@/core/business-settings/notification-settings-service";
import { NotificationSettingsForm } from "@/features/dashboard/notification-settings-form";
import { PageHeader } from "@/features/ui-kit/page-header";

export default async function NotificationSettingsPage() {
  const membership = await requireBusinessAdmin();
  const settings = await getNotificationSettings(membership.businessId);

  return (
    <>
      <PageHeader
        eyebrow="Настройки"
        title="Уведомления"
        description="Выберите, о каких событиях бизнес получает уведомления. Правила отмены и переноса живут в разделе «Правила записи»."
      />
      <NotificationSettingsForm
        initial={{
          notifyOnNewBooking: settings.notifyOnNewBooking,
          notifyOnPaymentNeedsReview: settings.notifyOnPaymentNeedsReview,
          notifyOnCancellation: settings.notifyOnCancellation,
          smsNotificationsEnabled: settings.smsNotificationsEnabled,
          smsFeatureAvailable: settings.smsFeatureAvailable,
        }}
      />
    </>
  );
}
