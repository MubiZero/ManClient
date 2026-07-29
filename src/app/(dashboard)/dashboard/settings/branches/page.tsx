import { requireBusinessAdmin } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { SettingsList } from "@/features/dashboard/settings-list";
import { updateBranchProfile } from "@/core/onboarding/update-branch-profile";
import { revalidatePath } from "next/cache";

export default async function BranchesPage() {
  const member = await requireBusinessAdmin();
  const items = await prisma.branch.findMany({ where: { businessId: member.businessId }, orderBy: { name: "asc" } });

  async function rename(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    await updateBranchProfile({
      businessId: current.businessId,
      actorUserId: current.userId,
      branchId: String(formData.get("branchId") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/dashboard/settings/branches");
  }

  return <SettingsList title="Филиалы" description="Название точки, часовой пояс и карта для оплаты.">{items.map(item => <article className="branch-profile-row" key={item.id}><form action={rename}><input type="hidden" name="branchId" value={item.id} /><label className="field-label">Название филиала<input className="text-input" name="name" defaultValue={item.name} required minLength={2} maxLength={120} /></label><button className="secondary-action" type="submit">Сохранить название</button></form><div><strong>{item.timeZone}</strong><span>{item.recipientCardLast4 ? `Карта ···· ${item.recipientCardLast4}` : "Карта настраивается при первом запуске"}</span></div></article>)}</SettingsList>;
}
