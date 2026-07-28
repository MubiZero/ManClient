import { requireBusinessAdmin } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { SettingsList } from "@/features/dashboard/settings-list";
export default async function BranchesPage() { const member = await requireBusinessAdmin(); const items = await prisma.branch.findMany({ where: { businessId: member.businessId }, orderBy: { name: "asc" } }); return <SettingsList title="Филиалы" description="Адреса работы, часовой пояс и карта для оплаты.">{items.map(item => <article key={item.id}><div><strong>{item.name}</strong><span>{item.timeZone}</span></div><span>{item.recipientCardLast4 ? `Карта ···· ${item.recipientCardLast4}` : "Карта не настроена"}</span></article>)}</SettingsList>; }
