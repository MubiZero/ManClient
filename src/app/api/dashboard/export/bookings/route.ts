import { requireBusinessSession } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { buildCsv, csvResponse } from "@/core/dashboard/csv-export";
import { formatSomoni } from "@/core/formatting/money";

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Ждёт оплаты",
  CONFIRMED: "Подтверждена",
  CANCELLED: "Отменена",
  EXPIRED: "Истекла",
};

export async function GET() {
  const membership = await requireBusinessSession();
  const bookings = await prisma.booking.findMany({
    where: {
      businessId: membership.businessId,
      ...(membership.role === "STAFF" ? { staffId: membership.staff?.id ?? "__none__" } : {}),
    },
    include: {
      customer: { select: { name: true, phone: true } },
      service: { select: { name: true, amountDiram: true } },
      staff: { select: { displayName: true } },
      payment: { select: { amountDiram: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 5000,
  });

  const rows = bookings.map((booking) => [
    booking.startsAt.toISOString(),
    booking.customer.name,
    booking.customer.phone,
    booking.service.name,
    booking.staff.displayName,
    STATUS_LABELS[booking.status] ?? booking.status,
    formatSomoni(booking.payment?.amountDiram ?? booking.service.amountDiram),
  ]);

  const csv = buildCsv(["Дата", "Клиент", "Телефон", "Услуга", "Специалист", "Статус", "Сумма"], rows);
  return csvResponse("bookings.csv", csv);
}
