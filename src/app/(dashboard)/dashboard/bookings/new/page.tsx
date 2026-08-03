import { redirect } from "next/navigation";

import { requireBusinessSession } from "@/core/auth/business-session";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { createManualBooking } from "@/core/booking-operations/booking-command-service";
import { createRecurringBooking } from "@/core/bookings/recurring-booking-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { businessHasFeature } from "@/core/platform/subscription-plans";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { ManualBookingForm } from "@/features/dashboard/bookings/manual-booking-form";

type PageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewBookingPage({ searchParams }: PageProps) {
  const membership = await requireBusinessSession();
  const query = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, name: true, timeZone: true }, orderBy: { name: "asc" } });
  const services = await prisma.service.findMany({ where: { branch: { businessId: membership.businessId, archivedAt: null }, archivedAt: null, isPublished: true }, select: { id: true, name: true, branchId: true, staffMembers: { where: { archivedAt: null, ...(membership.role === "STAFF" ? { id: membership.staff?.id ?? "__none__" } : {}) }, select: { id: true, displayName: true } } }, orderBy: { name: "asc" } });
  const business = await prisma.business.findUniqueOrThrow({ where: { id: membership.businessId }, select: { subscriptionPlan: true } });
  const canRepeat = businessHasFeature(business.subscriptionPlan, "RECURRING_BOOKINGS");

  async function create(formData: FormData) {
    "use server";
    const current = await requireBusinessSession();
    const repeatEnabled = canRepeat && formData.get("repeatEnabled") === "on";
    try {
      if (repeatEnabled) {
        const result = await createRecurringBooking({
          businessId: current.businessId,
          actorUserId: current.userId,
          branchId: String(formData.get("branchId") ?? ""),
          serviceId: String(formData.get("serviceId") ?? ""),
          staffId: String(formData.get("staffId") ?? ""),
          startsAt: new Date(String(formData.get("startsAt") ?? "")),
          customer: { name: String(formData.get("customerName") ?? ""), phone: String(formData.get("customerPhone") ?? "") },
          frequency: String(formData.get("repeatFrequency") ?? "WEEKLY") as "WEEKLY" | "BIWEEKLY" | "MONTHLY",
          occurrencesTotal: Number(formData.get("repeatCount") ?? 4),
          source: "DASHBOARD",
        });
        const firstBookingId = result.created[0]?.id;
        if (!firstBookingId) redirect(`/dashboard/bookings/new?error=SLOT_UNAVAILABLE`);
        redirect(`/dashboard/bookings/${firstBookingId}?notice=created`);
      }
      const result = await createManualBooking({ businessId: current.businessId, actorUserId: current.userId, branchId: String(formData.get("branchId") ?? ""), serviceId: String(formData.get("serviceId") ?? ""), staffId: String(formData.get("staffId") ?? ""), startsAt: new Date(String(formData.get("startsAt") ?? "")), customer: { name: String(formData.get("customerName") ?? ""), phone: String(formData.get("customerPhone") ?? "") } });
      redirect(`/dashboard/bookings/${result.bookingId}?notice=created`);
    } catch (error) {
      if (error instanceof BookingOperationError) redirect(`/dashboard/bookings/new?error=${error.code}`);
      if (error instanceof SettingsError) redirect(`/dashboard/bookings/new?error=${error.code}`);
      throw error;
    }
  }

  return <EntityListPage title="Создать запись" description="Добавьте клиента в свободное время без перехода на публичную страницу."><ManualBookingForm action={create} branches={branches} services={services} error={errorMessage(query.error)} canRepeat={canRepeat} /></EntityListPage>;
}

function errorMessage(code?: string) { return ({ INVALID_INPUT: "Проверьте имя и номер телефона клиента.", SLOT_UNAVAILABLE: "Это время уже занято или находится вне рабочего графика. Выберите другой слот.", NOT_FOUND: "Услуга, филиал или специалист больше недоступны.", FORBIDDEN: "У вас нет доступа к выбранному специалисту.", PLAN_REQUIRED: "Повторяющиеся записи доступны только на тарифе Премиум." } as Record<string, string>)[code ?? ""]; }
