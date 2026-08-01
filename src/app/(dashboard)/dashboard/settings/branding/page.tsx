import { requireBusinessAdmin } from "@/core/auth/business-session";
import { getBusinessBranding } from "@/core/business-settings/branding-service";
import { BrandingForm } from "@/features/dashboard/branding-form";
import { PageHeader } from "@/features/ui-kit/page-header";

export default async function BrandingPage() {
  const membership = await requireBusinessAdmin();
  const branding = await getBusinessBranding(membership.businessId);

  return (
    <>
      <PageHeader
        eyebrow="Настройки бизнеса"
        title="Брендинг"
        description="Логотип и фирменный цвет показываются клиентам на странице записи, оплаты и переноса."
      />
      <BrandingForm
        businessSlug={branding.slug}
        initialHasLogo={Boolean(branding.logoStorageKey)}
        initialBrandColor={branding.brandColor}
      />
    </>
  );
}
