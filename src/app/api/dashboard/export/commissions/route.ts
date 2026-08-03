import { requireBusinessAdmin } from "@/core/auth/business-session";
import { buildCsv, csvResponse } from "@/core/dashboard/csv-export";
import { listCommissionEntriesForExport } from "@/core/dashboard/commission-report";
import { formatSomoni } from "@/core/formatting/money";

export async function GET() {
  const membership = await requireBusinessAdmin();
  const entries = await listCommissionEntriesForExport(membership.businessId);

  const rows = entries.map((entry) => [
    entry.booking.startsAt.toISOString(),
    entry.staff.displayName,
    entry.booking.service.name,
    entry.booking.customer.name,
    entry.percent,
    formatSomoni(entry.amountDiram),
  ]);

  const csv = buildCsv(["Дата записи", "Специалист", "Услуга", "Клиент", "%", "Сумма"], rows);
  return csvResponse("commissions.csv", csv);
}
