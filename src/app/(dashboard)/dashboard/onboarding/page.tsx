import { requireBusinessAdmin } from "@/core/auth/business-session";
import { createFirstService, updateFirstService } from "@/core/onboarding/create-first-service";
import { prisma } from "@/core/database/prisma";
import { OnboardingStepError } from "@/core/onboarding/onboarding-step-error";
import { savePaymentCard, skipPaymentSetup } from "@/core/onboarding/save-payment-card";
import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";
import { OnboardingProgress } from "@/features/onboarding/onboarding-progress";
import { PaymentSetupForm } from "@/features/onboarding/payment-setup-form";
import { ServiceSetupForm } from "@/features/onboarding/service-setup-form";
import { PageHeader } from "@/features/ui-kit/page-header";
import { redirect } from "next/navigation";

type OnboardingPageProps = { searchParams: Promise<{ error?: string; step?: string }> };

export default async function DashboardOnboardingPage({ searchParams }: OnboardingPageProps) {
  const membership = await requireBusinessAdmin();
  const { error, step: requestedStep } = await searchParams;
  const [business, service, branch, staffCount, scheduleCount, telegramCount, paidServiceCount] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: membership.businessId }, select: { slug: true, prepaymentMode: true, paymentSetupSkippedAt: true } }),
    prisma.service.findFirst({ where: { branch: { businessId: membership.businessId }, archivedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.branch.findFirst({ where: { businessId: membership.businessId, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { recipientCardEncrypted: true } }),
    prisma.staffMember.count({ where: { businessId: membership.businessId, archivedAt: null } }),
    prisma.businessScheduleRule.count({ where: { branch: { businessId: membership.businessId, archivedAt: null } } }),
    prisma.businessTelegramIntegration.count({ where: { businessId: membership.businessId, status: "ACTIVE" } }),
    prisma.service.count({ where: { branch: { businessId: membership.businessId }, archivedAt: null, prepaymentMode: { in: ["FULL", "DEPOSIT"] } } }),
  ]);
  // The step is behind the owner once they have either entered a card or said they take payment on the
  // premises. Without the second half a salon on the default NONE would sit on this step forever.
  const cardSaved = Boolean(branch?.recipientCardEncrypted);
  const paymentDecided = cardSaved || Boolean(business.paymentSetupSkippedAt);
  // Where the data says the owner has got to, and which of the earlier steps are still worth opening.
  // The service can be corrected for as long as the wizard is on screen; the card can be entered only
  // once, so a salon that already gave one is sent to branch settings instead of a form that no-ops.
  const furthestStep: 1 | 2 | 3 = paymentDecided ? 3 : service ? 2 : 1;
  const openSteps: (1 | 2 | 3)[] = [1];
  if (service && !cardSaved) openSteps.push(2);
  if (paymentDecided) openSteps.push(3);
  const requested = requestedStep === "service" ? 1 : requestedStep === "payment" ? 2 : requestedStep === "launch" ? 3 : null;
  const currentStep: 1 | 2 | 3 = requested && openSteps.includes(requested) ? requested : furthestStep;
  // A card is only missing if something would actually ask for money — the business rule, or one service
  // overriding it. Otherwise there is nothing to fix and nothing to nag about.
  const prepaymentExpected = business.prepaymentMode !== "NONE" || paidServiceCount > 0;

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

  async function skipCard() {
    "use server";
    const current = await requireBusinessAdmin();
    await skipPaymentSetup({ businessId: current.businessId, actorUserId: current.userId });
    redirect("/dashboard/onboarding");
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Первые шаги"
        title="Подготовьте бизнес к записи"
        description="Осталось настроить услугу и получение оплаты. Каждый шаг сохраняется отдельно."
      />
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <OnboardingProgress currentStep={currentStep} openSteps={openSteps} />
        {currentStep === 1 ? <ServiceSetupForm action={saveService} service={service ?? undefined} error={error === "service" ? "Проверьте название, длительность и стоимость услуги." : undefined} /> : null}
        {currentStep === 2 ? <PaymentSetupForm action={saveCard} skipAction={skipCard} error={error === "card" ? "Введите 16 цифр карты DushanbeCity и попробуйте ещё раз." : undefined} /> : null}
        {currentStep === 3 ? <OnboardingChecklist businessSlug={business.slug} readiness={{
          service: Boolean(service?.isPublished),
          staff: staffCount > 0,
          schedule: scheduleCount > 0,
          payment: !prepaymentExpected || cardSaved,
          telegram: telegramCount > 0,
        }} /> : null}
      </div>
    </section>
  );
}
