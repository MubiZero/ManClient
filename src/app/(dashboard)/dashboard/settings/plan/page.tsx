import { requireBusinessAdmin } from "@/core/auth/business-session";
import { getBusinessPlanSummary } from "@/core/platform/subscription-plans";
import { PLAN_DESCRIPTIONS, PLAN_LABELS, type PlanFeature } from "@/core/platform/subscription-plans";
import { Badge } from "@/features/ui-kit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { PageHeader } from "@/features/ui-kit/page-header";

const FEATURE_LABELS: Record<PlanFeature, string> = {
  SMS: "SMS-уведомления",
  WAITLIST: "Лист ожидания",
  PROMO_CODES: "Промокоды",
  RECURRING_BOOKINGS: "Повторяющиеся записи",
  STAFF_COMMISSIONS: "Комиссии персонала",
  REVIEWS: "Отзывы и рейтинги",
};

export default async function PlanSettingsPage() {
  const membership = await requireBusinessAdmin();
  const { plan, features } = await getBusinessPlanSummary(membership.businessId);

  return (
    <>
      <PageHeader eyebrow="Настройки" title="Тариф" description="Изменить тариф может только администратор платформы." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {PLAN_LABELS[plan]}
            <Badge variant="neutral">Текущий тариф</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{PLAN_DESCRIPTIONS[plan]}</p>
          {features.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {features.map((feature) => (
                <Badge key={feature} variant="success">
                  {FEATURE_LABELS[feature]}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
