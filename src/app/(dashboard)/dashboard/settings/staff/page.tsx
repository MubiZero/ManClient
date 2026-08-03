import { MoreHorizontal } from "lucide-react";
import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { SettingsError } from "@/core/business-settings/settings-error";
import { archiveStaff, createStaff, restoreStaff, updateStaff } from "@/core/business-settings/staff-service";
import { prisma } from "@/core/database/prisma";
import { businessHasFeature } from "@/core/platform/subscription-plans";
import { ArchiveConfirmDialog } from "@/features/dashboard/archive-confirm-dialog";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { SettingsSheet } from "@/features/dashboard/settings-sheet";
import { StaffForm } from "@/features/dashboard/staff-form";
import { Badge } from "@/features/ui-kit/badge";
import { ButtonLink } from "@/features/ui-kit/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/features/ui-kit/dropdown-menu";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

type PageProps = { searchParams: Promise<{ action?: string; edit?: string; archive?: string; error?: string; notice?: string }> };

export default async function StaffPage({ searchParams }: PageProps) {
  const member = await requireBusinessAdmin();
  const commissionEnabled = businessHasFeature(member.business.subscriptionPlan, "STAFF_COMMISSIONS");
  const query = await searchParams;
  const [items, branches, services] = await Promise.all([
    prisma.staffMember.findMany({ where: { businessId: member.businessId }, include: { membership: true, branches: { include: { branch: true }, orderBy: { isPrimary: "desc" } }, services: true }, orderBy: [{ archivedAt: "asc" }, { displayName: "asc" }] }),
    prisma.branch.findMany({ where: { businessId: member.businessId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.service.findMany({ where: { branch: { businessId: member.businessId }, archivedAt: null }, select: { id: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
  ]);
  const editing = query.edit ? items.find((item) => item.id === query.edit) : undefined;
  const archiving = query.archive ? items.find((item) => item.id === query.archive && !item.archivedAt) : undefined;
  const editingPrimary = editing?.branches.find((item) => item.isPrimary) ?? editing?.branches[0];

  async function create(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); try { await createStaff({ businessId: current.businessId, actorUserId: current.userId, ...staffValues(formData) }); } catch (error) { redirect(`/dashboard/settings/staff?action=new&error=${errorCode(error)}`); } redirect("/dashboard/settings/staff?notice=created"); }
  async function update(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); const staffId = String(formData.get("staffId") ?? ""); try { await updateStaff({ businessId: current.businessId, actorUserId: current.userId, staffId, ...staffValues(formData) }); } catch (error) { redirect(`/dashboard/settings/staff?edit=${encodeURIComponent(staffId)}&error=${errorCode(error)}`); } redirect("/dashboard/settings/staff?notice=updated"); }
  async function archive(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); try { await archiveStaff({ businessId: current.businessId, actorUserId: current.userId, staffId: String(formData.get("staffId") ?? "") }); } catch (error) { redirect(`/dashboard/settings/staff?error=${errorCode(error)}`); } redirect("/dashboard/settings/staff?notice=archived"); }
  async function restore(formData: FormData) { "use server"; const current = await requireBusinessAdmin(); await restoreStaff({ businessId: current.businessId, actorUserId: current.userId, staffId: String(formData.get("staffId") ?? "") }); redirect("/dashboard/settings/staff?notice=restored"); }

  return (
    <EntityListPage
      title="Команда"
      description="Специалисты, филиалы и услуги, по которым они принимают клиентов."
      action={
        <div className="flex gap-2">
          <ButtonLink href="/api/dashboard/export/staff" variant="secondary">
            Экспорт CSV
          </ButtonLink>
          <ButtonLink href="/dashboard/settings/staff?action=new">Создать специалиста</ButtonLink>
        </div>
      }
      notice={noticeMessage(query.notice)}
      error={query.edit || query.action ? undefined : errorMessage(query.error)}
    >
      {items.length === 0 ? (
        <EmptyState title="Добавьте первого специалиста" description="Назначьте его на филиал и услугу, чтобы открыть запись." action={<ButtonLink href="/dashboard/settings/staff?action=new">Создать специалиста</ButtonLink>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Специалист</TableHead>
              <TableHead>Филиалы</TableHead>
              <TableHead>Услуги</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-foreground">{item.displayName}</TableCell>
                <TableCell className="text-muted-foreground">{item.branches.map(({ branch }) => branch.name).join(", ") || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{item.services.length ? item.services.map((service) => service.name).join(", ") : "Не назначены"}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={item.archivedAt ? "neutral" : "success"}>{item.archivedAt ? "В архиве" : "Принимает"}</Badge>
                    <Badge variant={item.membership ? "info" : "neutral"}>{item.membership ? "Есть доступ" : "Без доступа"}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {item.archivedAt ? (
                    <form action={restore}>
                      <input type="hidden" name="staffId" value={item.id} />
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
                          <a href={`/dashboard/settings/staff?edit=${item.id}`}>Изменить</a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/dashboard/settings/staff?archive=${item.id}`} className="text-destructive">
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

      <SettingsSheet open={query.action === "new"} closeHref="/dashboard/settings/staff" title="Новый специалист" visuallyHiddenTitle>
        <StaffForm action={create} branches={branches} services={services} error={errorMessage(query.error)} commissionEnabled={commissionEnabled} />
      </SettingsSheet>
      <SettingsSheet open={Boolean(editing)} closeHref="/dashboard/settings/staff" title="Изменить специалиста" visuallyHiddenTitle>
        {editing ? (
          <StaffForm
            action={update}
            branches={branches}
            services={services}
            staff={{ id: editing.id, displayName: editing.displayName, phone: editing.phone, branchIds: editing.branches.map((item) => item.branchId), primaryBranchId: editingPrimary?.branchId ?? branches[0]?.id ?? "", serviceIds: editing.services.map((item) => item.id), commissionPercent: editing.commissionPercent }}
            error={errorMessage(query.error)}
            commissionEnabled={commissionEnabled}
          />
        ) : null}
      </SettingsSheet>

      <ArchiveConfirmDialog
        open={Boolean(archiving)}
        closeHref="/dashboard/settings/staff"
        title={`Архивировать ${archiving?.displayName ?? "специалиста"}?`}
        description="Новые клиенты не смогут выбрать специалиста, а история визитов сохранится."
        action={archive}
        entityIdField="staffId"
        entityId={archiving?.id}
        confirmLabel="Архивировать специалиста"
      />
    </EntityListPage>
  );
}

function staffValues(formData: FormData) { const commissionRaw = String(formData.get("commissionPercent") ?? "").trim(); return { displayName: String(formData.get("displayName") ?? ""), phone: String(formData.get("phone") ?? ""), branchIds: formData.getAll("branchIds").map(String), primaryBranchId: String(formData.get("primaryBranchId") ?? ""), serviceIds: formData.getAll("serviceIds").map(String), commissionPercent: commissionRaw === "" ? null : commissionRaw }; }
function errorCode(error: unknown) { return error instanceof SettingsError ? error.code : "INVALID_INPUT"; }
function errorMessage(code?: string) { return ({ INVALID_INPUT: "Выберите хотя бы один филиал и убедитесь, что основной филиал отмечен.", FUTURE_BOOKINGS: "Сначала перенесите или отмените будущие записи специалиста.", NOT_FOUND: "Специалист не найден или уже недоступен." } as Record<string, string>)[code ?? ""]; }
function noticeMessage(code?: string) { return ({ created: "Специалист создан", updated: "Изменения сохранены", archived: "Специалист архивирован", restored: "Специалист восстановлен" } as Record<string, string>)[code ?? ""]; }
