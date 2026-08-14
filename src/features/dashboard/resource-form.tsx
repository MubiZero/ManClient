import { ButtonLink } from "@/features/ui-kit/button";
import { Checkbox } from "@/features/ui-kit/checkbox";
import { Field, Input, Select } from "@/features/ui-kit/field";
import { SubmitButton } from "@/features/ui-kit/submit-button";

type BranchOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; branchId: string };
type ResourceValue = { id: string; branchId: string; name: string; kind: string; capacity: number; isAvailable: boolean; serviceIds: string[] };

export function ResourceForm({ action, branches, services, resource, error, fieldErrors }: { action: (formData: FormData) => void | Promise<void>; branches: BranchOption[]; services: ServiceOption[]; resource?: ResourceValue; error?: string; fieldErrors?: Record<string, string> }) {
  const editing = Boolean(resource);
  return (
    <form className="flex flex-col gap-6" action={action}>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{editing ? "Редактирование" : "Новый ресурс"}</p>
        <h2 className="text-xl font-semibold text-foreground">{resource?.name ?? "Создать ресурс"}</h2>
        <p className="text-sm text-muted-foreground">Ресурс бронируется вместе с услугой и не может быть занят двумя клиентами одновременно.</p>
      </div>
      {resource ? <input type="hidden" name="resourceId" value={resource.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Название ресурса" error={fieldErrors?.name}><Input name="name" required minLength={2} maxLength={120} defaultValue={resource?.name} /></Field>
        <Field label="Филиал" error={fieldErrors?.branchId}>
          <Select name="branchId" defaultValue={resource?.branchId ?? branches[0]?.id}>
            {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Тип ресурса" error={fieldErrors?.kind}>
          <Select name="kind" defaultValue={resource?.kind ?? "OTHER"}>
            <option value="WORKSTATION">Рабочее место</option>
            <option value="ROOM">Кабинет или комната</option>
            <option value="LIFT">Подъёмник</option>
            <option value="EQUIPMENT">Оборудование</option>
            <option value="OTHER">Другое</option>
          </Select>
        </Field>
        <Field label="Вместимость" error={fieldErrors?.capacity}><Input name="capacity" type="number" min={1} max={100} required defaultValue={resource?.capacity ?? 1} /></Field>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-4">
        <legend className="px-1.5 text-sm font-semibold text-foreground">Услуги</legend>
        {services.length ? services.map((item) => (
          <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 dark:has-[:checked]:bg-brand-950/40">
            <Checkbox name="serviceIds" value={item.id} defaultChecked={resource?.serviceIds.includes(item.id)} />
            <span>{item.name}</span>
          </label>
        )) : <p className="text-sm text-muted-foreground">Услуги можно связать позже.</p>}
      </fieldset>
      <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-md bg-secondary px-4 py-3.5">
        <Checkbox name="isAvailable" value="true" defaultChecked={resource?.isAvailable ?? true} />
        <span className="flex flex-col gap-0.5">
          <strong className="font-medium text-foreground">Доступен для записи</strong>
          <small className="text-xs text-muted-foreground">Отключите временно, если ресурс на ремонте или недоступен.</small>
        </span>
      </label>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <ButtonLink variant="quiet" href="/dashboard/settings/resources">Вернуться к ресурсам</ButtonLink>
        <SubmitButton idle={editing ? "Сохранить ресурс" : "Создать ресурс"} pending={editing ? "Сохраняем ресурс" : "Создаём ресурс"} />
      </div>
    </form>
  );
}
