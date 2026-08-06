import { requireBusinessAdmin } from "@/core/auth/business-session";
import { getBookingPolicySettings } from "@/core/business-settings/booking-policy-service";
import { BookingPolicyForm } from "@/features/dashboard/booking-policy-form";
import { PageHeader } from "@/features/ui-kit/page-header";

export default async function BookingPolicyPage() {
  const membership = await requireBusinessAdmin();
  const settings = await getBookingPolicySettings(membership.businessId);

  return (
    <>
      <PageHeader
        eyebrow="Настройки"
        title="Правила записи"
        description="Насколько заранее клиенты записываются, на сколько дней открыт календарь, сколько нужно оплатить при записи и когда клиент ещё может отменить визит сам. Правила действуют на публичной странице и в клиентском боте; сотрудники в кабинете ими не ограничены."
      />
      <BookingPolicyForm
        initial={{
          minLeadTimeMinutes: settings.minLeadTimeMinutes,
          maxAdvanceDays: settings.maxAdvanceDays,
          freeCancellationHours: settings.freeCancellationHours,
          maxCustomerReschedules: settings.maxCustomerReschedules,
          cancellationPolicy: settings.cancellationPolicy,
          prepaymentMode: settings.prepaymentMode,
          depositPercent: settings.depositPercent,
          depositAmountDiram: settings.depositAmountDiram,
        }}
      />
    </>
  );
}
