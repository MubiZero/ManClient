import { requireBusinessAdmin } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { SettingsList } from "@/features/dashboard/settings-list";
export default async function StaffPage() { const member = await requireBusinessAdmin(); const items = await prisma.staffMember.findMany({ where: { branch: { businessId: member.businessId } }, include: { branch: true }, orderBy: { displayName: "asc" } }); return <SettingsList title="Сотрудники" description="Специалисты и филиалы, где они принимают.">{items.map(item => <article key={item.id}><div><strong>{item.displayName}</strong><span>{item.branch.name}</span></div></article>)}</SettingsList>; }
