import { requireBusinessAdmin } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { buildCsv, csvResponse } from "@/core/dashboard/csv-export";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  STAFF: "Специалист",
};

export async function GET() {
  const membership = await requireBusinessAdmin();
  const staff = await prisma.staffMember.findMany({
    where: { businessId: membership.businessId },
    include: {
      membership: { select: { role: true } },
      branches: { include: { branch: { select: { name: true } } } },
    },
    orderBy: [{ archivedAt: "asc" }, { displayName: "asc" }],
  });

  const rows = staff.map((item) => [
    item.displayName,
    item.phone ?? "",
    item.membership ? (ROLE_LABELS[item.membership.role] ?? item.membership.role) : "Без доступа",
    item.branches.map(({ branch }) => branch.name).join("; "),
    item.archivedAt ? "В архиве" : "Активен",
  ]);

  const csv = buildCsv(["Имя", "Телефон", "Роль", "Филиалы", "Статус"], rows);
  return csvResponse("staff.csv", csv);
}
