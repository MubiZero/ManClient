import { requireBusinessAdmin } from "@/core/auth/business-session";
import { completeBusinessSetup, BusinessSetupError } from "@/core/onboarding/complete-business-setup";
import { prisma } from "@/core/database/prisma";
import { BusinessSetupForm } from "@/features/onboarding/business-setup-form";
import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";
import { redirect } from "next/navigation";

type OnboardingPageProps = { searchParams: Promise<{ error?: string }> };

export default async function DashboardOnboardingPage({ searchParams }: OnboardingPageProps) {
  const membership = await requireBusinessAdmin();
  const { error } = await searchParams;
  const ready = await prisma.service.count({ where: { branch: { businessId: membership.businessId } } }) > 0
    && await prisma.branch.count({ where: { businessId: membership.businessId, recipientCardEncrypted: { not: null } } }) > 0;

  async function setup(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    try {
      await completeBusinessSetup({
        businessId: current.businessId,
        actorUserId: current.userId,
        serviceName: String(formData.get("serviceName") ?? ""),
        durationMinutes: String(formData.get("durationMinutes") ?? ""),
        amountSomoni: String(formData.get("amountSomoni") ?? "").replace(",", "."),
        recipientCard: String(formData.get("recipientCard") ?? ""),
      });
    } catch (caught) {
      if (caught instanceof BusinessSetupError) redirect("/dashboard/onboarding?error=input");
      throw caught;
    }
    redirect("/dashboard/onboarding");
  }

  return (
    <section className="dashboard-content onboarding-page">
      <div className="page-heading"><div><p className="context-label">Первые шаги</p><h1>Подготовьте бизнес к записи</h1><p>Кабинет и основной филиал уже созданы. Завершите настройку в удобном порядке.</p></div></div>
      {ready
        ? <OnboardingChecklist />
        : <BusinessSetupForm action={setup} error={error ? "Проверьте услугу, стоимость и 16-значный номер карты." : undefined} />}
    </section>
  );
}
