import { requireBusinessAdmin } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { SettingsList } from "@/features/dashboard/settings-list";

export default async function ServicesPage() { const member = await requireBusinessAdmin(); const items = await prisma.service.findMany({ where: { branch: { businessId: member.businessId } }, include: { branch: true }, orderBy: { name: "asc" } }); return <SettingsList title="Услуги" description="Цена и длительность услуг в филиалах.">{items.map(item => <article key={item.id}><div><strong>{item.name}</strong><span>{item.branch.name}</span></div><span>{item.durationMinutes} мин · {(item.amountDiram / 100).toFixed(2)} TJS</span></article>)}</SettingsList>; }
