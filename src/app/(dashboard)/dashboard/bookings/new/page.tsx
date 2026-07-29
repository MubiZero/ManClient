import { redirect } from "next/navigation";

import { requireBusinessSession } from "@/core/auth/business-session";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { createManualBooking } from "@/core/booking-operations/booking-command-service";
import { prisma } from "@/core/database/prisma";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { ManualBookingForm } from "@/features/dashboard/bookings/manual-booking-form";

type PageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewBookingPage({ searchParams }: PageProps) {
  const membership = await requireBusinessSession();
  const query = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: membership.businessId, archivedAt: null }, select: { id: true, name: true, timeZone: true }, orderBy: { name: "asc" } });
  const services = await prisma.service.findMany({ where: { branch: { businessId: membership.businessId, archivedAt: null }, archivedAt: null, isPublished: true }, select: { id: true, name: true, branchId: true, staffMembers: { where: { archivedAt: null, ...(membership.role === "STAFF" ? { id: membership.staff?.id ?? "__none__" } : {}) }, select: { id: true, displayName: true } } }, orderBy: { name: "asc" } });

  async function create(formData: FormData) {
    "use server";
    const current = await requireBusinessSession();
    try {
      const result = await createManualBooking({ businessId: current.businessId, actorUserId: current.userId, branchId: String(formData.get("branchId") ?? ""), serviceId: String(formData.get("serviceId") ?? ""), staffId: String(formData.get("staffId") ?? ""), startsAt: new Date(String(formData.get("startsAt") ?? "")), customer: { name: String(formData.get("customerName") ?? ""), phone: String(formData.get("customerPhone") ?? "") } });
      redirect(`/dashboard/bookings/${result.bookingId}?notice=created`);
    } catch (error) {
      if (error instanceof BookingOperationError) redirect(`/dashboard/bookings/new?error=${error.code}`);
      throw error;
    }
  }

  return <EntityListPage title="Создать запись" description="Добавьте клиента в свободное время без перехода на публичную страницу."><ManualBookingForm action={create} branches={branches} services={services} error={errorMessage(query.error)} /></EntityListPage>;
}

function errorMessage(code?: string) { return ({ INVALID_INPUT: "Проверьте имя и номер телефона клиента.", SLOT_UNAVAILABLE: "Это время уже занято или находится вне рабочего графика. Выберите другой слот.", NOT_FOUND: "Услуга, филиал или специалист больше недоступны.", FORBIDDEN: "У вас нет доступа к выбранному специалисту." } as Record<string, string>)[code ?? ""]; }
