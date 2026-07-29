import Link from "next/link";
import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { SettingsError } from "@/core/business-settings/settings-error";
import { archiveStaff, createStaff, restoreStaff, updateStaff } from "@/core/business-settings/staff-service";
import { prisma } from "@/core/database/prisma";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { StaffForm } from "@/features/dashboard/staff-form";
import { Dialog } from "@/features/ui/dialog";
import { EmptyState } from "@/features/ui/empty-state";
import { LinkButton } from "@/features/ui/button";
import { StatusBadge } from "@/features/ui/status-badge";
import { SubmitButton } from "@/features/ui/submit-button";

type PageProps = { searchParams: Promise<{ action?: string; edit?: string; archive?: string; error?: string; notice?: string }> };

export default async function StaffPage({ searchParams }: PageProps) {
  const member = await requireBusinessAdmin();
  const query = await searchParams;
  const [items, branches, services] = await Promise.all([
    prisma.staffMember.findMany({ where: { businessId: member.businessId }, include: { membership: true, branches: { include: { branch: true }, orderBy: { isPrimary: "desc" } }, services: true }, orderBy: [{ archivedAt: "asc" }, { displayName: "asc" }] }),
    prisma.branch.findMany({ where: { businessId: member.businessId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.service.findMany({ where: { branch: { businessId: member.businessId }, archivedAt: null }, select: { id: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
  ]);
  const editing = query.edit ? items.find(item => item.id === query.edit) : undefined;
  const archiving = query.archive ? items.find(item => item.id === query.archive && !item.archivedAt) : undefined;

  async function create(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); try { await createStaff({ businessId: current.businessId, actorUserId: current.userId, ...staffValues(formData) }); } catch (error) { redirect(`/dashboard/settings/staff?action=new&error=${errorCode(error)}`); } redirect("/dashboard/settings/staff?notice=created"); }
  async function update(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); const staffId = String(formData.get("staffId") ?? ""); try { await updateStaff({ businessId: current.businessId, actorUserId: current.userId, staffId, ...staffValues(formData) }); } catch (error) { redirect(`/dashboard/settings/staff?edit=${encodeURIComponent(staffId)}&error=${errorCode(error)}`); } redirect("/dashboard/settings/staff?notice=updated"); }
  async function archive(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); try { await archiveStaff({ businessId: current.businessId, actorUserId: current.userId, staffId: String(formData.get("staffId") ?? "") }); } catch (error) { redirect(`/dashboard/settings/staff?error=${errorCode(error)}`); } redirect("/dashboard/settings/staff?notice=archived"); }
  async function restore(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); await restoreStaff({ businessId: current.businessId, actorUserId: current.userId, staffId: String(formData.get("staffId") ?? "") }); redirect("/dashboard/settings/staff?notice=restored"); }

  if (query.action === "new") return <EntityListPage title="Новый специалист" description="Добавьте человека, к которому смогут записываться клиенты."><StaffForm action={create} branches={branches} services={services} error={errorMessage(query.error)} /></EntityListPage>;
  if (editing) { const primary = editing.branches.find(item => item.isPrimary) ?? editing.branches[0]; return <EntityListPage title="Изменить специалиста" description="Обновите филиалы, услуги и контактные данные."><StaffForm action={update} branches={branches} services={services} staff={{ id: editing.id, displayName: editing.displayName, phone: editing.phone, branchIds: editing.branches.map(item => item.branchId), primaryBranchId: primary?.branchId ?? branches[0]?.id ?? "", serviceIds: editing.services.map(item => item.id) }} error={errorMessage(query.error)} /></EntityListPage>; }

  return <EntityListPage title="Команда" description="Специалисты, филиалы и услуги, по которым они принимают клиентов." action={<LinkButton href="/dashboard/settings/staff?action=new">Создать специалиста</LinkButton>} notice={noticeMessage(query.notice)} error={errorMessage(query.error)}>
    {items.length ? <div className="entity-list">{items.map(item => <article key={item.id} className={item.archivedAt ? "is-archived" : undefined}><div className="entity-list-main"><div><strong>{item.displayName}</strong><StatusBadge tone={item.archivedAt ? "neutral" : "success"}>{item.archivedAt ? "В архиве" : "Принимает"}</StatusBadge><StatusBadge tone={item.membership ? "info" : "neutral"}>{item.membership ? "Есть доступ" : "Без доступа"}</StatusBadge></div><span>{item.branches.map(({ branch }) => branch.name).join(", ")}</span><small>{item.services.length ? item.services.map(service => service.name).join(", ") : "Услуги пока не назначены"}</small></div><div className="entity-row-actions">{item.archivedAt ? <form action={restore}><input type="hidden" name="staffId" value={item.id} /><SubmitButton idle="Восстановить" pending="Восстанавливаем" variant="secondary" /></form> : <><Link className="ui-button ui-button-quiet" href={`/dashboard/settings/staff?edit=${item.id}`}>Изменить</Link><Link className="ui-button ui-button-quiet entity-archive-link" href={`/dashboard/settings/staff?archive=${item.id}`}>Архивировать</Link></>}</div></article>)}</div> : <EmptyState title="Добавьте первого специалиста" description="Назначьте его на филиал и услугу, чтобы открыть запись." action={<LinkButton href="/dashboard/settings/staff?action=new">Создать специалиста</LinkButton>} />}
    <Dialog open={Boolean(archiving)} title={`Архивировать ${archiving?.displayName ?? "специалиста"}?`} description="Новые клиенты не смогут выбрать специалиста, а история визитов сохранится."><LinkButton variant="quiet" href="/dashboard/settings/staff">Оставить специалиста</LinkButton>{archiving ? <form action={archive}><input type="hidden" name="staffId" value={archiving.id} /><SubmitButton idle="Архивировать специалиста" pending="Архивируем" variant="danger" /></form> : null}</Dialog>
  </EntityListPage>;
}

function staffValues(formData: FormData) { return { displayName: String(formData.get("displayName") ?? ""), phone: String(formData.get("phone") ?? ""), branchIds: formData.getAll("branchIds").map(String), primaryBranchId: String(formData.get("primaryBranchId") ?? ""), serviceIds: formData.getAll("serviceIds").map(String) }; }
function errorCode(error: unknown) { return error instanceof SettingsError ? error.code : "INVALID_INPUT"; }
function errorMessage(code?: string) { return ({ INVALID_INPUT: "Выберите хотя бы один филиал и убедитесь, что основной филиал отмечен.", FUTURE_BOOKINGS: "Сначала перенесите или отмените будущие записи специалиста.", NOT_FOUND: "Специалист не найден или уже недоступен." } as Record<string, string>)[code ?? ""]; }
function noticeMessage(code?: string) { return ({ created: "Специалист создан", updated: "Изменения сохранены", archived: "Специалист архивирован", restored: "Специалист восстановлен" } as Record<string, string>)[code ?? ""]; }
