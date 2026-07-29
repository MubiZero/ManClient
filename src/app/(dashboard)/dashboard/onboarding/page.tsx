import { requireBusinessAdmin } from "@/core/auth/business-session";
import { createFirstService, updateFirstService } from "@/core/onboarding/create-first-service";
import { prisma } from "@/core/database/prisma";
import { OnboardingStepError } from "@/core/onboarding/onboarding-step-error";
import { savePaymentCard } from "@/core/onboarding/save-payment-card";
import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";
import { OnboardingProgress } from "@/features/onboarding/onboarding-progress";
import { PaymentSetupForm } from "@/features/onboarding/payment-setup-form";
import { ServiceSetupForm } from "@/features/onboarding/service-setup-form";
import { redirect } from "next/navigation";

type OnboardingPageProps = { searchParams: Promise<{ error?: string; step?: string }> };

export default async function DashboardOnboardingPage({ searchParams }: OnboardingPageProps) {
  const membership = await requireBusinessAdmin();
  const { error, step: requestedStep } = await searchParams;
  const [business, service, branch] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: membership.businessId }, select: { slug: true } }),
    prisma.service.findFirst({ where: { branch: { businessId: membership.businessId } }, orderBy: { createdAt: "asc" } }),
    prisma.branch.findFirst({ where: { businessId: membership.businessId }, orderBy: { createdAt: "asc" }, select: { recipientCardEncrypted: true } }),
  ]);
  const currentStep: 1 | 2 | 3 = branch?.recipientCardEncrypted ? 3 : service && requestedStep !== "service" ? 2 : 1;

  async function saveService(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    try {
      const values = {
        businessId: current.businessId,
        actorUserId: current.userId,
        serviceName: String(formData.get("serviceName") ?? ""),
        durationMinutes: String(formData.get("durationMinutes") ?? ""),
        amountSomoni: String(formData.get("amountSomoni") ?? "").replace(",", "."),
      };
      const serviceId = String(formData.get("serviceId") ?? "");
      if (serviceId) await updateFirstService({ ...values, serviceId });
      else await createFirstService(values);
    } catch (caught) {
      if (caught instanceof OnboardingStepError) {
        if (caught.code === "ALREADY_COMPLETED") redirect("/dashboard/onboarding");
        redirect("/dashboard/onboarding?step=service&error=service");
      }
      throw caught;
    }
    redirect("/dashboard/onboarding");
  }

  async function saveCard(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    try {
      await savePaymentCard({
        businessId: current.businessId,
        actorUserId: current.userId,
        recipientCard: String(formData.get("recipientCard") ?? ""),
      });
    } catch (caught) {
      if (caught instanceof OnboardingStepError) {
        if (caught.code === "ALREADY_COMPLETED") redirect("/dashboard/onboarding");
        redirect("/dashboard/onboarding?error=card");
      }
      throw caught;
    }
    redirect("/dashboard/onboarding");
  }

  return (
    <section className="dashboard-content onboarding-page">
      <div className="page-heading"><div><p className="context-label">Первые шаги</p><h1>Подготовьте бизнес к записи</h1><p>Осталось настроить услугу и получение оплаты. Каждый шаг сохраняется отдельно.</p></div></div>
      <div className="onboarding-wizard">
        <OnboardingProgress currentStep={currentStep} />
        {currentStep === 1 ? <ServiceSetupForm action={saveService} service={service ?? undefined} error={error === "service" ? "Проверьте название, длительность и стоимость услуги." : undefined} /> : null}
        {currentStep === 2 ? <PaymentSetupForm action={saveCard} error={error === "card" ? "Введите 16 цифр карты DushanbeCity и попробуйте ещё раз." : undefined} /> : null}
        {currentStep === 3 ? <OnboardingChecklist businessSlug={business.slug} /> : null}
      </div>
    </section>
  );
}
