import { requireBusinessAdmin } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { SettingsList } from "@/features/dashboard/settings-list";
export default async function StaffPage() { const member = await requireBusinessAdmin(); const items = await prisma.staffMember.findMany({ where: { businessId: member.businessId, archivedAt: null }, include: { branches: { include: { branch: true }, orderBy: { isPrimary: "desc" } } }, orderBy: { displayName: "asc" } }); return <SettingsList title="Сотрудники" description="Специалисты и филиалы, где они принимают.">{items.map(item => <article key={item.id}><div><strong>{item.displayName}</strong><span>{item.branches.map(({ branch }) => branch.name).join(", ")}</span></div></article>)}</SettingsList>; }
