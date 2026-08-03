import { requireBusinessAdmin } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { buildCsv, csvResponse } from "@/core/dashboard/csv-export";
import { formatSomoni } from "@/core/formatting/money";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Не оплачено",
  RECEIPT_PROCESSING: "Чек на проверке",
  RECEIPT_ACCEPTED: "Чек принят",
  NEEDS_ATTENTION: "Проверить чек",
  REJECTED: "Отклонён",
};

export async function GET() {
  const membership = await requireBusinessAdmin();
  const payments = await prisma.payment.findMany({
    where: { businessId: membership.businessId },
    include: {
      booking: {
        select: {
          startsAt: true,
          customer: { select: { name: true, phone: true } },
          service: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const rows = payments.map((payment) => [
    payment.booking.startsAt.toISOString(),
    payment.booking.customer.name,
    payment.booking.customer.phone,
    payment.booking.service.name,
    STATUS_LABELS[payment.status] ?? payment.status,
    formatSomoni(payment.amountDiram),
  ]);

  const csv = buildCsv(["Дата записи", "Клиент", "Телефон", "Услуга", "Статус", "Сумма"], rows);
  return csvResponse("payments.csv", csv);
}
