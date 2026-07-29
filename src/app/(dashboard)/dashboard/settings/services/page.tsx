import Link from "next/link";
import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { archiveService, createService, duplicateService, restoreService, updateService } from "@/core/business-settings/service-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { formatSomoni } from "@/core/formatting/money";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { ServiceForm } from "@/features/dashboard/service-form";
import { Dialog } from "@/features/ui/dialog";
import { EmptyState } from "@/features/ui/empty-state";
import { LinkButton } from "@/features/ui/button";
import { StatusBadge } from "@/features/ui/status-badge";
import { SubmitButton } from "@/features/ui/submit-button";

type PageProps = { searchParams: Promise<{ action?: string; edit?: string; archive?: string; error?: string; notice?: string }> };

export default async function ServicesPage({ searchParams }: PageProps) {
  const member = await requireBusinessAdmin();
  const query = await searchParams;
  const [items, branches, staff, resources] = await Promise.all([
    prisma.service.findMany({ where: { branch: { businessId: member.businessId } }, include: { branch: true, staffMembers: true, resources: { include: { resource: true } } }, orderBy: [{ archivedAt: "asc" }, { name: "asc" }] }),
    prisma.branch.findMany({ where: { businessId: member.businessId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.staffMember.findMany({ where: { businessId: member.businessId, archivedAt: null }, include: { branches: { include: { branch: true } } }, orderBy: { displayName: "asc" } }),
    prisma.resource.findMany({ where: { branch: { businessId: member.businessId }, archivedAt: null }, select: { id: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
  ]);
  const editing = query.edit ? items.find(item => item.id === query.edit) : undefined;
  const archiving = query.archive ? items.find(item => item.id === query.archive && !item.archivedAt) : undefined;
  const formStaff = staff.map(item => ({ id: item.id, displayName: item.displayName, branchNames: item.branches.map(({ branch }) => branch.name) }));

  async function create(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); try { await createService({ businessId: current.businessId, actorUserId: current.userId, ...serviceValues(formData) }); } catch (error) { redirect(`/dashboard/settings/services?action=new&error=${errorCode(error)}`); } redirect("/dashboard/settings/services?notice=created"); }
  async function update(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); const serviceId = String(formData.get("serviceId") ?? ""); try { await updateService({ businessId: current.businessId, actorUserId: current.userId, serviceId, ...serviceValues(formData) }); } catch (error) { redirect(`/dashboard/settings/services?edit=${encodeURIComponent(serviceId)}&error=${errorCode(error)}`); } redirect("/dashboard/settings/services?notice=updated"); }
  async function archive(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); try { await archiveService({ businessId: current.businessId, actorUserId: current.userId, serviceId: String(formData.get("serviceId") ?? "") }); } catch (error) { redirect(`/dashboard/settings/services?error=${errorCode(error)}`); } redirect("/dashboard/settings/services?notice=archived"); }
  async function restore(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); await restoreService({ businessId: current.businessId, actorUserId: current.userId, serviceId: String(formData.get("serviceId") ?? "") }); redirect("/dashboard/settings/services?notice=restored"); }
  async function duplicate(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); await duplicateService({ businessId: current.businessId, actorUserId: current.userId, serviceId: String(formData.get("serviceId") ?? "") }); redirect("/dashboard/settings/services?notice=duplicated"); }

  if (query.action === "new") return <EntityListPage title="Новая услуга" description="Настройте предложение для клиентов."><ServiceForm action={create} branches={branches} staff={formStaff} resources={resources} error={errorMessage(query.error)} /></EntityListPage>;
  if (editing) return <EntityListPage title="Изменить услугу" description="Обновите цену, длительность и назначения."><ServiceForm action={update} branches={branches} staff={formStaff} resources={resources} service={{ id: editing.id, branchId: editing.branchId, name: editing.name, description: editing.description, durationMinutes: editing.durationMinutes, amountDiram: editing.amountDiram, isPublished: editing.isPublished, staffIds: editing.staffMembers.map(item => item.id), resourceIds: editing.resources.map(item => item.resourceId) }} error={errorMessage(query.error)} /></EntityListPage>;

  return <EntityListPage title="Услуги" description="Цена, длительность, специалисты и ресурсы для записи клиентов." action={<LinkButton href="/dashboard/settings/services?action=new">Создать услугу</LinkButton>} notice={noticeMessage(query.notice)} error={errorMessage(query.error)}>
    {items.length ? <div className="entity-list">{items.map(item => <article key={item.id} className={item.archivedAt ? "is-archived" : undefined}><div className="entity-list-main"><div><strong>{item.name}</strong><StatusBadge tone={item.archivedAt ? "neutral" : item.isPublished ? "success" : "warning"}>{item.archivedAt ? "В архиве" : item.isPublished ? "Опубликована" : "Черновик"}</StatusBadge></div><span>{item.branch.name} · {item.durationMinutes} мин · {formatSomoni(item.amountDiram)}</span><small>{item.staffMembers.length ? item.staffMembers.map(person => person.displayName).join(", ") : "Специалист не назначен"}{item.resources.length ? ` · ${item.resources.map(({ resource }) => resource.name).join(", ")}` : ""}</small></div><div className="entity-row-actions">{item.archivedAt ? <form action={restore}><input type="hidden" name="serviceId" value={item.id} /><SubmitButton idle="Восстановить" pending="Восстанавливаем" variant="secondary" /></form> : <><form action={duplicate}><input type="hidden" name="serviceId" value={item.id} /><SubmitButton idle="Дублировать" pending="Копируем" variant="secondary" /></form><Link className="ui-button ui-button-quiet" href={`/dashboard/settings/services?edit=${item.id}`}>Изменить</Link><Link className="ui-button ui-button-quiet entity-archive-link" href={`/dashboard/settings/services?archive=${item.id}`}>Архивировать</Link></>}</div></article>)}</div> : <EmptyState title="Добавьте первую услугу" description="Клиент увидит её на странице записи после публикации." action={<LinkButton href="/dashboard/settings/services?action=new">Создать услугу</LinkButton>} />}
    <Dialog open={Boolean(archiving)} title={`Архивировать ${archiving?.name ?? "услугу"}?`} description="Услуга исчезнет из новой записи, а история визитов сохранится."><LinkButton variant="quiet" href="/dashboard/settings/services">Оставить услугу</LinkButton>{archiving ? <form action={archive}><input type="hidden" name="serviceId" value={archiving.id} /><SubmitButton idle="Архивировать услугу" pending="Архивируем" variant="danger" /></form> : null}</Dialog>
  </EntityListPage>;
}

function serviceValues(formData: FormData) { return { branchId: String(formData.get("branchId") ?? ""), name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? ""), durationMinutes: String(formData.get("durationMinutes") ?? ""), amountSomoni: String(formData.get("amountSomoni") ?? ""), staffIds: formData.getAll("staffIds").map(String), resourceIds: formData.getAll("resourceIds").map(String), isPublished: formData.get("isPublished") === "true" }; }
function errorCode(error: unknown) { return error instanceof SettingsError ? error.code : "INVALID_INPUT"; }
function errorMessage(code?: string) { return ({ INVALID_INPUT: "Проверьте поля и выбирайте сотрудников и ресурсы из филиала услуги.", CANNOT_PUBLISH: "Для публикации назначьте специалиста и настройте рабочий график.", FUTURE_BOOKINGS: "Сначала перенесите или отмените будущие записи на эту услугу.", NOT_FOUND: "Услуга не найдена или уже недоступна." } as Record<string, string>)[code ?? ""]; }
function noticeMessage(code?: string) { return ({ created: "Услуга создана", updated: "Изменения сохранены", archived: "Услуга архивирована", restored: "Услуга восстановлена", duplicated: "Создана копия услуги" } as Record<string, string>)[code ?? ""]; }
