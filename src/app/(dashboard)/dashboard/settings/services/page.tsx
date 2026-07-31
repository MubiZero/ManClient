import { MoreHorizontal } from "lucide-react";
import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { archiveService, createService, duplicateService, restoreService, updateService } from "@/core/business-settings/service-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { formatSomoni } from "@/core/formatting/money";
import { ArchiveConfirmDialog } from "@/features/dashboard/archive-confirm-dialog";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { ServiceForm } from "@/features/dashboard/service-form";
import { SettingsSheet } from "@/features/dashboard/settings-sheet";
import { Badge } from "@/features/ui-kit/badge";
import { ButtonLink } from "@/features/ui-kit/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/features/ui-kit/dropdown-menu";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

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
  const editing = query.edit ? items.find((item) => item.id === query.edit) : undefined;
  const archiving = query.archive ? items.find((item) => item.id === query.archive && !item.archivedAt) : undefined;
  const formStaff = staff.map((item) => ({ id: item.id, displayName: item.displayName, branchNames: item.branches.map(({ branch }) => branch.name) }));

  async function create(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); try { await createService({ businessId: current.businessId, actorUserId: current.userId, ...serviceValues(formData) }); } catch (error) { redirect(`/dashboard/settings/services?action=new&error=${errorCode(error)}`); } redirect("/dashboard/settings/services?notice=created"); }
  async function update(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); const serviceId = String(formData.get("serviceId") ?? ""); try { await updateService({ businessId: current.businessId, actorUserId: current.userId, serviceId, ...serviceValues(formData) }); } catch (error) { redirect(`/dashboard/settings/services?edit=${encodeURIComponent(serviceId)}&error=${errorCode(error)}`); } redirect("/dashboard/settings/services?notice=updated"); }
  async function archive(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); try { await archiveService({ businessId: current.businessId, actorUserId: current.userId, serviceId: String(formData.get("serviceId") ?? "") }); } catch (error) { redirect(`/dashboard/settings/services?error=${errorCode(error)}`); } redirect("/dashboard/settings/services?notice=archived"); }
  async function restore(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); await restoreService({ businessId: current.businessId, actorUserId: current.userId, serviceId: String(formData.get("serviceId") ?? "") }); redirect("/dashboard/settings/services?notice=restored"); }
  async function duplicate(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); await duplicateService({ businessId: current.businessId, actorUserId: current.userId, serviceId: String(formData.get("serviceId") ?? "") }); redirect("/dashboard/settings/services?notice=duplicated"); }

  return (
    <EntityListPage
      title="Услуги"
      description="Цена, длительность, специалисты и ресурсы для записи клиентов."
      action={<ButtonLink href="/dashboard/settings/services?action=new">Создать услугу</ButtonLink>}
      notice={noticeMessage(query.notice)}
      error={query.edit || query.action ? undefined : errorMessage(query.error)}
    >
      {items.length === 0 ? (
        <EmptyState title="Добавьте первую услугу" description="Клиент увидит её на странице записи после публикации." action={<ButtonLink href="/dashboard/settings/services?action=new">Создать услугу</ButtonLink>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Услуга</TableHead>
              <TableHead>Филиал и цена</TableHead>
              <TableHead>Назначения</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {item.branch.name} · {item.durationMinutes} мин · {formatSomoni(item.amountDiram)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.staffMembers.length ? item.staffMembers.map((person) => person.displayName).join(", ") : "Специалист не назначен"}
                  {item.resources.length ? ` · ${item.resources.map(({ resource }) => resource.name).join(", ")}` : ""}
                </TableCell>
                <TableCell>
                  <Badge variant={item.archivedAt ? "neutral" : item.isPublished ? "success" : "warning"}>
                    {item.archivedAt ? "В архиве" : item.isPublished ? "Опубликована" : "Черновик"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {item.archivedAt ? (
                    <form action={restore}>
                      <input type="hidden" name="serviceId" value={item.id} />
                      <button type="submit" className="text-sm font-medium text-primary hover:underline">
                        Восстановить
                      </button>
                    </form>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded-md p-1.5 hover:bg-secondary" aria-label="Действия">
                        <MoreHorizontal className="size-4 text-muted-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={`/dashboard/settings/services?edit=${item.id}`}>Изменить</a>
                        </DropdownMenuItem>
                        <form action={duplicate}>
                          <input type="hidden" name="serviceId" value={item.id} />
                          <DropdownMenuItem asChild>
                            <button type="submit" className="w-full text-left">
                              Дублировать
                            </button>
                          </DropdownMenuItem>
                        </form>
                        <DropdownMenuItem asChild>
                          <a href={`/dashboard/settings/services?archive=${item.id}`} className="text-destructive">
                            Архивировать
                          </a>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SettingsSheet open={query.action === "new"} closeHref="/dashboard/settings/services" title="Новая услуга" visuallyHiddenTitle>
        <ServiceForm action={create} branches={branches} staff={formStaff} resources={resources} error={errorMessage(query.error)} />
      </SettingsSheet>
      <SettingsSheet open={Boolean(editing)} closeHref="/dashboard/settings/services" title="Изменить услугу" visuallyHiddenTitle>
        {editing ? (
          <ServiceForm
            action={update}
            branches={branches}
            staff={formStaff}
            resources={resources}
            service={{ id: editing.id, branchId: editing.branchId, name: editing.name, description: editing.description, durationMinutes: editing.durationMinutes, amountDiram: editing.amountDiram, isPublished: editing.isPublished, staffIds: editing.staffMembers.map((item) => item.id), resourceIds: editing.resources.map((item) => item.resourceId) }}
            error={errorMessage(query.error)}
          />
        ) : null}
      </SettingsSheet>

      <ArchiveConfirmDialog
        open={Boolean(archiving)}
        closeHref="/dashboard/settings/services"
        title={`Архивировать ${archiving?.name ?? "услугу"}?`}
        description="Услуга исчезнет из новой записи, а история визитов сохранится."
        action={archive}
        entityIdField="serviceId"
        entityId={archiving?.id}
        confirmLabel="Архивировать услугу"
      />
    </EntityListPage>
  );
}

function serviceValues(formData: FormData) { return { branchId: String(formData.get("branchId") ?? ""), name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? ""), durationMinutes: String(formData.get("durationMinutes") ?? ""), amountSomoni: String(formData.get("amountSomoni") ?? ""), staffIds: formData.getAll("staffIds").map(String), resourceIds: formData.getAll("resourceIds").map(String), isPublished: formData.get("isPublished") === "true" }; }
function errorCode(error: unknown) { return error instanceof SettingsError ? error.code : "INVALID_INPUT"; }
function errorMessage(code?: string) { return ({ INVALID_INPUT: "Проверьте поля и выбирайте сотрудников и ресурсы из филиала услуги.", CANNOT_PUBLISH: "Для публикации назначьте специалиста и настройте рабочий график.", FUTURE_BOOKINGS: "Сначала перенесите или отмените будущие записи на эту услугу.", NOT_FOUND: "Услуга не найдена или уже недоступна." } as Record<string, string>)[code ?? ""]; }
function noticeMessage(code?: string) { return ({ created: "Услуга создана", updated: "Изменения сохранены", archived: "Услуга архивирована", restored: "Услуга восстановлена", duplicated: "Создана копия услуги" } as Record<string, string>)[code ?? ""]; }
