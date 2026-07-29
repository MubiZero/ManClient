import Link from "next/link";
import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import {
  archiveResource,
  createResource,
  restoreResource,
  updateResource,
} from "@/core/business-settings/resource-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { ResourceForm } from "@/features/dashboard/resource-form";
import { LinkButton } from "@/features/ui/button";
import { Dialog } from "@/features/ui/dialog";
import { EmptyState } from "@/features/ui/empty-state";
import { StatusBadge } from "@/features/ui/status-badge";
import { SubmitButton } from "@/features/ui/submit-button";

type PageProps = {
  searchParams: Promise<{
    action?: string;
    edit?: string;
    archive?: string;
    error?: string;
    notice?: string;
  }>;
};

const resourceKindLabels: Record<string, string> = {
  WORKSTATION: "Рабочее место",
  ROOM: "Кабинет или комната",
  LIFT: "Подъёмник",
  EQUIPMENT: "Оборудование",
  OTHER: "Другое",
};

export default async function ResourcesPage({ searchParams }: PageProps) {
  const member = await requireBusinessAdmin();
  const query = await searchParams;
  const [items, branches, services] = await Promise.all([
    prisma.resource.findMany({
      where: { branch: { businessId: member.businessId } },
      include: { branch: true, services: { include: { service: true } } },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    }),
    prisma.branch.findMany({
      where: { businessId: member.businessId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { branch: { businessId: member.businessId }, archivedAt: null },
      select: { id: true, name: true, branchId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const editing = query.edit ? items.find((item) => item.id === query.edit) : undefined;
  const archiving = query.archive
    ? items.find((item) => item.id === query.archive && !item.archivedAt)
    : undefined;

  async function create(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    try {
      await createResource({ businessId: current.businessId, actorUserId: current.userId, ...resourceValues(formData) });
    } catch (error) {
      redirect(`/dashboard/settings/resources?action=new&error=${errorCode(error)}`);
    }
    redirect("/dashboard/settings/resources?notice=created");
  }

  async function update(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const resourceId = String(formData.get("resourceId") ?? "");
    try {
      await updateResource({ businessId: current.businessId, actorUserId: current.userId, resourceId, ...resourceValues(formData) });
    } catch (error) {
      redirect(`/dashboard/settings/resources?edit=${encodeURIComponent(resourceId)}&error=${errorCode(error)}`);
    }
    redirect("/dashboard/settings/resources?notice=updated");
  }

  async function archive(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    try {
      await archiveResource({ businessId: current.businessId, actorUserId: current.userId, resourceId: String(formData.get("resourceId") ?? "") });
    } catch (error) {
      redirect(`/dashboard/settings/resources?error=${errorCode(error)}`);
    }
    redirect("/dashboard/settings/resources?notice=archived");
  }

  async function restore(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    await restoreResource({ businessId: current.businessId, actorUserId: current.userId, resourceId: String(formData.get("resourceId") ?? "") });
    redirect("/dashboard/settings/resources?notice=restored");
  }

  if (query.action === "new") {
    return <EntityListPage title="Новый ресурс" description="Добавьте рабочее место, кабинет или оборудование, которое нельзя занять дважды.">
      <ResourceForm action={create} branches={branches} services={services} error={errorMessage(query.error)} />
    </EntityListPage>;
  }

  if (editing) {
    return <EntityListPage title="Изменить ресурс" description="Обновите филиал, вместимость, доступность и связанные услуги.">
      <ResourceForm
        action={update}
        branches={branches}
        services={services}
        resource={{
          id: editing.id,
          branchId: editing.branchId,
          name: editing.name,
          kind: editing.kind,
          capacity: editing.capacity,
          isAvailable: editing.isAvailable,
          serviceIds: editing.services.map((item) => item.serviceId),
        }}
        error={errorMessage(query.error)}
      />
    </EntityListPage>;
  }

  return <EntityListPage
    title="Ресурсы"
    description="Рабочие места и оборудование, занятость которых ManClient учитывает при записи."
    action={<LinkButton href="/dashboard/settings/resources?action=new">Создать ресурс</LinkButton>}
    notice={noticeMessage(query.notice)}
    error={errorMessage(query.error)}
  >
    {items.length ? <div className="entity-list">
      {items.map((item) => <article key={item.id} className={item.archivedAt ? "is-archived" : undefined}>
        <div className="entity-list-main">
          <div>
            <strong>{item.name}</strong>
            <StatusBadge tone={item.archivedAt ? "neutral" : item.isAvailable ? "success" : "warning"}>
              {item.archivedAt ? "В архиве" : item.isAvailable ? "Доступен" : "Недоступен"}
            </StatusBadge>
          </div>
          <span>{item.branch.name} · {resourceKindLabels[item.kind]} · вместимость {item.capacity}</span>
          <small>{item.services.length ? item.services.map(({ service }) => service.name).join(", ") : "Услуги пока не связаны"}</small>
        </div>
        <div className="entity-row-actions">
          {item.archivedAt ? <form action={restore}>
            <input type="hidden" name="resourceId" value={item.id} />
            <SubmitButton idle="Восстановить" pending="Восстанавливаем" variant="secondary" />
          </form> : <>
            <Link className="ui-button ui-button-quiet" href={`/dashboard/settings/resources?edit=${item.id}`}>Изменить</Link>
            <Link className="ui-button ui-button-quiet entity-archive-link" href={`/dashboard/settings/resources?archive=${item.id}`}>Архивировать</Link>
          </>}
        </div>
      </article>)}
    </div> : <EmptyState
      title="Добавьте первый ресурс"
      description="Ресурсы необязательны для специалиста, но нужны для боксов, кабинетов и оборудования."
      action={<LinkButton href="/dashboard/settings/resources?action=new">Создать ресурс</LinkButton>}
    />}
    <Dialog
      open={Boolean(archiving)}
      title={`Архивировать ${archiving?.name ?? "ресурс"}?`}
      description="Ресурс перестанет участвовать в новой записи, а история визитов сохранится."
    >
      <LinkButton variant="quiet" href="/dashboard/settings/resources">Оставить ресурс</LinkButton>
      {archiving ? <form action={archive}>
        <input type="hidden" name="resourceId" value={archiving.id} />
        <SubmitButton idle="Архивировать ресурс" pending="Архивируем" variant="danger" />
      </form> : null}
    </Dialog>
  </EntityListPage>;
}

function resourceValues(formData: FormData) {
  return {
    branchId: String(formData.get("branchId") ?? ""),
    name: String(formData.get("name") ?? ""),
    kind: String(formData.get("kind") ?? "OTHER") as "WORKSTATION" | "ROOM" | "LIFT" | "EQUIPMENT" | "OTHER",
    capacity: String(formData.get("capacity") ?? ""),
    isAvailable: formData.get("isAvailable") === "true",
    serviceIds: formData.getAll("serviceIds").map(String),
  };
}

function errorCode(error: unknown) {
  return error instanceof SettingsError ? error.code : "INVALID_INPUT";
}

function errorMessage(code?: string) {
  return ({
    INVALID_INPUT: "Проверьте поля и выбирайте услуги из того же филиала, что и ресурс.",
    FUTURE_BOOKINGS: "Сначала перенесите или отмените будущие записи с этим ресурсом.",
    NOT_FOUND: "Ресурс не найден или уже недоступен.",
  } as Record<string, string>)[code ?? ""];
}

function noticeMessage(code?: string) {
  return ({
    created: "Ресурс создан",
    updated: "Изменения сохранены",
    archived: "Ресурс архивирован",
    restored: "Ресурс восстановлен",
  } as Record<string, string>)[code ?? ""];
}
