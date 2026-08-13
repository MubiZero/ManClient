import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { archiveBranch, createBranch, restoreBranch, updateBranch } from "@/core/business-settings/branch-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { BranchForm } from "@/features/dashboard/branch-form";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { SettingsSheet } from "@/features/dashboard/settings-sheet";
import { ArchiveConfirmDialog } from "@/features/dashboard/archive-confirm-dialog";
import { Badge } from "@/features/ui-kit/badge";
import { ButtonLink } from "@/features/ui-kit/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/features/ui-kit/dropdown-menu";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";
import { MoreHorizontal } from "lucide-react";

type BranchesPageProps = { searchParams: Promise<{ action?: string; edit?: string; archive?: string; error?: string; notice?: string }> };

export default async function BranchesPage({ searchParams }: BranchesPageProps) {
  const member = await requireBusinessAdmin();
  const query = await searchParams;
  // Explicit selection: the encrypted card has no business leaving the database for a page that only
  // ever shows four digits of it.
  const branches = await prisma.branch.findMany({
    where: { businessId: member.businessId },
    select: { id: true, name: true, address: true, phone: true, timeZone: true, archivedAt: true, recipientCardLast4: true },
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
  });
  const editing = query.edit ? branches.find((item) => item.id === query.edit) : undefined;
  const archiving = query.archive ? branches.find((item) => item.id === query.archive && !item.archivedAt) : undefined;

  async function create(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    try {
      await createBranch({ businessId: current.businessId, actorUserId: current.userId, ...branchValues(formData) });
    } catch (error) {
      redirect(`/dashboard/settings/branches?action=new&error=${errorCode(error)}`);
    }
    redirect("/dashboard/settings/branches?notice=created");
  }

  async function update(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const branchId = String(formData.get("branchId") ?? "");
    try {
      await updateBranch({ businessId: current.businessId, actorUserId: current.userId, branchId, ...branchValues(formData) });
    } catch (error) {
      redirect(`/dashboard/settings/branches?edit=${encodeURIComponent(branchId)}&error=${errorCode(error)}`);
    }
    redirect("/dashboard/settings/branches?notice=updated");
  }

  async function archive(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const branchId = String(formData.get("branchId") ?? "");
    try {
      await archiveBranch({ businessId: current.businessId, actorUserId: current.userId, branchId });
    } catch (error) {
      redirect(`/dashboard/settings/branches?error=${errorCode(error)}`);
    }
    redirect("/dashboard/settings/branches?notice=archived");
  }

  async function restore(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    await restoreBranch({ businessId: current.businessId, actorUserId: current.userId, branchId: String(formData.get("branchId") ?? "") });
    redirect("/dashboard/settings/branches?notice=restored");
  }

  return (
    <EntityListPage
      title="Филиалы"
      description="Точки бизнеса, их контакты, часовой пояс и состояние оплаты."
      action={<ButtonLink href="/dashboard/settings/branches?action=new">Создать филиал</ButtonLink>}
      notice={messageForNotice(query.notice)}
      error={query.edit || query.action ? undefined : messageForError(query.error)}
    >
      {branches.length === 0 ? (
        <EmptyState title="Создайте первый филиал" description="После этого можно добавить услуги, специалистов и расписание." action={<ButtonLink href="/dashboard/settings/branches?action=new">Создать филиал</ButtonLink>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Филиал</TableHead>
              <TableHead>Контакты</TableHead>
              <TableHead>Часовой пояс</TableHead>
              <TableHead>Карта</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {item.address || "Адрес не указан"}
                  <br />
                  <span className="text-xs">{item.phone || "Телефон не указан"}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{item.timeZone}</TableCell>
                <TableCell className="text-muted-foreground">{item.recipientCardLast4 ? `•••• ${item.recipientCardLast4}` : "Не задана"}</TableCell>
                <TableCell>
                  <Badge variant={item.archivedAt ? "neutral" : "success"}>{item.archivedAt ? "В архиве" : "Работает"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {item.archivedAt ? (
                    <form action={restore}>
                      <input type="hidden" name="branchId" value={item.id} />
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
                          <a href={`/dashboard/settings/branches?edit=${item.id}`}>Изменить</a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/dashboard/settings/branches?archive=${item.id}`} className="text-destructive">
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

      <SettingsSheet open={query.action === "new"} closeHref="/dashboard/settings/branches" title="Новый филиал" visuallyHiddenTitle>
        <BranchForm action={create} error={messageForError(query.error)} />
      </SettingsSheet>
      <SettingsSheet open={Boolean(editing)} closeHref="/dashboard/settings/branches" title="Изменить филиал" visuallyHiddenTitle>
        {editing ? <BranchForm action={update} branch={editing} error={messageForError(query.error)} /> : null}
      </SettingsSheet>

      <ArchiveConfirmDialog
        open={Boolean(archiving)}
        closeHref="/dashboard/settings/branches"
        title={`Архивировать ${archiving?.name ?? "филиал"}?`}
        description="Филиал исчезнет из записи клиентов, но история визитов сохранится."
        action={archive}
        entityIdField="branchId"
        entityId={archiving?.id}
        confirmLabel="Архивировать филиал"
      />
    </EntityListPage>
  );
}

function branchValues(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    timeZone: String(formData.get("timeZone") ?? "Asia/Dushanbe"),
    recipientCard: String(formData.get("recipientCard") ?? ""),
  };
}

function errorCode(error: unknown) { return error instanceof SettingsError ? error.code : "INVALID_INPUT"; }
function messageForNotice(code?: string) { return ({ created: "Филиал создан", updated: "Изменения сохранены", archived: "Филиал архивирован", restored: "Филиал восстановлен" } as Record<string, string>)[code ?? ""]; }
function messageForError(code?: string) { return ({ INVALID_INPUT: "Проверьте название, телефон и остальные поля. Карта — 16 цифр.",FUTURE_BOOKINGS: "Сначала перенесите или отмените будущие записи этого филиала.", LAST_ACTIVE_BRANCH: "Нельзя архивировать единственный работающий филиал.", NOT_FOUND: "Филиал не найден или уже недоступен." } as Record<string, string>)[code ?? ""]; }
