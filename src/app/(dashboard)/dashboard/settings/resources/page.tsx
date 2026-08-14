import { MoreHorizontal } from "lucide-react";
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
import { errorSearchParams, fieldErrorMap } from "@/features/dashboard/form-error";
import { ArchiveConfirmDialog } from "@/features/dashboard/archive-confirm-dialog";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { ResourceForm } from "@/features/dashboard/resource-form";
import { SettingsSheet } from "@/features/dashboard/settings-sheet";
import { Badge } from "@/features/ui-kit/badge";
import { ButtonLink } from "@/features/ui-kit/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/features/ui-kit/dropdown-menu";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

type PageProps = {
  searchParams: Promise<{
    action?: string;
    edit?: string;
    archive?: string;
    error?: string;
    field?: string;
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
  const formError = errorMessage(query.error);
  const formFieldErrors = fieldErrorMap(query.field, formError);
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
      redirect(`/dashboard/settings/resources?action=new&${errorSearchParams(errorCode(error), error)}`);
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
      redirect(`/dashboard/settings/resources?edit=${encodeURIComponent(resourceId)}&${errorSearchParams(errorCode(error), error)}`);
    }
    redirect("/dashboard/settings/resources?notice=updated");
  }

  async function archive(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    try {
      await archiveResource({ businessId: current.businessId, actorUserId: current.userId, resourceId: String(formData.get("resourceId") ?? "") });
    } catch (error) {
      redirect(`/dashboard/settings/resources?${errorSearchParams(errorCode(error), error)}`);
    }
    redirect("/dashboard/settings/resources?notice=archived");
  }

  async function restore(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    await restoreResource({ businessId: current.businessId, actorUserId: current.userId, resourceId: String(formData.get("resourceId") ?? "") });
    redirect("/dashboard/settings/resources?notice=restored");
  }

  return (
    <EntityListPage
      title="Ресурсы"
      description="Рабочие места и оборудование, занятость которых ManClient учитывает при записи."
      action={<ButtonLink href="/dashboard/settings/resources?action=new">Создать ресурс</ButtonLink>}
      notice={noticeMessage(query.notice)}
      error={query.edit || query.action ? undefined : errorMessage(query.error)}
    >
      {items.length === 0 ? (
        <EmptyState
          title="Добавьте первый ресурс"
          description="Ресурсы необязательны для специалиста, но нужны для боксов, кабинетов и оборудования."
          action={<ButtonLink href="/dashboard/settings/resources?action=new">Создать ресурс</ButtonLink>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ресурс</TableHead>
              <TableHead>Филиал и тип</TableHead>
              <TableHead>Услуги</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {item.branch.name} · {resourceKindLabels[item.kind]} · вместимость {item.capacity}
                </TableCell>
                <TableCell className="text-muted-foreground">{item.services.length ? item.services.map(({ service }) => service.name).join(", ") : "Не связаны"}</TableCell>
                <TableCell>
                  <Badge variant={item.archivedAt ? "neutral" : item.isAvailable ? "success" : "warning"}>
                    {item.archivedAt ? "В архиве" : item.isAvailable ? "Доступен" : "Недоступен"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {item.archivedAt ? (
                    <form action={restore}>
                      <input type="hidden" name="resourceId" value={item.id} />
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
                          <a href={`/dashboard/settings/resources?edit=${item.id}`}>Изменить</a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/dashboard/settings/resources?archive=${item.id}`} className="text-destructive">
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

      <SettingsSheet open={query.action === "new"} closeHref="/dashboard/settings/resources" title="Новый ресурс" visuallyHiddenTitle>
        <ResourceForm action={create} branches={branches} services={services} error={formFieldErrors ? undefined : formError} fieldErrors={formFieldErrors} />
      </SettingsSheet>
      <SettingsSheet open={Boolean(editing)} closeHref="/dashboard/settings/resources" title="Изменить ресурс" visuallyHiddenTitle>
        {editing ? (
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
            error={formFieldErrors ? undefined : formError} fieldErrors={formFieldErrors}
          />
        ) : null}
      </SettingsSheet>

      <ArchiveConfirmDialog
        open={Boolean(archiving)}
        closeHref="/dashboard/settings/resources"
        title={`Архивировать ${archiving?.name ?? "ресурс"}?`}
        description="Ресурс перестанет участвовать в новой записи, а история визитов сохранится."
        action={archive}
        entityIdField="resourceId"
        entityId={archiving?.id}
        confirmLabel="Архивировать ресурс"
      />
    </EntityListPage>
  );
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
