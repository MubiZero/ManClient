import Link from "next/link";
import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { archiveBranch, createBranch, restoreBranch, updateBranch } from "@/core/business-settings/branch-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { BranchForm } from "@/features/dashboard/branch-form";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { Dialog } from "@/features/ui/dialog";
import { EmptyState } from "@/features/ui/empty-state";
import { LinkButton } from "@/features/ui/button";
import { StatusBadge } from "@/features/ui/status-badge";
import { SubmitButton } from "@/features/ui/submit-button";

type BranchesPageProps = { searchParams: Promise<{ action?: string; edit?: string; archive?: string; error?: string; notice?: string }> };

export default async function BranchesPage({ searchParams }: BranchesPageProps) {
  const member = await requireBusinessAdmin();
  const query = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: member.businessId }, orderBy: [{ archivedAt: "asc" }, { name: "asc" }] });
  const editing = query.edit ? branches.find(item => item.id === query.edit) : undefined;
  const archiving = query.archive ? branches.find(item => item.id === query.archive && !item.archivedAt) : undefined;

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

  if (query.action === "new") return <EntityListPage title="Новый филиал" description="Добавьте ещё одну точку бизнеса."><BranchForm action={create} error={messageForError(query.error)} /></EntityListPage>;
  if (editing) return <EntityListPage title="Изменить филиал" description="Обновите контактные данные и название точки."><BranchForm action={update} branch={editing} error={messageForError(query.error)} /></EntityListPage>;

  return (
    <EntityListPage title="Филиалы" description="Точки бизнеса, их контакты, часовой пояс и состояние оплаты." action={<LinkButton href="/dashboard/settings/branches?action=new">Создать филиал</LinkButton>} notice={messageForNotice(query.notice)} error={messageForError(query.error)}>
      {branches.length ? <div className="entity-list">{branches.map(item => <article key={item.id} className={item.archivedAt ? "is-archived" : undefined}><div className="entity-list-main"><div><strong>{item.name}</strong><StatusBadge tone={item.archivedAt ? "neutral" : "success"}>{item.archivedAt ? "В архиве" : "Работает"}</StatusBadge></div><span>{item.address || "Адрес пока не указан"}</span><small>{item.phone || "Телефон не указан"} · {item.timeZone}</small></div><div className="entity-row-actions">{item.archivedAt ? <form action={restore}><input type="hidden" name="branchId" value={item.id} /><SubmitButton idle="Восстановить" pending="Восстанавливаем" variant="secondary" /></form> : <><Link className="ui-button ui-button-quiet" href={`/dashboard/settings/branches?edit=${item.id}`}>Изменить</Link><Link className="ui-button ui-button-quiet entity-archive-link" href={`/dashboard/settings/branches?archive=${item.id}`}>Архивировать</Link></>}</div></article>)}</div> : <EmptyState title="Создайте первый филиал" description="После этого можно добавить услуги, специалистов и расписание." action={<LinkButton href="/dashboard/settings/branches?action=new">Создать филиал</LinkButton>} />}
      <Dialog open={Boolean(archiving)} title={`Архивировать ${archiving?.name ?? "филиал"}?`} description="Филиал исчезнет из записи клиентов, но история визитов сохранится."><LinkButton variant="quiet" href="/dashboard/settings/branches">Оставить филиал</LinkButton>{archiving ? <form action={archive}><input type="hidden" name="branchId" value={archiving.id} /><SubmitButton idle="Архивировать филиал" pending="Архивируем" variant="danger" /></form> : null}</Dialog>
    </EntityListPage>
  );
}

function branchValues(formData: FormData) {
  return { name: String(formData.get("name") ?? ""), address: String(formData.get("address") ?? ""), phone: String(formData.get("phone") ?? ""), timeZone: String(formData.get("timeZone") ?? "Asia/Dushanbe") };
}

function errorCode(error: unknown) { return error instanceof SettingsError ? error.code : "INVALID_INPUT"; }
function messageForNotice(code?: string) { return ({ created: "Филиал создан", updated: "Изменения сохранены", archived: "Филиал архивирован", restored: "Филиал восстановлен" } as Record<string, string>)[code ?? ""]; }
function messageForError(code?: string) { return ({ INVALID_INPUT: "Проверьте название, телефон и остальные поля.", FUTURE_BOOKINGS: "Сначала перенесите или отмените будущие записи этого филиала.", LAST_ACTIVE_BRANCH: "Нельзя архивировать единственный работающий филиал.", NOT_FOUND: "Филиал не найден или уже недоступен." } as Record<string, string>)[code ?? ""]; }
